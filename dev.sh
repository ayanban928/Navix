#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Trap Ctrl+C and kill both background processes
cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# --- Backend ---
cd "$ROOT/backend"

if [ ! -f .env ]; then
  echo "ERROR: backend/.env not found. Copy backend/.env.example to backend/.env and fill in values."
  exit 1
fi

echo "Starting backend on :8080..."
cargo run &
BACKEND_PID=$!

# --- Frontend ---
cd "$ROOT/frontend"

echo "Starting frontend on :3000..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Backend  → http://localhost:8080"
echo "  Frontend → http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both."

wait
