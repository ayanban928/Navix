package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"navix/server/models"
	"time"
)

// SaveMessage inserts a chat message for a given trip.
func SaveMessage(database *sql.DB, tripID string, msg models.Message) error {
	auditJSON, err := json.Marshal(msg.AuditTrail)
	if err != nil {
		auditJSON = []byte("[]")
	}

	_, err = database.Exec(
		`INSERT INTO messages (id, trip_id, text, sender, timestamp, audit_trail)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) DO UPDATE 
		SET text = EXCLUDED.text, 
		    audit_trail = EXCLUDED.audit_trail`,
		msg.ID, tripID, msg.Text, msg.Sender, msg.Timestamp, auditJSON,
	)
	if err != nil {
		return fmt.Errorf("failed to save message: %v", err)
	}
	return nil
}

// GetMessagesByTripID returns all messages for a trip, ordered by timestamp.
func GetMessagesByTripID(database *sql.DB, tripID string) ([]models.Message, error) {
	rows, err := database.Query(
		`SELECT id, text, sender, timestamp, audit_trail FROM messages WHERE trip_id = $1 ORDER BY timestamp ASC`,
		tripID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query messages: %v", err)
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		var m models.Message
		var ts time.Time
		var auditJSON []byte

		if err := rows.Scan(&m.ID, &m.Text, &m.Sender, &ts, &auditJSON); err != nil {
			return nil, fmt.Errorf("failed to scan message: %v", err)
		}
		m.Timestamp = ts

		if len(auditJSON) > 0 {
			json.Unmarshal(auditJSON, &m.AuditTrail)
		}
		messages = append(messages, m)
	}

	if messages == nil {
		messages = []models.Message{}
	}
	return messages, nil
}

// DeleteMessagesByTripID removes all messages for a trip.
func DeleteMessagesByTripID(database *sql.DB, tripID string) error {
	_, err := database.Exec(`DELETE FROM messages WHERE trip_id = $1`, tripID)
	if err != nil {
		return fmt.Errorf("failed to delete messages: %v", err)
	}
	return nil
}
