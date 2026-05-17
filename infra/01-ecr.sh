#!/usr/bin/env bash
# Phase 4 — Step 1: Create ECR repositories for Docker images
# Run once before first deploy.
# Usage: AWS_ACCOUNT_ID=123456789 AWS_REGION=ap-south-1 bash infra/01-ecr.sh

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"

echo "==> Creating ECR repositories in $AWS_REGION..."

for REPO in astrointel-api astrointel-web; do
  aws ecr create-repository \
    --repository-name "$REPO" \
    --region "$AWS_REGION" \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 \
    2>/dev/null && echo "  ✓ Created $REPO" || echo "  · $REPO already exists"
done

echo ""
echo "ECR registry: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
echo "Add this as GitHub secret: AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID}"
