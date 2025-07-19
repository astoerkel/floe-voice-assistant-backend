#!/bin/bash

# Script to reset all Cloud Run environment variables and redeploy

SERVICE_NAME="voice-assistant-backend"
REGION="us-central1"
PROJECT_ID="floe-voice-assistant"

echo "🔄 Resetting Cloud Run service environment variables..."

# Step 1: Clear all environment variables
echo "Step 1: Clearing all environment variables..."
gcloud run services update $SERVICE_NAME \
  --region $REGION \
  --clear-env-vars \
  --quiet || echo "No env vars to clear"

# Step 2: Clear all secrets
echo "Step 2: Clearing all secrets..."
gcloud run services update $SERVICE_NAME \
  --region $REGION \
  --clear-secrets \
  --quiet || echo "No secrets to clear"

# Step 3: Wait a moment for changes to propagate
echo "Step 3: Waiting for changes to propagate..."
sleep 5

# Step 4: Get the latest image
echo "Step 4: Getting latest image..."
LATEST_IMAGE=$(gcloud container images list-tags gcr.io/$PROJECT_ID/$SERVICE_NAME --limit=1 --format='get(tags)' | head -n1)
if [ -z "$LATEST_IMAGE" ]; then
  LATEST_IMAGE="latest"
fi
IMAGE_URI="gcr.io/$PROJECT_ID/$SERVICE_NAME:$LATEST_IMAGE"
echo "Using image: $IMAGE_URI"

# Step 5: Deploy with fresh environment variables
echo "Step 5: Deploying with fresh environment variables..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_URI \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --min-instances=1 \
  --max-instances=10 \
  --set-env-vars="NODE_ENV=production,API_KEY_ENV=${API_KEY_ENV:-voice-assistant-api-key-2024},OPENAI_API_KEY=${OPENAI_API_KEY}"

# Step 6: Verify deployment
echo "Step 6: Verifying deployment..."
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')
echo "Service URL: $SERVICE_URL"

# Step 7: Test health endpoint
echo "Step 7: Testing health endpoint..."
sleep 10 # Wait for service to be ready
curl -s "$SERVICE_URL/health" | jq . || echo "Health check failed"

echo "✅ Deployment complete!"
echo ""
echo "To test the API:"
echo "curl -X POST $SERVICE_URL/api/voice/process-text \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -H \"x-api-key: voice-assistant-api-key-2024\" \\"
echo "  -d '{\"text\": \"Hello\", \"sessionId\": \"test123\", \"platform\": \"ios\"}'"