#!/usr/bin/env bash
# AI Content Factory — start backend (8000) + frontend (4200) locally.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f backend/.env ]; then
  echo "backend/.env missing — copy backend/.env.example and set DEEPSEEK_API_KEY" >&2
  exit 1
fi

(cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000) &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null' EXIT

(cd frontend && npm start)
