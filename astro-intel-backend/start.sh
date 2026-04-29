#!/bin/bash
# Start the AstroIntel 360° LangGraph backend

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/../.venv"

if [ -f "$VENV/bin/activate" ]; then
  source "$VENV/bin/activate"
fi

cd "$SCRIPT_DIR"
echo "Starting AstroIntel 360° LangGraph API on http://localhost:8080 ..."
echo "  Docs: http://localhost:8080/docs"
echo ""
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
