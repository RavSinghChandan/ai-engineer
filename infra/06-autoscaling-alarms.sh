#!/usr/bin/env bash
# Phase 5 — Step 6: CloudWatch alarms + ECS auto-scaling
# Usage: ALERT_EMAIL=you@email.com bash infra/06-autoscaling-alarms.sh

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
ALERT_EMAIL="${ALERT_EMAIL:?Set ALERT_EMAIL}"
CLUSTER="astrointel-cluster"
API_SERVICE="astrointel-api-service"

echo "==> Creating SNS alert topic..."

TOPIC_ARN=$(aws sns create-topic \
  --name astrointel-alerts \
  --region "$AWS_REGION" \
  --query 'TopicArn' --output text)

aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol email \
  --notification-endpoint "$ALERT_EMAIL" \
  --region "$AWS_REGION" > /dev/null

echo "  ✓ SNS topic created — confirm subscription in your email"

# ── CloudWatch Alarms ─────────────────────────────────────────────────────────
echo ""
echo "==> Creating CloudWatch alarms..."

# 1. High CPU on API service → scale out + alert
aws cloudwatch put-metric-alarm \
  --alarm-name "AstroIntel-API-HighCPU" \
  --alarm-description "API CPU > 70% for 2 consecutive minutes" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --dimensions Name=ClusterName,Value=$CLUSTER Name=ServiceName,Value=$API_SERVICE \
  --statistic Average \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 70 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions "$TOPIC_ARN" \
  --region "$AWS_REGION"

# 2. Task count drops to 0 (crash / OOM)
aws cloudwatch put-metric-alarm \
  --alarm-name "AstroIntel-API-NoTasks" \
  --alarm-description "API running task count = 0 (all tasks crashed)" \
  --metric-name RunningTaskCount \
  --namespace AWS/ECS \
  --dimensions Name=ClusterName,Value=$CLUSTER Name=ServiceName,Value=$API_SERVICE \
  --statistic Average \
  --period 60 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --alarm-actions "$TOPIC_ARN" \
  --region "$AWS_REGION"

# 3. RDS high connections
aws cloudwatch put-metric-alarm \
  --alarm-name "AstroIntel-RDS-HighConnections" \
  --alarm-description "RDS connections > 80 (pool exhaustion risk)" \
  --metric-name DatabaseConnections \
  --namespace AWS/RDS \
  --dimensions Name=DBInstanceIdentifier,Value=astrointel-db \
  --statistic Average \
  --period 60 \
  --evaluation-periods 3 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions "$TOPIC_ARN" \
  --region "$AWS_REGION"

echo "  ✓ 3 CloudWatch alarms created"

# ── ECS Auto Scaling ──────────────────────────────────────────────────────────
echo ""
echo "==> Setting up ECS auto-scaling (2–10 tasks)..."

aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id "service/$CLUSTER/$API_SERVICE" \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10 \
  --region "$AWS_REGION"

# Scale out when CPU > 60%
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id "service/$CLUSTER/$API_SERVICE" \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name "AstroIntel-API-ScaleOut" \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 60.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleOutCooldown": 60,
    "ScaleInCooldown": 300
  }' \
  --region "$AWS_REGION"

echo "  ✓ Auto-scaling configured: 2–10 tasks, target CPU 60%"
echo ""
echo "==> Phase 5 infrastructure complete."
