#!/usr/bin/env bash
# deploy-ec2.sh — Deploy AstroIntel to EC2 via SSH
# Usage: ./deploy-ec2.sh <ec2-host> <pem-file>
# Example: ./deploy-ec2.sh ec2-1-2-3-4.compute.amazonaws.com ~/.ssh/my-key.pem
set -euo pipefail

EC2_HOST="${1:?Usage: $0 <ec2-host> <pem-file>}"
PEM_FILE="${2:?Usage: $0 <ec2-host> <pem-file>}"
EC2_USER="ubuntu"
REMOTE_DIR="/opt/astrointel"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Deploying AstroIntel to $EC2_HOST"

# ── 1. Ensure .env exists locally ────────────────────────────────────────────
if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in secrets."
  exit 1
fi

# ── 2. Bootstrap EC2 (idempotent — safe to run multiple times) ───────────────
echo "==> Installing Docker on EC2 (if not already installed)..."
ssh -i "$PEM_FILE" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" bash <<'REMOTE'
  set -e
  if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker ubuntu
    newgrp docker
  fi
  if ! command -v docker-compose &>/dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
      -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
  fi
  sudo mkdir -p /opt/astrointel
  sudo chown ubuntu:ubuntu /opt/astrointel
REMOTE

# ── 3. Copy project files to EC2 ─────────────────────────────────────────────
echo "==> Syncing project files..."
rsync -avz --progress \
  --exclude '.git' \
  --exclude 'venv' \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude 'tests' \
  --exclude 'auth_keys.json' \
  -e "ssh -i $PEM_FILE -o StrictHostKeyChecking=no" \
  "$APP_DIR/" "$EC2_USER@$EC2_HOST:$REMOTE_DIR/"

# ── 4. Build and start ────────────────────────────────────────────────────────
echo "==> Building and starting containers..."
ssh -i "$PEM_FILE" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" bash <<REMOTE
  set -e
  cd $REMOTE_DIR
  docker-compose pull 2>/dev/null || true
  docker-compose build --no-cache
  docker-compose up -d
  echo "==> Waiting for health check..."
  sleep 10
  docker-compose ps
  curl -sf http://localhost:8080/health && echo "" && echo "✓ Health check passed"
REMOTE

echo ""
echo "==> Deployment complete!"
echo "    API:  http://$EC2_HOST:8080"
echo "    Docs: http://$EC2_HOST:8080/docs"
echo ""
echo "    First-time setup:"
echo "    1. Your SUPERADMIN key = value of MASTER_API_KEY in .env"
echo "    2. Create your first tenant:"
echo "       curl -X POST http://$EC2_HOST:8080/admin/tenants \\"
echo "         -H 'X-API-Key: <your-MASTER_API_KEY>' \\"
echo "         -H 'Content-Type: application/json' \\"
echo "         -d '{\"name\": \"My Tenant\"}'"
