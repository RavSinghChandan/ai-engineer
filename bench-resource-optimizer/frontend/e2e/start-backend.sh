#!/usr/bin/env bash
# Starts a throwaway copy of the Bench backend for Playwright.
# The copy lives in a temp folder, so the real database, users and progress are
# never touched. No .env is copied. The app refuses to start without a DeepSeek
# key, so it gets a fake one aimed at an unused local port: any AI call fails at
# once on this machine and nothing is sent out or billed. Redis / Kafka point at
# unused ports so the run never touches a local Redis or Kafka.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$(cd "$HERE/../../backend" && pwd)"
RUN_DIR="$(mktemp -d -t bench-e2e)"

rsync -a "$BACKEND/" "$RUN_DIR/" \
  --exclude venv --exclude '.env*' --exclude 'data/bench.db*' \
  --exclude data/users.json --exclude data/progress.json \
  --exclude coverage.xml --exclude __pycache__ --exclude .pytest_cache

cd "$RUN_DIR"
exec env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY \
  DEEPSEEK_API_KEY=sk-e2e-fake-key \
  DEEPSEEK_BASE_URL=http://127.0.0.1:9 \
  JWT_SECRET=e2e-jwt-secret-not-for-production \
  ADMIN_PASSWORD=E2e-Admin-Pass-1 \
  DEFAULT_USER_PASSWORD=E2e-User-Pass-1 \
  CORS_ORIGINS=http://localhost:4300,http://127.0.0.1:4300 \
  REDIS_URL=redis://127.0.0.1:6399 \
  KAFKA_BOOTSTRAP_SERVERS=127.0.0.1:9099 \
  LOG_LEVEL=WARNING \
  "$BACKEND/venv/bin/python" -m uvicorn main:app --port 8000
