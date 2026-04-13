package models

import "time"

// Trip represents the core data for a travel plan
type Trip struct {
	ID          string  `json:"id"`
	UserID      string  `json:"user_id,omitempty"`
	Destination string  `json:"destination"`
	Date        string  `json:"date"`
	Budget      float64 `json:"budget"`
	LLMMemory   string  `json:"llm_memory"`
	Preferences string  `json:"preferences"`
}

// AuditLog represents a single step in the reasoning/argument loop
type AuditLog struct {
	Agent   string `json:"agent"`   // e.g., "assistant" or "shadow_agent"
	Message string `json:"message"`
}

// Message represents a single chat interaction
type Message struct {
	ID         string     `json:"id"`
	Text       string     `json:"text"`
	Sender     string     `json:"sender"` // "user" or "assistant"
	Timestamp  time.Time  `json:"timestamp"`
	AuditTrail []AuditLog `json:"audit_trail,omitempty"` // The red-team argument log
}

// Event represents an itinerary item
type Event struct {
	ID          string  `json:"id"`
	Description string  `json:"description"`
	StartTime   string  `json:"start_time"`
	EndTime     string  `json:"end_time"`
	Cost        float64 `json:"cost"`
	Source      string  `json:"source"`      // e.g. "manual", "tiktok", "instagram"
	IsConfirmed bool    `json:"is_confirmed"`
}

// MediaAsset represents a stored video or document binary
type MediaAsset struct {
	ID        string `json:"id"`
	TripID    string `json:"trip_id,omitempty"`
	SourceURL string `json:"source_url"`
	MimeType  string `json:"mime_type"`
	Data      []byte `json:"-"`          // Excluded from JSON responses by default
	GeminiURI string `json:"gemini_uri"`
}
