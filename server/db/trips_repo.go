package db

import (
	"database/sql"
	"fmt"
	"navix/server/models"
)

// CreateTrip inserts a new trip record into the database.
func CreateTrip(database *sql.DB, trip models.Trip) error {
	_, err := database.Exec(
		`INSERT INTO trips (id, user_id, destination, date, budget, llm_memory, preferences) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		trip.ID, trip.UserID, trip.Destination, trip.Date, trip.Budget, trip.LLMMemory, trip.Preferences,
	)
	if err != nil {
		return fmt.Errorf("failed to create trip: %v", err)
	}
	return nil
}

// GetAllTrips returns all trips ordered by creation time (newest first).
func GetAllTrips(database *sql.DB, userID string) ([]models.Trip, error) {
	rows, err := database.Query(`SELECT id, user_id, destination, date, budget, llm_memory, preferences FROM trips WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query trips: %v", err)
	}
	defer rows.Close()

	var trips []models.Trip
	for rows.Next() {
		var t models.Trip
		// SQL might have null in user_id for old rows, but we handle it with a nullstring variable or just try to scan it if we made sure it's not null.
		// using sql.NullString for user_id to prevent scan errors on old data
		var nullUserID sql.NullString
		if err := rows.Scan(&t.ID, &nullUserID, &t.Destination, &t.Date, &t.Budget, &t.LLMMemory, &t.Preferences); err != nil {
			return nil, fmt.Errorf("failed to scan trip: %v", err)
		}
		if nullUserID.Valid {
			t.UserID = nullUserID.String
		}
		trips = append(trips, t)
	}

	// Return empty slice instead of nil so JSON encodes as []
	if trips == nil {
		trips = []models.Trip{}
	}
	return trips, nil
}

// GetTripByID retrieves a single trip by its ID and User ID.
func GetTripByID(database *sql.DB, id string, userID string) (*models.Trip, error) {
	var t models.Trip
	var nullUserID sql.NullString
	err := database.QueryRow(
		`SELECT id, user_id, destination, date, budget, llm_memory, preferences FROM trips WHERE id = $1 AND user_id = $2`, id, userID,
	).Scan(&t.ID, &nullUserID, &t.Destination, &t.Date, &t.Budget, &t.LLMMemory, &t.Preferences)
	
	if nullUserID.Valid {
		t.UserID = nullUserID.String
	}

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get trip: %v", err)
	}
	return &t, nil
}

// UpdateTrip updates a trip's destination, date, budget, memory, and preferences.
func UpdateTrip(database *sql.DB, trip models.Trip) error {
	_, err := database.Exec(
		`UPDATE trips SET destination = $3, date = $4, budget = $5, llm_memory = $6, preferences = $7 WHERE id = $1 AND user_id = $2`,
		trip.ID, trip.UserID, trip.Destination, trip.Date, trip.Budget, trip.LLMMemory, trip.Preferences,
	)
	if err != nil {
		return fmt.Errorf("failed to update trip: %v", err)
	}
	return nil
}

// UpdateTripMemory updates just the LLM memory for a trip.
func UpdateTripMemory(database *sql.DB, tripID string, userID string, memory string) error {
	_, err := database.Exec(`UPDATE trips SET llm_memory = $3 WHERE id = $1 AND user_id = $2`, tripID, userID, memory)
	if err != nil {
		return fmt.Errorf("failed to update trip memory: %v", err)
	}
	return nil
}

// DeleteTrip removes a trip and cascades to its events, messages.
func DeleteTrip(database *sql.DB, id string, userID string) error {
	_, err := database.Exec(`DELETE FROM trips WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("failed to delete trip: %v", err)
	}
	return nil
}
