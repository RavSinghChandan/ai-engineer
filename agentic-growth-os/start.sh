#!/usr/bin/env bash
# Single process: FastAPI serves the API and the built frontend on $PORT.
set -euo pipefail

# Build on first boot if the deployment did not run build.sh.
if [ ! -d frontend/dist/agentic-growth-os/browser ]; then
  echo "==> No frontend build found; building now"
  bash build.sh
fi

cd backend
exec python3 -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
