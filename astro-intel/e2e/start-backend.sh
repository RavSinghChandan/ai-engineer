#!/usr/bin/env bash
# Starts a throwaway copy of the AstroIntel backend for Playwright.
# The copy lives in a temp folder, so real users, leads, keys and the database
# are never touched. No .env is copied and every LLM / email key is removed,
# so the run makes no paid or outbound calls.
# Live mode (E2E_LIVE=1, `npm run e2e:live`) copies only the DEEPSEEK_* lines of
# the real .env into the copy, file to file, so the AI flows run for real (paid).
# Email and other keys still stay out.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$(cd "$HERE/../../astro-intel-backend" && pwd)"
# Clear copies left by earlier runs (Playwright stops the server with a hard kill).
rm -rf "${TMPDIR:-/tmp}"/astro-e2e.*
RUN_DIR="$(mktemp -d -t astro-e2e)"

rsync -a "$BACKEND/" "$RUN_DIR/" \
  --exclude venv --exclude '.env*' --exclude '*.db' --exclude '*.db-*' \
  --exclude users.json --exclude leads.json --exclude auth_keys.json \
  --exclude coverage.xml --exclude __pycache__ --exclude .pytest_cache

if [ "${E2E_LIVE:-}" = 1 ]; then
  grep '^DEEPSEEK_' "$BACKEND/.env" > "$RUN_DIR/.env"
  # The app reads .env once at start-up; remove the key copy as soon as it is up.
  ( until curl -sf http://localhost:8080/health > /dev/null; do sleep 1; done; rm -f "$RUN_DIR/.env" ) &
fi

cd "$RUN_DIR"
exec env -u DEEPSEEK_API_KEY -u OPENAI_API_KEY -u ANTHROPIC_API_KEY \
  -u RESEND_API_KEY -u SMTP_USER -u SMTP_PASSWORD -u DATABASE_URL \
  APP_ENV=development \
  JWT_SECRET=e2e-jwt-secret-not-for-production \
  MASTER_API_KEY=sk-e2e-master-key \
  PW_SALT=e2e-salt \
  SUPERADMIN_EMAIL=admin@e2e.test \
  SUPERADMIN_PASSWORD=E2e-Admin-Pass-1 \
  ALLOWED_ORIGINS=http://localhost:4200,http://e2e.astro.test:4200 \
  "$BACKEND/venv/bin/python" -m uvicorn main:app --port 8080
