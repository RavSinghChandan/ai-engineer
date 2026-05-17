#!/usr/bin/env bash
# Phase 4 — Step 4: Store all secrets in AWS Secrets Manager
# Usage: Fill in values below, then run: bash infra/04-secrets-manager.sh

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"

# ── Set these before running ──────────────────────────────────────────────────
OPENAI_API_KEY="${OPENAI_API_KEY:?Set OPENAI_API_KEY}"
RESEND_API_KEY="${RESEND_API_KEY:?Set RESEND_API_KEY}"
JWT_SECRET="${JWT_SECRET:?Set JWT_SECRET}"
MASTER_API_KEY="${MASTER_API_KEY:?Set MASTER_API_KEY}"
PW_SALT="${PW_SALT:?Set PW_SALT}"
SUPERADMIN_PASSWORD="${SUPERADMIN_PASSWORD:?Set SUPERADMIN_PASSWORD}"
DATABASE_URL="${DATABASE_URL:?Set DATABASE_URL (postgresql://...)}"
# ─────────────────────────────────────────────────────────────────────────────

SECRET_NAME="astrointel/production"

echo "==> Storing secrets in AWS Secrets Manager: $SECRET_NAME"

SECRET_VALUE=$(cat <<EOF
{
  "OPENAI_API_KEY": "$OPENAI_API_KEY",
  "RESEND_API_KEY": "$RESEND_API_KEY",
  "JWT_SECRET": "$JWT_SECRET",
  "MASTER_API_KEY": "$MASTER_API_KEY",
  "PW_SALT": "$PW_SALT",
  "SUPERADMIN_PASSWORD": "$SUPERADMIN_PASSWORD",
  "DATABASE_URL": "$DATABASE_URL",
  "APP_ENV": "production",
  "ALLOWED_ORIGINS": "https://your-cloudfront-domain.cloudfront.net"
}
EOF
)

# Create or update the secret
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$AWS_REGION" &>/dev/null; then
  aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SECRET_VALUE" \
    --region "$AWS_REGION"
  echo "  ✓ Secret updated: $SECRET_NAME"
else
  aws secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --description "AstroIntel production secrets" \
    --secret-string "$SECRET_VALUE" \
    --region "$AWS_REGION"
  echo "  ✓ Secret created: $SECRET_NAME"
fi

echo ""
echo "Secret ARN:"
aws secretsmanager describe-secret \
  --secret-id "$SECRET_NAME" \
  --query 'ARN' --output text --region "$AWS_REGION"
echo ""
echo "Add this ARN to your ECS task definition as a secrets source."
