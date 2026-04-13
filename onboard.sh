#!/bin/bash

# Navix All-In-One Onboarding Script
# Targets: macOS

echo "Starting Navix Onboarding..."

# 1. Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "Homebrew not found. Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "Homebrew is already installed."
fi

# 2. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing Node via Homebrew..."
    brew install node
else
    echo "Node.js is already installed ($(node -v))."
fi

# 3. Check for Go
if ! command -v go &> /dev/null; then
    echo "Go not found. Installing Go via Homebrew..."
    brew install go
else
    echo "Go is already installed ($(go version))."
fi

# 3b. Check for yt-dlp (Essential for Social Ingestion)
if ! command -v yt-dlp &> /dev/null; then
    echo "yt-dlp not found. Installing via Homebrew..."
    brew install yt-dlp
else
    echo "yt-dlp is already installed."
fi

# 4. Setup Backend
echo "Setting up Backend..."
if [ -d "server" ]; then
    cd server
    go mod tidy
    # Start the backend in the background
    go run main.go &
    BACKEND_PID=$!
    echo "Backend started with PID $BACKEND_PID"
    cd ..
else
    echo "Warning: 'server' directory not found. Skipping backend..."
fi

# 5. Setup Frontend
if [ -d "client" ]; then
    echo "Setting up Frontend..."
    cd client
    if [ ! -d "node_modules" ]; then
        echo "Installing frontend dependencies..."
        npm install
    fi
    
    # Ensure the backend is killed when the user stops the script
    trap "echo 'Stopping servers...'; kill $BACKEND_PID" EXIT
    
    echo "Starting the Navix Development Console..."
    npm run dev
else
    echo "Error: 'client' directory not found. Please run this script from the project root."
    if [ ! -z "$BACKEND_PID" ]; then kill $BACKEND_PID 2>/dev/null; fi
    exit 1
fi
