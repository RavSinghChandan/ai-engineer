#!/usr/bin/env bash
# Phase 4 — Step 5: Create ECS Fargate cluster + task definitions + services
# Usage: Fill in variables, then run: bash infra/05-ecs-fargate.sh

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
SECRET_ARN="${SECRET_ARN:?Set SECRET_ARN (from 04-secrets-manager.sh)}"
EXECUTION_ROLE_ARN="${EXECUTION_ROLE_ARN:?Set EXECUTION_ROLE_ARN (ECS task execution role)}"
SUBNET_IDS="${SUBNET_IDS:?Set SUBNET_IDS (comma-separated)}"
SECURITY_GROUP_ID="${SECURITY_GROUP_ID:?Set SECURITY_GROUP_ID}"

echo "==> Creating ECS Fargate cluster..."

aws ecs create-cluster \
  --cluster-name astrointel-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --region "$AWS_REGION" 2>/dev/null || echo "  · Cluster already exists"

echo "  ✓ Cluster: astrointel-cluster"

# ── Register API task definition ──────────────────────────────────────────────
echo ""
echo "==> Registering API task definition..."

aws ecs register-task-definition \
  --family astrointel-api \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu "512" \
  --memory "1024" \
  --execution-role-arn "$EXECUTION_ROLE_ARN" \
  --task-role-arn "$EXECUTION_ROLE_ARN" \
  --container-definitions "[
    {
      \"name\": \"astrointel-api\",
      \"image\": \"${ECR_REGISTRY}/astrointel-api:latest\",
      \"portMappings\": [{\"containerPort\": 8080, \"protocol\": \"tcp\"}],
      \"essential\": true,
      \"secrets\": [
        {\"name\": \"OPENAI_API_KEY\",       \"valueFrom\": \"${SECRET_ARN}:OPENAI_API_KEY::\"},
        {\"name\": \"RESEND_API_KEY\",        \"valueFrom\": \"${SECRET_ARN}:RESEND_API_KEY::\"},
        {\"name\": \"JWT_SECRET\",            \"valueFrom\": \"${SECRET_ARN}:JWT_SECRET::\"},
        {\"name\": \"MASTER_API_KEY\",        \"valueFrom\": \"${SECRET_ARN}:MASTER_API_KEY::\"},
        {\"name\": \"PW_SALT\",               \"valueFrom\": \"${SECRET_ARN}:PW_SALT::\"},
        {\"name\": \"SUPERADMIN_PASSWORD\",   \"valueFrom\": \"${SECRET_ARN}:SUPERADMIN_PASSWORD::\"},
        {\"name\": \"DATABASE_URL\",          \"valueFrom\": \"${SECRET_ARN}:DATABASE_URL::\"},
        {\"name\": \"ALLOWED_ORIGINS\",       \"valueFrom\": \"${SECRET_ARN}:ALLOWED_ORIGINS::\"}
      ],
      \"environment\": [
        {\"name\": \"APP_ENV\", \"value\": \"production\"}
      ],
      \"logConfiguration\": {
        \"logDriver\": \"awslogs\",
        \"options\": {
          \"awslogs-group\": \"/ecs/astrointel-api\",
          \"awslogs-region\": \"${AWS_REGION}\",
          \"awslogs-stream-prefix\": \"ecs\",
          \"awslogs-create-group\": \"true\"
        }
      },
      \"healthCheck\": {
        \"command\": [\"CMD-SHELL\", \"curl -f http://localhost:8080/health || exit 1\"],
        \"interval\": 30, \"timeout\": 10, \"retries\": 3, \"startPeriod\": 30
      }
    }
  ]" \
  --region "$AWS_REGION"

echo "  ✓ API task definition registered"

# ── Register Web task definition ──────────────────────────────────────────────
echo ""
echo "==> Registering Web task definition..."

aws ecs register-task-definition \
  --family astrointel-web \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu "256" \
  --memory "512" \
  --execution-role-arn "$EXECUTION_ROLE_ARN" \
  --container-definitions "[
    {
      \"name\": \"astrointel-web\",
      \"image\": \"${ECR_REGISTRY}/astrointel-web:latest\",
      \"portMappings\": [{\"containerPort\": 80, \"protocol\": \"tcp\"}],
      \"essential\": true,
      \"logConfiguration\": {
        \"logDriver\": \"awslogs\",
        \"options\": {
          \"awslogs-group\": \"/ecs/astrointel-web\",
          \"awslogs-region\": \"${AWS_REGION}\",
          \"awslogs-stream-prefix\": \"ecs\",
          \"awslogs-create-group\": \"true\"
        }
      },
      \"healthCheck\": {
        \"command\": [\"CMD-SHELL\", \"wget -qO- http://localhost/nginx-health || exit 1\"],
        \"interval\": 30, \"timeout\": 5, \"retries\": 3, \"startPeriod\": 10
      }
    }
  ]" \
  --region "$AWS_REGION"

echo "  ✓ Web task definition registered"

# ── Create ECS Services ───────────────────────────────────────────────────────
IFS=',' read -ra SUBNETS <<< "$SUBNET_IDS"
NETWORK_CONFIG="awsvpcConfiguration={subnets=[$(IFS=,; echo "${SUBNETS[*]}")],securityGroups=[$SECURITY_GROUP_ID],assignPublicIp=DISABLED}"

echo ""
echo "==> Creating ECS services..."

aws ecs create-service \
  --cluster astrointel-cluster \
  --service-name astrointel-api-service \
  --task-definition astrointel-api \
  --launch-type FARGATE \
  --desired-count 2 \
  --network-configuration "$NETWORK_CONFIG" \
  --deployment-configuration "minimumHealthyPercent=100,maximumPercent=200,deploymentCircuitBreaker={enable=true,rollback=true}" \
  --region "$AWS_REGION" 2>/dev/null || echo "  · API service already exists"

aws ecs create-service \
  --cluster astrointel-cluster \
  --service-name astrointel-web-service \
  --task-definition astrointel-web \
  --launch-type FARGATE \
  --desired-count 2 \
  --network-configuration "$NETWORK_CONFIG" \
  --deployment-configuration "minimumHealthyPercent=100,maximumPercent=200,deploymentCircuitBreaker={enable=true,rollback=true}" \
  --region "$AWS_REGION" 2>/dev/null || echo "  · Web service already exists"

echo "  ✓ ECS services created (2 tasks each)"
echo ""
echo "==> Infrastructure ready. Next: configure ALB and point DNS."
