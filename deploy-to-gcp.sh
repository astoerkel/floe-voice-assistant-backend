#!/bin/bash

# Manual deployment script for Google Cloud Run
# This bypasses Cloud Build issues and deploys directly

set -e

echo "🚀 Starting manual deployment to Google Cloud Run..."

# Configuration
PROJECT_ID="floe-voice-assistant"
REGION="us-central1"
SERVICE_NAME="voice-assistant-backend"
IMAGE_TAG="gcr.io/$PROJECT_ID/voice-assistant-backend"

# Build the image locally for linux/amd64 platform
echo "🔨 Building Docker image locally for linux/amd64..."
docker build --platform linux/amd64 -t $IMAGE_TAG .

# Push to Artifact Registry
echo "📤 Pushing image to Artifact Registry..."
# Configure Docker for Container Registry
gcloud auth configure-docker

# Push to Container Registry
docker push $IMAGE_TAG

# Deploy to Cloud Run
echo "☁️  Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_TAG \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 2Gi \
    --cpu 2 \
    --min-instances 1 \
    --max-instances 100 \
    --timeout 900 \
    --set-env-vars NODE_ENV=production \
    --set-secrets JWT_SECRET=JWT_SECRET:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,GOOGLE_CLOUD_PROJECT_ID=GOOGLE_CLOUD_PROJECT_ID:latest,AIRTABLE_API_KEY=AIRTABLE_API_KEY:latest,DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,API_KEY=API_KEY:latest \
    --service-account voice-assistant-run@$PROJECT_ID.iam.gserviceaccount.com \
    --set-cloudsql-instances floe-voice-assistant:us-central1:voice-assistant-postgres \
    --vpc-connector voice-assistant-vpc-conn

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format "value(status.url)")

echo "✅ Deployment complete!"
echo "🌐 Service URL: $SERVICE_URL"
echo ""
echo "📱 Update your iOS app Constants.swift with:"
echo "   webhookURL = \"$SERVICE_URL/api/voice/process-audio\""
echo "   apiBaseURL = \"$SERVICE_URL/api\""
echo "   websocketURL = \"wss://$(echo $SERVICE_URL | sed 's/https:\/\///')\""