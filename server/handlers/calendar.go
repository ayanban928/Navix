package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"navix/server/services"
	"google.golang.org/api/calendar/v3"
)

type CalendarHandler struct {
	CalendarService *services.GoogleCalendarService
	Auth            *AuthHandler
}

func (h *CalendarHandler) GetEvents(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")

	userID := getSessionUser(r)
	token := h.Auth.GetToken(userID)
	if token == nil {
		http.Error(w, "AUTH_REQUIRED", http.StatusUnauthorized)
		return
	}

	events, err := h.CalendarService.FetchEvents(r.Context(), token)
	if err != nil {
		fmt.Printf("ERROR in FetchEvents: %v\n", err)
		// If it's an auth error, return 401 so the frontend prompts for re-login
		if strings.Contains(err.Error(), "oauth2") || strings.Contains(err.Error(), "401") || strings.Contains(err.Error(), "unauthorized") {
			http.Error(w, "AUTH_REQUIRED", http.StatusUnauthorized)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	json.NewEncoder(w).Encode(events)
}

func (h *CalendarHandler) PushEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodOptions {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")

	userID := getSessionUser(r)
	token := h.Auth.GetToken(userID)
	if token == nil {
		http.Error(w, "AUTH_REQUIRED", http.StatusUnauthorized)
		return
	}

	var reqEv struct {
		Summary     string `json:"summary"`
		Description string `json:"description"`
		StartTime   string `json:"start_time"`
		EndTime     string `json:"end_time"`
	}

	if err := json.NewDecoder(r.Body).Decode(&reqEv); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	googleEv := &calendar.Event{
		Summary:     reqEv.Summary,
		Description: reqEv.Description,
		Start: &calendar.EventDateTime{
			DateTime: reqEv.StartTime,
			TimeZone: "America/New_York",
		},
		End: &calendar.EventDateTime{
			DateTime: reqEv.EndTime,
			TimeZone: "America/New_York",
		},
	}

	created, err := h.CalendarService.PushEvent(r.Context(), token, googleEv)
	if err != nil {
		fmt.Printf("ERROR in PushEvent: %v\n", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(created)
}

func (h *CalendarHandler) DeleteEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodOptions {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")

	userID := getSessionUser(r)
	token := h.Auth.GetToken(userID)
	if token == nil {
		http.Error(w, "AUTH_REQUIRED", http.StatusUnauthorized)
		return
	}

	var reqEv struct {
		Id string `json:"id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&reqEv); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if reqEv.Id == "" {
		http.Error(w, "Missing event ID", http.StatusBadRequest)
		return
	}

	err := h.CalendarService.DeleteEvent(r.Context(), token, reqEv.Id)
	if err != nil {
		fmt.Printf("ERROR in DeleteEvent: %v\n", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}
