#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        Agentic Growth OS  — Starting         ║"
echo "║   Backend: LangGraph + FastAPI               ║"
echo "║   Frontend: Angular 17                       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Kill any leftover processes on our ports
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:4200 | xargs kill -9 2>/dev/null || true

# ── Backend ─────────────────────────────────────────
echo "▶ Starting LangGraph backend on http://localhost:8000 ..."
cd "$ROOT/backend"

if [ -d "../../../.venv" ]; then
  source "../../../.venv/bin/activate"
elif [ -d ".venv" ]; then
  source ".venv/bin/activate"
fi

pip install -r requirements.txt -q
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# Wait for backend to be ready
echo "  Waiting for backend..."
for i in {1..15}; do
  if curl -s http://localhost:8000/ > /dev/null 2>&1; then
    echo "  ✓ Backend ready"
    break
  fi
  sleep 1
done

# ── Frontend ─────────────────────────────────────────
echo ""
echo "▶ Starting Angular frontend on http://localhost:4200 ..."
cd "$ROOT/frontend"

if ! command -v ng &>/dev/null; then
  npm install --legacy-peer-deps -q
fi

npx ng serve --port 4200 --open &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ App running at http://localhost:4200      ║"
echo "║  ✓ API running at http://localhost:8000      ║"
echo "║  ✓ API docs at  http://localhost:8000/docs   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Press Ctrl+C to stop both servers"

wait $BACKEND_PID $FRONTEND_PID
