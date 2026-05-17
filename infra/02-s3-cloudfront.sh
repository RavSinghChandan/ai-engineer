#!/usr/bin/env bash
# Phase 4 — Step 2: Create S3 bucket + CloudFront for Angular frontend
# Usage: DOMAIN=aura.yourdomain.com AWS_REGION=ap-south-1 bash infra/02-s3-cloudfront.sh

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
BUCKET_NAME="${BUCKET_NAME:-astrointel-web-$(date +%s)}"
DOMAIN="${DOMAIN:-}"   # Optional: your custom domain

echo "==> Creating S3 bucket: $BUCKET_NAME"

aws s3api create-bucket \
  --bucket "$BUCKET_NAME" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

# Block all public access — CloudFront will be the only entry point
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "  ✓ S3 bucket created and public access blocked"

# Enable versioning for rollback capability
aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled

echo "  ✓ Versioning enabled"

echo ""
echo "==> Creating CloudFront Origin Access Control (OAC)..."

OAC_ID=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config \
    "Name=astrointel-oac,SigningBehavior=always,SigningProtocol=sigv4,OriginAccessControlOriginType=s3" \
  --query 'OriginAccessControl.Id' --output text)

echo "  ✓ OAC created: $OAC_ID"

echo ""
echo "==> Creating CloudFront distribution..."

DIST_ID=$(aws cloudfront create-distribution \
  --distribution-config "{
    \"CallerReference\": \"astrointel-$(date +%s)\",
    \"Comment\": \"AstroIntel Angular SPA\",
    \"DefaultRootObject\": \"index.html\",
    \"Origins\": {
      \"Quantity\": 1,
      \"Items\": [{
        \"Id\": \"s3-origin\",
        \"DomainName\": \"${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com\",
        \"S3OriginConfig\": {\"OriginAccessIdentity\": \"\"},
        \"OriginAccessControlId\": \"${OAC_ID}\"
      }]
    },
    \"DefaultCacheBehavior\": {
      \"TargetOriginId\": \"s3-origin\",
      \"ViewerProtocolPolicy\": \"redirect-to-https\",
      \"CachePolicyId\": \"658327ea-f89d-4fab-a63d-7e88639e58f6\",
      \"Compress\": true
    },
    \"CustomErrorResponses\": {
      \"Quantity\": 1,
      \"Items\": [{
        \"ErrorCode\": 404,
        \"ResponseCode\": \"200\",
        \"ResponsePagePath\": \"/index.html\",
        \"ErrorCachingMinTTL\": 10
      }]
    },
    \"Enabled\": true,
    \"HttpVersion\": \"http2and3\",
    \"PriceClass\": \"PriceClass_200\"
  }" \
  --query 'Distribution.Id' --output text)

echo "  ✓ CloudFront distribution created: $DIST_ID"
echo ""
echo "==> Summary"
echo "  S3 Bucket:      $BUCKET_NAME"
echo "  CloudFront ID:  $DIST_ID"
echo ""
echo "Add to GitHub secrets:"
echo "  S3_BUCKET=$BUCKET_NAME"
echo "  CF_DISTRIBUTION_ID=$DIST_ID"
echo ""
echo "Add to .github/workflows/deploy.yml to sync on deploy:"
echo "  aws s3 sync astro-intel/dist/astro-intel/browser/ s3://$BUCKET_NAME/ --delete"
echo "  aws cloudfront create-invalidation --distribution-id $DIST_ID --paths '/*'"
