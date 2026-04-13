package db

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

// Connect opens a Postgres connection pool and verifies it.
func Connect(databaseURL string) (*sql.DB, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %v", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %v", err)
	}

	fmt.Println("Connected to PostgreSQL database.")
	return db, nil
}

// RunMigrations creates all tables if they don't already exist (idempotent).
func RunMigrations(database *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		created_at TIMESTAMPTZ DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS trips (
		id TEXT PRIMARY KEY,
		user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
		destination TEXT NOT NULL,
		date TEXT DEFAULT 'TBD',
		budget REAL DEFAULT 1000,
		llm_memory TEXT DEFAULT '',
		preferences TEXT DEFAULT '',
		created_at TIMESTAMPTZ DEFAULT NOW()
	);

	ALTER TABLE trips ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

	CREATE TABLE IF NOT EXISTS events (
		id TEXT PRIMARY KEY,
		trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
		description TEXT NOT NULL,
		start_time TEXT DEFAULT '',
		end_time TEXT DEFAULT '',
		cost REAL DEFAULT 0,
		source TEXT DEFAULT 'manual',
		is_confirmed BOOLEAN DEFAULT FALSE
	);

	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
		text TEXT NOT NULL,
		sender TEXT NOT NULL,
		timestamp TIMESTAMPTZ DEFAULT NOW(),
		audit_trail JSONB DEFAULT '[]'
	);

	CREATE TABLE IF NOT EXISTS auth_tokens (
		user_id TEXT PRIMARY KEY,
		token_json JSONB NOT NULL,
		updated_at TIMESTAMPTZ DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS media_assets (
		id TEXT PRIMARY KEY,
		trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
		source_url TEXT DEFAULT '',
		mime_type TEXT DEFAULT 'application/octet-stream',
		data BYTEA,
		gemini_uri TEXT DEFAULT '',
		created_at TIMESTAMPTZ DEFAULT NOW()
	);
	`

	if _, err := database.Exec(schema); err != nil {
		return fmt.Errorf("failed to run migrations: %v", err)
	}

	fmt.Println("✅ Database migrations complete.")
	return nil
}
