#!/bin/bash
# Configure Cloud Run environment variables properly

SERVICE_NAME="voice-assistant-backend"
REGION="us-central1"

echo "🔧 Configuring Cloud Run environment variables..."

# First, let's clear all env vars
echo "Clearing existing environment variables..."
gcloud run services update $SERVICE_NAME \
  --region $REGION \
  --clear-env-vars

# Now set the required environment variables
echo "Setting production environment variables..."
gcloud run services update $SERVICE_NAME \
  --region $REGION \
  --set-env-vars="NODE_ENV=production,API_KEY_ENV=voice-assistant-api-key-2024,GOOGLE_CLOUD_PROJECT_ID=floe-voice-assistant"

# Add the OPENAI_API_KEY if provided
read -p "Enter your OpenAI API key (or press Enter to skip): " OPENAI_KEY
if [ ! -z "$OPENAI_KEY" ]; then
  gcloud run services update $SERVICE_NAME \
    --region $REGION \
    --update-env-vars="OPENAI_API_KEY=$OPENAI_KEY"
fi

echo "✅ Configuration complete!"

# Test the API
echo "Testing the API..."
curl -X POST https://voice-assistant-backend-uq63usixoa-uc.a.run.app/api/voice/process-text \
  -H "Content-Type: application/json" \
  -H "x-api-key: voice-assistant-api-key-2024" \
  -d '{"text": "Hello", "sessionId": "test123", "platform": "ios"}' \
  -w "\n"