#!/bin/bash
# Render start script
# Note: pip install is handled by buildCommand in render.yaml

echo "==> Starting Main Backend on port ${PORT:-10000}..."
cd backend
export PYTHONPATH=$(pwd)

# Start ML sidecar in background AFTER switching to backend dir
(
  cd ../ml_service
  export PYTHONPATH=$(pwd)
  python -m uvicorn main:app --host 127.0.0.1 --port 8001
) &

# Start main backend — this process must stay alive for Render
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-10000}"
