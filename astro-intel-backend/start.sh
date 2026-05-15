#!/bin/bash
# Start the AstroIntel 360° LangGraph backend

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/../.venv"

if [ -f "$VENV/bin/activate" ]; then
  source "$VENV/bin/activate"
fi

cd "$SCRIPT_DIR"

# Load from .env file if present (never commit .env to git)
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

if [ -z "$MASTER_API_KEY" ]; then
  echo "ERROR: MASTER_API_KEY is not set."
  echo "  Copy .env.example to .env and fill in your secrets:"
  echo "  cp .env.example .env"
  exit 1
fi

if [ -z "$JWT_SECRET" ]; then
  echo "ERROR: JWT_SECRET is not set."
  echo "  Copy .env.example to .env and fill in your secrets."
  exit 1
fi

echo "Starting AstroIntel 360° LangGraph API on http://localhost:8080 ..."
echo "  Docs:  http://localhost:8080/docs"
echo "  Auth:  SUPERADMIN key loaded from environment"
echo ""
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
