#!/usr/bin/env bash
# One-time build: Python deps, then the Angular production bundle that FastAPI
# serves. Kept separate from start.sh so a redeploy does not rebuild on boot.
set -euo pipefail

echo "==> Installing Python dependencies"
pip install --no-cache-dir -r backend/requirements.txt

echo "==> Building the frontend"
cd frontend
npm ci --no-audit --no-fund
npx ng build --configuration production
cd ..

echo "==> Build complete"
