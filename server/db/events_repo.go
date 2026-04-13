package db

import (
	"database/sql"
	"fmt"
	"navix/server/models"
)

// CreateEvent inserts a new event for a given trip.
func CreateEvent(database *sql.DB, tripID string, event models.Event) error {
	_, err := database.Exec(
		`INSERT INTO events (id, trip_id, description, start_time, end_time, cost, source, is_confirmed)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		event.ID, tripID, event.Description, event.StartTime, event.EndTime,
		event.Cost, event.Source, event.IsConfirmed,
	)
	if err != nil {
		return fmt.Errorf("failed to create event: %v", err)
	}
	return nil
}

// GetEventsByTripID returns all events for a given trip.
func GetEventsByTripID(database *sql.DB, tripID string) ([]models.Event, error) {
	rows, err := database.Query(
		`SELECT id, description, start_time, end_time, cost, source, is_confirmed FROM events WHERE trip_id = $1`,
		tripID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query events: %v", err)
	}
	defer rows.Close()

	var events []models.Event
	for rows.Next() {
		var e models.Event
		if err := rows.Scan(&e.ID, &e.Description, &e.StartTime, &e.EndTime, &e.Cost, &e.Source, &e.IsConfirmed); err != nil {
			return nil, fmt.Errorf("failed to scan event: %v", err)
		}
		events = append(events, e)
	}

	if events == nil {
		events = []models.Event{}
	}
	return events, nil
}

// UpdateEvent updates an existing event's fields.
func UpdateEvent(database *sql.DB, event models.Event) error {
	_, err := database.Exec(
		`UPDATE events SET description = $2, start_time = $3, end_time = $4, cost = $5, source = $6, is_confirmed = $7 WHERE id = $1`,
		event.ID, event.Description, event.StartTime, event.EndTime, event.Cost, event.Source, event.IsConfirmed,
	)
	if err != nil {
		return fmt.Errorf("failed to update event: %v", err)
	}
	return nil
}

// DeleteEvent removes a single event by ID.
func DeleteEvent(database *sql.DB, eventID string) error {
	_, err := database.Exec(`DELETE FROM events WHERE id = $1`, eventID)
	if err != nil {
		return fmt.Errorf("failed to delete event: %v", err)
	}
	return nil
}

// DeleteAllEventsByTripID removes all events for a trip (clear itinerary).
func DeleteAllEventsByTripID(database *sql.DB, tripID string) error {
	_, err := database.Exec(`DELETE FROM events WHERE trip_id = $1`, tripID)
	if err != nil {
		return fmt.Errorf("failed to delete trip events: %v", err)
	}
	return nil
}
