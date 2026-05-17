#!/usr/bin/env bash
# Phase 4 — Step 3: Create RDS PostgreSQL instance with pgvector
# Usage: VPC_ID=vpc-xxx SUBNET_IDS=subnet-a,subnet-b bash infra/03-rds-postgres.sh

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
DB_INSTANCE_ID="astrointel-db"
DB_NAME="astrointel"
DB_USER="astrointel"
DB_PASSWORD="${DB_PASSWORD:?Set DB_PASSWORD env var}"
VPC_ID="${VPC_ID:?Set VPC_ID}"
SUBNET_IDS="${SUBNET_IDS:?Set SUBNET_IDS (comma-separated)}"

echo "==> Creating RDS subnet group..."

IFS=',' read -ra SUBNETS <<< "$SUBNET_IDS"
SUBNET_ARGS=""
for S in "${SUBNETS[@]}"; do SUBNET_ARGS="$SUBNET_ARGS $S"; done

aws rds create-db-subnet-group \
  --db-subnet-group-name astrointel-subnet-group \
  --db-subnet-group-description "AstroIntel RDS subnet group" \
  --subnet-ids $SUBNET_ARGS \
  --region "$AWS_REGION" 2>/dev/null || echo "  · Subnet group already exists"

echo "==> Creating RDS PostgreSQL instance (db.t3.micro)..."

aws rds create-db-instance \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version "16.3" \
  --master-username "$DB_USER" \
  --master-user-password "$DB_PASSWORD" \
  --db-name "$DB_NAME" \
  --db-subnet-group-name astrointel-subnet-group \
  --no-publicly-accessible \
  --storage-type gp3 \
  --allocated-storage 20 \
  --backup-retention-period 7 \
  --deletion-protection \
  --region "$AWS_REGION"

echo "  ✓ RDS instance creation started (takes ~5 min)"
echo ""
echo "==> Waiting for instance to be available..."
aws rds wait db-instance-available \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --region "$AWS_REGION"

ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text --region "$AWS_REGION")

echo "  ✓ RDS available at: $ENDPOINT"
echo ""
echo "==> Enabling pgvector extension (connect and run):"
echo "  psql postgresql://$DB_USER:*****@$ENDPOINT:5432/$DB_NAME -c 'CREATE EXTENSION IF NOT EXISTS vector;'"
echo ""
echo "DATABASE_URL for Secrets Manager / ECS:"
echo "  postgresql://$DB_USER:$DB_PASSWORD@$ENDPOINT:5432/$DB_NAME"
