#!/bin/bash

# Configuration
APP_DIR="/opt/homedashboard"

echo "=== Starting Home Dashboard Update ==="

# Check if we are in the correct directory, if not try to go there
if [ "$PWD" != "$APP_DIR" ]; then
    if [ -d "$APP_DIR" ]; then
        echo "Navigating to $APP_DIR..."
        cd "$APP_DIR"
    else
        echo "Error: Application directory $APP_DIR not found."
        exit 1
    fi
fi

# Pull latest changes from GitHub
echo "1. Pulling latest changes from git..."
git pull

if [ $? -ne 0 ]; then
    echo "Error: Git pull failed. Please check your internet connection or git status."
    exit 1
fi

# Rebuild and restart containers
echo "2. Rebuilding and restarting containers..."
docker compose up -d --build --remove-orphans

# Clean up unused images to save space
echo "3. Cleaning up old docker images..."
docker image prune -f

echo "=== Update Successful! ==="
