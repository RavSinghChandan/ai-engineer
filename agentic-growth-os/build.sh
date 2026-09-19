#!/usr/bin/env bash
# One-time build: Python deps, then the Angular production bundle that FastAPI
# serves. Kept separate from start.sh so a redeploy does not rebuild on boot.
set -euo pipefail

# Install into the interpreter that start.sh will run, not whichever pip
# happens to be first on PATH - otherwise the server starts without uvicorn.
PY="${PYTHON:-python3}"
echo "==> Installing Python dependencies with $("$PY" -c 'import sys; print(sys.executable)')"
"$PY" -m pip install --no-cache-dir -r backend/requirements.txt

echo "==> Building the frontend"
cd frontend
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
npx ng build --configuration production
cd ..

echo "==> Build complete"
