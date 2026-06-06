#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# Start the Universal Agent (Aarav) for the AI System Design Blueprint
# Run this ONCE before opening dashboard.html or any flow.html
# ─────────────────────────────────────────────────────────────────

AGENT_DIR="$(cd "$(dirname "$0")/../../universal-agent" && pwd)"
BLUEPRINT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  AI System Design Blueprint — Agent Startup"
echo "  ─────────────────────────────────────────────"
echo "  Agent dir : $AGENT_DIR"
echo "  API port  : http://localhost:8000"
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "  ERROR: python3 not found. Install Python 3.10+ first."
  exit 1
fi

# Install deps if needed
cd "$AGENT_DIR"
if [ ! -f ".deps_installed" ]; then
  echo "  Installing dependencies..."
  pip install -q -r requirements.txt && touch .deps_installed
fi

# Export DeepSeek key from the workspace .env
WORKSPACE_ENV="$(dirname "$AGENT_DIR")/.env"
if [ -f "$WORKSPACE_ENV" ]; then
  export $(grep -v '^#' "$WORKSPACE_ENV" | grep DEEPSEEK_API_KEY | xargs)
  echo "  DeepSeek key loaded from .env ✓"
fi

echo ""
echo "  Starting Aarav on http://localhost:8000 ..."
echo "  Widget auto-appears on every flow page."
echo "  Press Ctrl+C to stop."
echo ""

python3 -m uvicorn universal_agent.api.main:app --host 0.0.0.0 --port 8000 --reload
