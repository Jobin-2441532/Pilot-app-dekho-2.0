#!/bin/bash
# Exit on any error
set -e

echo "Installing dependencies..."
pip install --no-cache-dir -r backend/requirements.txt
# ml_service just needs fastapi and uvicorn, which are already in backend/requirements.txt

echo "Starting ML Service in the background on port 8001..."
cd ml_service
python -m uvicorn main:app --host 127.0.0.1 --port 8001 &
ML_PID=$!

echo "Starting Main Backend on Render's assigned port..."
cd ../backend
# Render passes the port to bind to via the PORT environment variable
python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}

# If the backend crashes, kill the ML service too
kill $ML_PID
