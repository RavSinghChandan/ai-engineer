#!/usr/bin/env bash
# Single process: FastAPI serves the API and the built frontend on $PORT.
set -euo pipefail

PY="${PYTHON:-python3}"

# Build on first boot if the deployment did not run build.sh.
if [ ! -d frontend/dist/agentic-growth-os/browser ]; then
  echo "==> No frontend build found; building now"
  PYTHON="$PY" bash build.sh
fi

# Fail loudly here rather than leaving a dead port: if the interpreter that
# runs the server is not the one the deps were installed into, say so.
if ! "$PY" -c "import uvicorn" 2>/dev/null; then
  echo "ERROR: uvicorn is not importable by $("$PY" -c 'import sys; print(sys.executable)')" >&2
  echo "Run: $PY -m pip install -r backend/requirements.txt" >&2
  exit 1
fi

cd backend
exec "$PY" -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
