#!/usr/bin/env bash
# =============================================================================
#  stop.sh — Stop all AI Engineer Portfolio services
#
#  Usage:
#    chmod +x stop.sh
#    ./stop.sh
# =============================================================================

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}[stopped]${NC} $*"; }
info() { echo -e "${CYAN}[ info  ]${NC} $*"; }
none() { echo -e "         $*"; }

echo ""
echo -e "${BOLD}━━━  Stopping AI Engineer Portfolio  ━━━${NC}"
echo ""

# ── Backend ports ─────────────────────────────────────────────────────────────
BACKEND_PORTS=(8000 8001 8002 8003 8004 8080)
BACKEND_NAMES=(
  [8000]="AstroIntel 360° Backend"
  [8001]="LangGraph Agent Backend"
  [8002]="Agentic Growth OS Backend"
  [8003]="AI Report App Backend"
  [8004]="Bench Resource Optimizer Backend"
  [8080]="LangChain AI Service Backend"
)

# ── Frontend ports ────────────────────────────────────────────────────────────
FRONTEND_PORTS=(4200 4201 4202 4203 4204 4205 4206)
FRONTEND_NAMES=(
  [4200]="AstroIntel 360° Frontend"
  [4201]="Bench Optimizer Frontend"
  [4202]="Graph Visualizer Frontend"
  [4203]="LangChain AI Service Frontend"
  [4204]="LangGraph Agent Frontend"
  [4205]="Agentic Growth OS Frontend"
  [4206]="AI Report App Frontend"
)

kill_port() {
  local port="$1" name="$2"
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null
    ok "Port $port — $name"
  else
    none "Port $port — $name (already stopped)"
  fi
}

echo -e "${BOLD}Backends:${NC}"
for port in "${BACKEND_PORTS[@]}"; do
  kill_port "$port" "${BACKEND_NAMES[$port]}"
done

echo ""
echo -e "${BOLD}Frontends:${NC}"
for port in "${FRONTEND_PORTS[@]}"; do
  kill_port "$port" "${FRONTEND_NAMES[$port]}"
done

# ── Also kill any stray uvicorn / ng serve processes ─────────────────────────
echo ""
info "Cleaning up any remaining uvicorn / ng serve processes ..."

pkill -f "uvicorn.*app" 2>/dev/null && ok "uvicorn processes stopped" || none "No stray uvicorn processes"
pkill -f "ng serve"     2>/dev/null && ok "ng serve processes stopped"  || none "No stray ng serve processes"

# ── Clear only .log files inside .logs/ — never touches .env or any other file ──
LOG_DIR="$(cd "$(dirname "$0")" && pwd)/.logs"
if [ -d "$LOG_DIR" ]; then
  find "$LOG_DIR" -maxdepth 1 -name "*.log" -delete
  info "Log files cleared ($LOG_DIR)"
fi

echo ""
echo -e "${BOLD}━━━  All services stopped  ━━━${NC}"
echo ""
