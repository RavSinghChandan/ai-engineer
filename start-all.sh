#!/bin/bash

# ============================================================
#  start-all.sh — Launch all UI apps + backends on unique ports
# ============================================================

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

# Colour helpers
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Port map ─────────────────────────────────────────────────
# Frontend ports: 4201-4207
# Backend  ports: 8000-8007 (existing native ports preserved)

declare -A FE_PORTS=(
  [astro-intel]=4201
  [agentic-growth-os]=4202
  [ai-report-app]=4203
  [bench-resource-optimizer]=4204
  [graph-visualizer]=4205
  [langchain-project]=4206
  [langgraph-project]=4207
)

declare -A BE_PORTS=(
  [astro-intel-backend]=8080
  [agentic-growth-os-backend]=8001
  [ai-report-app-backend]=8002
  [bench-resource-optimizer-backend]=8003
  [langchain-project-backend]=8004
  [langgraph-project-backend]=8005
)

PIDS=()

# ── Helper: print a status line ───────────────────────────────
log() { echo -e "${CYAN}[start-all]${NC} $*"; }
ok()  { echo -e "${GREEN}[  OK  ]${NC} $*"; }
err() { echo -e "${RED}[ ERR  ]${NC} $*"; }

# ── Helper: start a background process ───────────────────────
start_proc() {
  local name="$1"; local logfile="$LOG_DIR/$name.log"; shift
  log "Starting ${BOLD}$name${NC} ..."
  # shellcheck disable=SC2068
  $@ >> "$logfile" 2>&1 &
  local pid=$!
  PIDS+=("$pid:$name")
  ok "$name  PID=$pid  log=$logfile"
}

# ── Trap: kill all children on Ctrl-C ────────────────────────
cleanup() {
  echo ""
  log "Shutting down all processes ..."
  for entry in "${PIDS[@]}"; do
    local pid="${entry%%:*}"; local name="${entry##*:}"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      log "Stopped $name (PID $pid)"
    fi
  done
  exit 0
}
trap cleanup SIGINT SIGTERM

# ============================================================
#  BACKENDS
# ============================================================

echo -e "\n${BOLD}━━━  BACKENDS  ━━━${NC}"

# 1. Astro-Intel Backend  → port 8080
if [ -d "$ROOT/astro-intel-backend" ]; then
  start_proc "astro-intel-backend" \
    bash -c "cd '$ROOT/astro-intel-backend' && \
             source venv/bin/activate 2>/dev/null || true && \
             uvicorn main:app --host 0.0.0.0 --port 8080 --reload"
fi

# 2. Agentic Growth OS Backend  → port 8001
if [ -d "$ROOT/agentic-growth-os/backend" ]; then
  start_proc "agentic-growth-os-backend" \
    bash -c "cd '$ROOT/agentic-growth-os/backend' && \
             source venv/bin/activate 2>/dev/null || true && \
             uvicorn main:app --host 0.0.0.0 --port 8001 --reload"
fi

# 3. AI Report App Backend  → port 8002
if [ -d "$ROOT/ai-report-app/backend" ]; then
  start_proc "ai-report-app-backend" \
    bash -c "cd '$ROOT/ai-report-app/backend' && \
             source venv/bin/activate 2>/dev/null || true && \
             uvicorn main:app --host 0.0.0.0 --port 8002 --reload"
fi

# 4. Bench Resource Optimizer Backend  → port 8003
if [ -d "$ROOT/bench-resource-optimizer/backend" ]; then
  start_proc "bench-resource-optimizer-backend" \
    bash -c "cd '$ROOT/bench-resource-optimizer/backend' && \
             source venv/bin/activate 2>/dev/null || true && \
             uvicorn main:app --host 0.0.0.0 --port 8003 --reload"
fi

# 5. LangChain Project Backend  → port 8004
if [ -d "$ROOT/langchain-langraph-workspace/langchain_project" ]; then
  start_proc "langchain-project-backend" \
    bash -c "cd '$ROOT/langchain-langraph-workspace/langchain_project' && \
             source venv/bin/activate 2>/dev/null || true && \
             uvicorn app.main:app --host 0.0.0.0 --port 8004 --reload"
