package main

import (
	"fmt"
	"navix/server/db"
	"navix/server/handlers"
	"navix/server/services"
	"net/http"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
)

func main() {
	// Load .env from root directory
	err := godotenv.Load("../.env")
	if err != nil {
		fmt.Println("Warning: No .env file found. Please make sure GEMINI_API_KEY is set in your environment.")
	}

	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		fmt.Println("Error: GEMINI_API_KEY is not set.")
	}

	// ── Database Init ──────────────────────────────────────────
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		fmt.Println("Error: DATABASE_URL is not set. Please set it in your .env file.")
		fmt.Println("Example: DATABASE_URL=postgres://user:pass@localhost:5432/navix?sslmode=disable")
		os.Exit(1)
	}

	database, err := db.Connect(databaseURL)
	if err != nil {
		fmt.Printf("Fatal: Could not connect to database: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := db.RunMigrations(database); err != nil {
		fmt.Printf("Fatal: Could not run migrations: %v\n", err)
		os.Exit(1)
	}

	// ── Init Services ──────────────────────────────────────────
	gemini := &services.GeminiService{ApiKey: apiKey}
	fetcher := &services.VideoFetcher{AssetsDir: "./test_assets"}
	ingestion := &services.IngestionService{ApiKey: apiKey, Fetcher: fetcher, DB: database}

	// Init Google Calendar Config
	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")
	googleClientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	
	if googleClientID == "" || googleClientSecret == "" {
		fmt.Println("Warning: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set. Google Calendar integration will be disabled.")
	}
	baseURL := strings.TrimSuffix(os.Getenv("BASE_URL"), "/")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	frontendURL := strings.TrimSuffix(os.Getenv("FRONTEND_URL"), "/")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}
	
	googleCalConfig := &oauth2.Config{
		ClientID:     googleClientID,
		ClientSecret: googleClientSecret,
		Endpoint:     google.Endpoint,
		RedirectURL:  baseURL + "/api/auth/callback",
		Scopes:       []string{calendar.CalendarEventsScope},
	}
	googleCalService := &services.GoogleCalendarService{Config: googleCalConfig}

	// ── Init Handlers ──────────────────────────────────────────
	chatH := &handlers.ChatHandler{
		Gemini:    gemini,
		Ingestion: ingestion,
		DB:        database,
	}
	tripH := &handlers.TripHandler{
		DB: database,
	}
	authH := &handlers.AuthHandler{
		CalendarService: googleCalService,
		DB:              database,
		FrontendURL:     frontendURL,
	}
	calendarH := &handlers.CalendarHandler{
		CalendarService: googleCalService,
		Auth:            authH,
	}

	// Create a flexible CORS middleware for local development
	withCORS := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			corsOrigin := os.Getenv("CORS_ORIGIN")
			if corsOrigin == "" {
				corsOrigin = "http://localhost:5173"
			}
			if r.Header.Get("Origin") != "" {
				w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
			} else {
				w.Header().Set("Access-Control-Allow-Origin", corsOrigin)
			}

			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID")
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next(w, r)
		}
	}

	// ── 1. Core API Routes ──────────────────────────────────────
	http.HandleFunc("/api/health", withCORS(healthHandler))

	// ── 2. Chat & Ingestion Routes ──────────────────────────────
	http.HandleFunc("/api/chat", withCORS(chatH.PostChat))
	http.HandleFunc("/api/chat/tool-result", withCORS(chatH.PostToolResult))
	http.HandleFunc("/api/ingest", withCORS(chatH.PostIngest))
	http.HandleFunc("/api/ingest/memory", withCORS(chatH.PostIngestMemory))

	// ── 3. Trips CRUD Routes ────────────────────────────────────
	http.HandleFunc("/api/trips", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			tripH.PostTrip(w, r)
		} else {
			tripH.GetTrips(w, r)
		}
	}))
	http.HandleFunc("/api/memory", withCORS(tripH.GetMemory))

	// Dynamic trip routes: /api/trips/{id}, /api/trips/{id}/events, etc.
	http.HandleFunc("/api/trips/", withCORS(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		switch {
		// DELETE /api/trips/{id}/messages
		case strings.HasSuffix(path, "/messages") && r.Method == http.MethodDelete:
			tripH.DeleteTripMessages(w, r)
		// GET/POST /api/trips/{id}/messages
		case strings.HasSuffix(path, "/messages"):
			if r.Method == http.MethodPost {
				tripH.PostTripMessage(w, r)
			} else {
				tripH.GetTripMessages(w, r)
			}
		// DELETE /api/trips/{id}/events/all
		case strings.HasSuffix(path, "/events/all") && r.Method == http.MethodDelete:
			tripH.DeleteAllTripEvents(w, r)
		// PUT /api/trips/{id}/events (update single event)
		case strings.HasSuffix(path, "/events") && r.Method == http.MethodPut:
			tripH.UpdateTripEvent(w, r)
		// DELETE /api/trips/{id}/events (delete single event)
		case strings.HasSuffix(path, "/events") && r.Method == http.MethodDelete:
			tripH.DeleteTripEvent(w, r)
		// GET/POST /api/trips/{id}/events
		case strings.HasSuffix(path, "/events"):
			if r.Method == http.MethodPost {
				tripH.PostTripEvent(w, r)
			} else {
				tripH.GetTripEvents(w, r)
			}
		// GET/PUT /api/trips/{id}/memory
		case strings.HasSuffix(path, "/memory"):
			if r.Method == http.MethodGet {
				tripH.GetMemory(w, r)
			} else {
				tripH.UpdateMemory(w, r)
			}
		// PUT/DELETE /api/trips/{id}
		default:
			if r.Method == http.MethodPut {
				tripH.UpdateTrip(w, r)
			} else if r.Method == http.MethodDelete {
				tripH.DeleteTrip(w, r)
			} else {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
		}
	}))

	// ── 4. Google Calendar & Auth Routes ────────────────────────
	http.HandleFunc("/api/auth/internal/register", withCORS(authH.RegisterHandler))
	http.HandleFunc("/api/auth/internal/login", withCORS(authH.PasswordLoginHandler))
	http.HandleFunc("/api/auth/login", withCORS(authH.LoginHandler))
	http.HandleFunc("/api/auth/logout", withCORS(authH.LogoutHandler))
	http.HandleFunc("/api/auth/callback", withCORS(authH.CallbackHandler))
	http.HandleFunc("/api/calendar/events", withCORS(calendarH.GetEvents))
	http.HandleFunc("/api/calendar/events/push", withCORS(calendarH.PushEvent))
	http.HandleFunc("/api/calendar/events/delete", withCORS(calendarH.DeleteEvent))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Println("🚀 Navix Backend running at :" + port)
	fmt.Println("📦 PostgreSQL database connected.")
	fmt.Println("📅 Google Calendar Integration active.")
	fmt.Println("💬 Chat, Trips, Events, Messages — all routes are ready.")

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		fmt.Printf("Server failed: %v\n", err)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Navix API is Healthy!")
}
