package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"navix/server/db"
	"navix/server/services"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
)

type AuthHandler struct {
	CalendarService *services.GoogleCalendarService
	DB              *sql.DB
	FrontendURL     string
}

func (h *AuthHandler) LoginHandler(w http.ResponseWriter, r *http.Request) {
	// Try to get user from query first (explicitly passed by frontend)
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		// Fallback to cookie
		userID = getSessionUser(r)
	}
	if userID == "" {
		userID = "guest"
	}
	
	// AUTO-DETECT REDIRECT URI
	// If the request is coming in via HTTPS (on Render), use the current host.
	// This fixes issues where BASE_URL is not correctly set.
	redirectURI := h.CalendarService.Config.RedirectURL
	
	// If we are on production but the config says localhost, override it!
	currentHost := r.Host
	if !strings.Contains(redirectURI, "localhost") {
		// Already looks like a production URL, leave it.
	} else if currentHost != "" && !strings.Contains(currentHost, "localhost") {
		// We are on a real domain! Use it!
		scheme := "https"
		if r.TLS == nil && !strings.Contains(currentHost, "onrender.com") {
			// Local dev fallback if not on Render
		} else {
			redirectURI = fmt.Sprintf("%s://%s/api/auth/callback", scheme, currentHost)
		}
	}

	// Create a clone of the config with the dynamic redirect URI
	dynamicConfig := *h.CalendarService.Config
	dynamicConfig.RedirectURL = redirectURI

	fmt.Printf("🛠️ DYNAMIC AUTH: Using redirect_uri=%s for user %s\n", redirectURI, userID)

	url := dynamicConfig.AuthCodeURL(userID, oauth2.AccessTypeOffline)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func (h *AuthHandler) CallbackHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state") // The user_id we passed in
	if code == "" {
		http.Error(w, "Code not found", http.StatusBadRequest)
		return
	}

	// Dynamic Redirect URI Detection (must match LoginHandler)
	redirectURI := h.CalendarService.Config.RedirectURL
	currentHost := r.Host
	if strings.Contains(redirectURI, "localhost") && currentHost != "" && !strings.Contains(currentHost, "localhost") {
		redirectURI = fmt.Sprintf("https://%s/api/auth/callback", currentHost)
	}

	// Create a clone of the config with the dynamic redirect URI for the exchange
	dynamicConfig := *h.CalendarService.Config
	dynamicConfig.RedirectURL = redirectURI

	token, err := dynamicConfig.Exchange(context.Background(), code)
	if err != nil {
		fmt.Printf("🛠️ DYNAMIC AUTH ERROR: Exchange failed with redirect_uri=%s: %v\n", redirectURI, err)
		http.Error(w, fmt.Sprintf("Token exchange failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Persist token to database for the specific user
	if state != "" {
		if err := db.SaveToken(h.DB, state, token); err != nil {
			fmt.Printf("Warning: Failed to persist token for user %s: %v\n", state, err)
		}
	}

	// Redirect back to frontend calendar page
	http.Redirect(w, r, h.FrontendURL+"/calendar?auth=success", http.StatusTemporaryRedirect)
}

func (h *AuthHandler) GetToken(userID string) *oauth2.Token {
	if userID == "" {
		return nil
	}
	token, err := db.GetToken(h.DB, userID)
	if err != nil {
		fmt.Printf("Warning: Failed to get token for user %s: %v\n", userID, err)
		return nil
	}
	return token
}

func (h *AuthHandler) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	// Clear session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "navix_session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusOK)
}

// RegisterHandler creates a new user with a hashed password
func (h *AuthHandler) RegisterHandler(w http.ResponseWriter, r *http.Request) {
	var credentials struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&credentials); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(credentials.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	userID := uuid.New().String()
	_, err = h.DB.Exec("INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)", 
		userID, credentials.Username, string(hashedPassword))
	if err != nil {
		fmt.Printf("Registration error for user %s: %v\n", credentials.Username, err)
		if strings.Contains(err.Error(), "unique constraint") || strings.Contains(err.Error(), "40205") || strings.Contains(err.Error(), "23505") {
			http.Error(w, "That username is already taken. Try signing in instead!", http.StatusConflict)
		} else {
			http.Error(w, "Database error. Please ensure Postgres is running.", http.StatusInternalServerError)
		}
		return
	}

	// Set session cookie
	isProd := strings.HasPrefix(os.Getenv("BASE_URL"), "https")
	samesite := http.SameSiteLaxMode
	if isProd {
		samesite = http.SameSiteNoneMode
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "navix_session",
		Value:    userID,
		Path:     "/",
		HttpOnly: true,
		Secure:   isProd,
		SameSite: samesite,
		MaxAge:   3600 * 24 * 7,
	})

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"status":   "success",
		"username": credentials.Username,
		"user_id":  userID,
	})
}

// PasswordLoginHandler verifies credentials and returns a success status
func (h *AuthHandler) PasswordLoginHandler(w http.ResponseWriter, r *http.Request) {
	var credentials struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&credentials); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var storedHash string
	var userID string
	err := h.DB.QueryRow("SELECT id, password_hash FROM users WHERE username = $1", 
		credentials.Username).Scan(&userID, &storedHash)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "User not found", http.StatusUnauthorized)
		} else {
			http.Error(w, "Database error", http.StatusInternalServerError)
		}
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(credentials.Password)); err != nil {
		http.Error(w, "Invalid password", http.StatusUnauthorized)
		return
	}

	// Set session cookie
	isProd := strings.HasPrefix(os.Getenv("BASE_URL"), "https")
	samesite := http.SameSiteLaxMode
	if isProd {
		samesite = http.SameSiteNoneMode
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "navix_session",
		Value:    userID,
		Path:     "/",
		HttpOnly: true,
		Secure:   isProd,
		SameSite: samesite,
		MaxAge:   3600 * 24 * 7,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"user_id": userID,
	})
}

// getSessionUser extracts the username from the navix_session cookie or X-User-ID header
func getSessionUser(r *http.Request) string {
	// 1. Try Header (most reliable for cross-domain)
	if hid := r.Header.Get("X-User-ID"); hid != "" {
		return hid
	}

	// 2. Try Cookie (legacy/local dev)
	cookie, err := r.Cookie("navix_session")
	if err != nil {
		return ""
	}
	return cookie.Value
}
