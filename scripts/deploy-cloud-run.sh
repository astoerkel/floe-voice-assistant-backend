#!/bin/bash

# Script to deploy to Cloud Run with proper environment variable handling

SERVICE_NAME="voice-assistant-backend"
REGION="us-central1"
PROJECT_ID="floe-voice-assistant"
IMAGE_TAG="$1"
API_KEY="$2"
OPENAI_API_KEY="$3"

if [ -z "$IMAGE_TAG" ] || [ -z "$API_KEY" ] || [ -z "$OPENAI_API_KEY" ]; then
  echo "Usage: ./deploy-cloud-run.sh <image_tag> <api_key> <openai_api_key>"
  exit 1
fi

echo "Deploying $SERVICE_NAME with image tag: $IMAGE_TAG"

# First, clear any existing secrets to avoid conflicts
echo "Clearing existing secrets..."
gcloud run services update $SERVICE_NAME \
  --region $REGION \
  --clear-secrets 2>/dev/null || true

# Deploy with environment variables
echo "Deploying with environment variables..."
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME:$IMAGE_TAG \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --min-instances=1 \
  --max-instances=10 \
  --set-env-vars="NODE_ENV=production,API_KEY_ENV=$API_KEY,OPENAI_API_KEY=$OPENAI_API_KEY"

echo "Deployment complete!"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')
echo "Service URL: $SERVICE_URL"