fi

# 6. LangGraph Project Backend  → port 8005
if [ -d "$ROOT/langchain-langraph-workspace/langraph_project" ]; then
  start_proc "langgraph-project-backend" \
    bash -c "cd '$ROOT/langchain-langraph-workspace/langraph_project' && \
             source venv/bin/activate 2>/dev/null || true && \
             python -m uvicorn main:app --host 0.0.0.0 --port 8005 --reload"
fi

# Give backends a moment to bind
sleep 3

# ============================================================
#  FRONTENDS
# ============================================================

echo -e "\n${BOLD}━━━  FRONTENDS  ━━━${NC}"

# 1. Astro-Intel Frontend  → port 4201
if [ -d "$ROOT/astro-intel" ]; then
  start_proc "astro-intel-frontend" \
    bash -c "cd '$ROOT/astro-intel' && \
             npm install --silent && \
             npx ng serve --port 4201 --disable-host-check"
fi

# 2. Agentic Growth OS Frontend  → port 4202
if [ -d "$ROOT/agentic-growth-os/frontend" ]; then
  start_proc "agentic-growth-os-frontend" \
    bash -c "cd '$ROOT/agentic-growth-os/frontend' && \
             npm install --silent && \
             npx ng serve --port 4202 --disable-host-check"
fi

# 3. AI Report App Frontend  → port 4203
if [ -d "$ROOT/ai-report-app/frontend" ]; then
  start_proc "ai-report-app-frontend" \
    bash -c "cd '$ROOT/ai-report-app/frontend' && \
             npm install --silent && \
             npx ng serve --port 4203 --disable-host-check"
fi

# 4. Bench Resource Optimizer Frontend  → port 4204
if [ -d "$ROOT/bench-resource-optimizer/frontend" ]; then
  start_proc "bench-resource-optimizer-frontend" \
    bash -c "cd '$ROOT/bench-resource-optimizer/frontend' && \
             npm install --silent && \
             npx ng serve --port 4204 --disable-host-check"
fi

# 5. Graph Visualizer  → port 4205
if [ -d "$ROOT/langchain-langraph-workspace/graph-visualizer" ]; then
  start_proc "graph-visualizer-frontend" \
    bash -c "cd '$ROOT/langchain-langraph-workspace/graph-visualizer' && \
             npm install --silent && \
             npx ng serve --port 4205 --disable-host-check"
fi

# 6. LangChain Project Frontend  → port 4206
if [ -d "$ROOT/langchain-langraph-workspace/langchain_project/frontend" ]; then
  start_proc "langchain-project-frontend" \
    bash -c "cd '$ROOT/langchain-langraph-workspace/langchain_project/frontend' && \
             npm install --silent && \
             npx ng serve --port 4206 --disable-host-check"
fi

# 7. LangGraph Project Frontend  → port 4207
if [ -d "$ROOT/langchain-langraph-workspace/langraph_project/frontend" ]; then
  start_proc "langgraph-project-frontend" \
    bash -c "cd '$ROOT/langchain-langraph-workspace/langraph_project/frontend' && \
             npm install --silent && \
             npx ng serve --port 4207 --disable-host-check"
fi

# ============================================================
#  SUMMARY TABLE
# ============================================================

echo -e "\n${BOLD}━━━  ALL SERVICES STARTED  ━━━${NC}"
echo -e "
${BOLD}App                        Frontend URL                 Backend URL${NC}
───────────────────────────────────────────────────────────────────────
Astro-Intel                http://localhost:4201         http://localhost:8080
Agentic Growth OS          http://localhost:4202         http://localhost:8001
AI Report App              http://localhost:4203         http://localhost:8002
Bench Resource Optimizer   http://localhost:4204         http://localhost:8003
Graph Visualizer           http://localhost:4205         (no backend)
LangChain Project          http://localhost:4206         http://localhost:8004
LangGraph Project          http://localhost:4207         http://localhost:8005

Logs: $LOG_DIR/
Press ${BOLD}Ctrl-C${NC} to stop everything.
"

# ── Wait for all children ─────────────────────────────────────
wait
