package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"navix/server/db"
	"navix/server/models"
)

// TripHandler handles itinerary and trip metadata management
type TripHandler struct {
	DB *sql.DB
}

// GetTrips returns all trips for the user
func (h *TripHandler) GetTrips(w http.ResponseWriter, r *http.Request) {
	userID := getSessionUser(r)
	if userID == "" {
		http.Error(w, "AUTH_REQUIRED", http.StatusUnauthorized)
		return
	}

	trips, err := db.GetAllTrips(h.DB, userID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch trips: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(trips)
}

// PostTrip creates a new trip in the database
func (h *TripHandler) PostTrip(w http.ResponseWriter, r *http.Request) {
	userID := getSessionUser(r)
	if userID == "" {
		http.Error(w, "AUTH_REQUIRED", http.StatusUnauthorized)
		return
	}

	var newTrip models.Trip
	if err := json.NewDecoder(r.Body).Decode(&newTrip); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	newTrip.UserID = userID
	if newTrip.Budget == 0 {
		newTrip.Budget = 1000
	}

	if err := db.CreateTrip(h.DB, newTrip); err != nil {
		http.Error(w, fmt.Sprintf("Failed to create trip: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(newTrip)
}

// UpdateTrip modifies an existing trip's metadata
func (h *TripHandler) UpdateTrip(w http.ResponseWriter, r *http.Request) {
	userID := getSessionUser(r)
	if userID == "" {
		http.Error(w, "AUTH_REQUIRED", http.StatusUnauthorized)
		return
	}

	tripID := extractTripID(r.URL.Path, "/api/trips/")
	if tripID == "" {
		http.Error(w, "Missing trip ID", http.StatusBadRequest)
		return
	}

	existing, err := db.GetTripByID(h.DB, tripID, userID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get trip: %v", err), http.StatusInternalServerError)
		return
	}
	if existing == nil {
		http.Error(w, "Trip not found", http.StatusNotFound)
		return
	}

	var updates models.Trip
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Merge: only overwrite non-zero fields
	if updates.Destination != "" {
		existing.Destination = updates.Destination
	}
	if updates.Date != "" {
		existing.Date = updates.Date
	}
	if updates.Budget > 0 {
		existing.Budget = updates.Budget
	}
	if updates.LLMMemory != "" {
		existing.LLMMemory = updates.LLMMemory
	}
	if updates.Preferences != "" {
		existing.Preferences = updates.Preferences
	}

	if err := db.UpdateTrip(h.DB, *existing); err != nil {
		http.Error(w, fmt.Sprintf("Failed to update trip: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(existing)
}

// DeleteTrip removes a trip and all associated data (cascading delete)
func (h *TripHandler) DeleteTrip(w http.ResponseWriter, r *http.Request) {
	userID := getSessionUser(r)
	if userID == "" {
		http.Error(w, "AUTH_REQUIRED", http.StatusUnauthorized)
		return
	}

	tripID := extractTripID(r.URL.Path, "/api/trips/")
	if tripID == "" {
		http.Error(w, "Missing trip ID", http.StatusBadRequest)
		return
	}

	if err := db.DeleteTrip(h.DB, tripID, userID); err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete trip: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// GetMemory returns the persistent LLM memory for a specific trip
func (h *TripHandler) GetMemory(w http.ResponseWriter, r *http.Request) {
	userID := getSessionUser(r)
	if userID == "" {
		http.Error(w, "AUTH_REQUIRED", http.StatusUnauthorized)
		return
	}

	tripID := extractTripID(r.URL.Path, "/api/trips/")
	tripID = strings.TrimSuffix(tripID, "/memory")
	if tripID == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"memory": ""})
		return
	}

	trip, err := db.GetTripByID(h.DB, tripID, userID)
	if err != nil || trip == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"memory": ""})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"memory": trip.LLMMemory})
}

// UpdateMemory updates the LLM memory for a specific trip
func (h *TripHandler) UpdateMemory(w http.ResponseWriter, r *http.Request) {
	userID := getSessionUser(r)
	if userID == "" {
		http.Error(w, "AUTH_REQUIRED", http.StatusUnauthorized)
		return
	}

	tripID := extractTripID(r.URL.Path, "/api/trips/")
	// Strip the /memory suffix
	tripID = strings.TrimSuffix(tripID, "/memory")
	if tripID == "" {
		http.Error(w, "Missing trip ID", http.StatusBadRequest)
		return
	}

	var body struct {
		Memory string `json:"memory"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := db.UpdateTripMemory(h.DB, tripID, userID, body.Memory); err != nil {
		http.Error(w, fmt.Sprintf("Failed to update memory: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

// GetTripEvents returns all events for a specific trip
func (h *TripHandler) GetTripEvents(w http.ResponseWriter, r *http.Request) {
	tripID := extractTripID(r.URL.Path, "/api/trips/")
	tripID = strings.TrimSuffix(tripID, "/events")
	if tripID == "" {
		http.Error(w, "Missing trip ID", http.StatusBadRequest)
		return
	}

	events, err := db.GetEventsByTripID(h.DB, tripID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch events: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

// PostTripEvent creates a new event for a specific trip
func (h *TripHandler) PostTripEvent(w http.ResponseWriter, r *http.Request) {
	tripID := extractTripID(r.URL.Path, "/api/trips/")
	tripID = strings.TrimSuffix(tripID, "/events")
	if tripID == "" {
		http.Error(w, "Missing trip ID", http.StatusBadRequest)
		return
	}

	var event models.Event
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := db.CreateEvent(h.DB, tripID, event); err != nil {
		http.Error(w, fmt.Sprintf("Failed to create event: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(event)
}

// UpdateTripEvent updates an existing event
func (h *TripHandler) UpdateTripEvent(w http.ResponseWriter, r *http.Request) {
	var event models.Event
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := db.UpdateEvent(h.DB, event); err != nil {
		http.Error(w, fmt.Sprintf("Failed to update event: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(event)
}

// DeleteTripEvent removes a single event
func (h *TripHandler) DeleteTripEvent(w http.ResponseWriter, r *http.Request) {
	var body struct {
		EventID string `json:"event_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := db.DeleteEvent(h.DB, body.EventID); err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete event: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// DeleteAllTripEvents clears all events for a trip
func (h *TripHandler) DeleteAllTripEvents(w http.ResponseWriter, r *http.Request) {
	tripID := extractTripID(r.URL.Path, "/api/trips/")
	tripID = strings.TrimSuffix(tripID, "/events/all")
	if tripID == "" {
		http.Error(w, "Missing trip ID", http.StatusBadRequest)
		return
	}

	if err := db.DeleteAllEventsByTripID(h.DB, tripID); err != nil {
		http.Error(w, fmt.Sprintf("Failed to clear events: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "cleared"})
}

// GetTripMessages returns all messages for a specific trip
func (h *TripHandler) GetTripMessages(w http.ResponseWriter, r *http.Request) {
	tripID := extractTripID(r.URL.Path, "/api/trips/")
	tripID = strings.TrimSuffix(tripID, "/messages")
	if tripID == "" {
		http.Error(w, "Missing trip ID", http.StatusBadRequest)
		return
	}

	messages, err := db.GetMessagesByTripID(h.DB, tripID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch messages: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

// PostTripMessage saves a new message for a specific trip
func (h *TripHandler) PostTripMessage(w http.ResponseWriter, r *http.Request) {
	tripID := extractTripID(r.URL.Path, "/api/trips/")
	tripID = strings.TrimSuffix(tripID, "/messages")
	if tripID == "" {
		http.Error(w, "Missing trip ID", http.StatusBadRequest)
		return
	}

	var msg models.Message
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := db.SaveMessage(h.DB, tripID, msg); err != nil {
		http.Error(w, fmt.Sprintf("Failed to save message: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(msg)
}

// DeleteTripMessages clears all messages for a trip
func (h *TripHandler) DeleteTripMessages(w http.ResponseWriter, r *http.Request) {
	tripID := extractTripID(r.URL.Path, "/api/trips/")
	tripID = strings.TrimSuffix(tripID, "/messages")
	if tripID == "" {
		http.Error(w, "Missing trip ID", http.StatusBadRequest)
		return
	}

	if err := db.DeleteMessagesByTripID(h.DB, tripID); err != nil {
		http.Error(w, fmt.Sprintf("Failed to clear messages: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "cleared"})
}

// extractTripID parses the trip ID from a URL path like /api/trips/{id}/...
func extractTripID(path string, prefix string) string {
	trimmed := strings.TrimPrefix(path, prefix)
	// The trip ID is everything up to the next '/' (or the whole string)
	if idx := strings.Index(trimmed, "/"); idx != -1 {
		return trimmed[:idx]
	}
	return trimmed
}
