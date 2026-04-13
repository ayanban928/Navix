package db

import (
	"database/sql"
	"fmt"
	"navix/server/models"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// SaveMediaAsset stores a video/document binary in the database.
func SaveMediaAsset(database *sql.DB, tripID string, sourceURL string, mimeType string, data []byte) (string, error) {
	assetID := uuid.New().String()

	// Allow tripID to be empty (for ingestions not yet linked to a trip)
	var tripIDPtr *string
	if tripID != "" {
		tripIDPtr = &tripID
	}

	_, err := database.Exec(
		`INSERT INTO media_assets (id, trip_id, source_url, mime_type, data, gemini_uri)
		 VALUES ($1, $2, $3, $4, $5, '')`,
		assetID, tripIDPtr, sourceURL, mimeType, data,
	)
	if err != nil {
		return "", fmt.Errorf("failed to save media asset: %v", err)
	}

	fmt.Printf("[DB] Saved media asset %s (%s, %d bytes)\n", assetID, mimeType, len(data))
	return assetID, nil
}

// UpdateMediaGeminiURI sets the Gemini File API URI after upload.
func UpdateMediaGeminiURI(database *sql.DB, assetID string, geminiURI string) error {
	_, err := database.Exec(`UPDATE media_assets SET gemini_uri = $2 WHERE id = $1`, assetID, geminiURI)
	if err != nil {
		return fmt.Errorf("failed to update gemini URI: %v", err)
	}
	return nil
}

// GetMediaAsset retrieves a single media asset by ID.
func GetMediaAsset(database *sql.DB, assetID string) (*models.MediaAsset, error) {
	var m models.MediaAsset
	var tripID sql.NullString

	err := database.QueryRow(
		`SELECT id, trip_id, source_url, mime_type, data, gemini_uri FROM media_assets WHERE id = $1`,
		assetID,
	).Scan(&m.ID, &tripID, &m.SourceURL, &m.MimeType, &m.Data, &m.GeminiURI)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get media asset: %v", err)
	}

	if tripID.Valid {
		m.TripID = tripID.String
	}
	return &m, nil
}

// GetMediaByTripID returns all media assets linked to a trip.
func GetMediaByTripID(database *sql.DB, tripID string) ([]models.MediaAsset, error) {
	rows, err := database.Query(
		`SELECT id, trip_id, source_url, mime_type, gemini_uri FROM media_assets WHERE trip_id = $1 ORDER BY created_at DESC`,
		tripID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query media assets: %v", err)
	}
	defer rows.Close()

	var assets []models.MediaAsset
	for rows.Next() {
		var a models.MediaAsset
		var tid sql.NullString
		// Don't load data blob for listing queries
		if err := rows.Scan(&a.ID, &tid, &a.SourceURL, &a.MimeType, &a.GeminiURI); err != nil {
			return nil, fmt.Errorf("failed to scan media asset: %v", err)
		}
		if tid.Valid {
			a.TripID = tid.String
		}
		assets = append(assets, a)
	}

	if assets == nil {
		assets = []models.MediaAsset{}
	}
	return assets, nil
}

// WriteTempFile writes media data to a temporary file for Gemini upload.
// The caller is responsible for deleting the file when done.
func WriteTempFile(data []byte, mimeType string) (string, error) {
	ext := ".bin"
	if strings.Contains(mimeType, "mp4") {
		ext = ".mp4"
	} else if strings.Contains(mimeType, "webm") {
		ext = ".webm"
	} else if strings.Contains(mimeType, "pdf") {
		ext = ".pdf"
	} else if strings.Contains(mimeType, "text") {
		ext = ".txt"
	}

	tmpDir := os.TempDir()
	tmpFile := filepath.Join(tmpDir, fmt.Sprintf("navix_media_%s%s", uuid.New().String()[:8], ext))

	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return "", fmt.Errorf("failed to write temp file: %v", err)
	}

	return tmpFile, nil
}
