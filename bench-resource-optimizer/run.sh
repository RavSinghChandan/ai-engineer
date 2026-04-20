#!/usr/bin/env bash
# Quick start script — runs backend and frontend in parallel.
# Usage: ./run.sh
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "=========================================="
echo "  Bench Resource Optimizer — Local Start  "
echo "=========================================="
echo ""

# ── Backend ──────────────────────────────────
echo "▶ Starting FastAPI backend on http://localhost:8000 ..."

cd "$ROOT/backend"

if [ ! -f ".env" ]; then
  echo ""
  echo "⚠️  WARNING: .env file not found."
  echo "   Copy .env.example to .env and add your OPENAI_API_KEY."
  echo "   $ cp .env.example .env"
  echo ""
fi

if [ ! -d "venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# ── Frontend ─────────────────────────────────
echo ""
echo "▶ Starting Angular frontend on http://localhost:4200 ..."
cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
  echo "Installing npm packages..."
  npm install
fi

ng serve --proxy-config proxy.conf.json --open &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "=========================================="
echo "  ✅ Both services started!"
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:4200"
echo "  API Docs → http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop both."
echo "=========================================="

# Wait for either to exit, then kill the other
wait $BACKEND_PID $FRONTEND_PID
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
