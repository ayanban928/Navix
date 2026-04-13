package db

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"golang.org/x/oauth2"
)

// SaveToken persists an OAuth2 token for a user.
func SaveToken(database *sql.DB, userID string, token *oauth2.Token) error {
	tokenJSON, err := json.Marshal(token)
	if err != nil {
		return fmt.Errorf("failed to marshal token: %v", err)
	}

	_, err = database.Exec(
		`INSERT INTO auth_tokens (user_id, token_json, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (user_id) DO UPDATE SET token_json = $2, updated_at = NOW()`,
		userID, tokenJSON,
	)
	if err != nil {
		return fmt.Errorf("failed to save token: %v", err)
	}
	return nil
}

// GetToken retrieves a stored OAuth2 token for a user.
func GetToken(database *sql.DB, userID string) (*oauth2.Token, error) {
	var tokenJSON []byte
	err := database.QueryRow(
		`SELECT token_json FROM auth_tokens WHERE user_id = $1`, userID,
	).Scan(&tokenJSON)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get token: %v", err)
	}

	var token oauth2.Token
	if err := json.Unmarshal(tokenJSON, &token); err != nil {
		return nil, fmt.Errorf("failed to unmarshal token: %v", err)
	}
	return &token, nil
}

// DeleteToken removes a stored OAuth2 token for a user.
func DeleteToken(database *sql.DB, userID string) error {
	_, err := database.Exec(`DELETE FROM auth_tokens WHERE user_id = $1`, userID)
	if err != nil {
		return fmt.Errorf("failed to delete token: %v", err)
	}
	return nil
}
