# Manual Fix for Cloud Run Deployment

The GitHub Actions deployment is encountering environment variable type conflicts. Here's how to fix it manually:

## Option 1: Use Google Cloud Console (Easiest)

1. Go to https://console.cloud.google.com/run
2. Select your project: `floe-voice-assistant`
3. Click on `voice-assistant-backend` service
4. Click "EDIT & DEPLOY NEW REVISION"
5. Under "Variables & Secrets" tab:
   - Click "ADD VARIABLE"
   - Add these environment variables:
     - `NODE_ENV` = `production`
     - `API_KEY_ENV` = `voice-assistant-api-key-2024`
     - `OPENAI_API_KEY` = `[your OpenAI API key]`
6. Click "DEPLOY"

## Option 2: Use gcloud CLI

```bash
# First, clear all environment variables and secrets
gcloud run services update voice-assistant-backend \
  --region us-central1 \
  --clear-env-vars

gcloud run services update voice-assistant-backend \
  --region us-central1 \
  --clear-secrets

# Then set the environment variables
gcloud run services update voice-assistant-backend \
  --region us-central1 \
  --set-env-vars="NODE_ENV=production,API_KEY_ENV=voice-assistant-api-key-2024,OPENAI_API_KEY=[your-openai-key]"
```

## Option 3: Deploy with the latest image

```bash
# Deploy using the latest image that was successfully built
gcloud run deploy voice-assistant-backend \
  --image gcr.io/floe-voice-assistant/voice-assistant-backend:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --min-instances=1 \
  --max-instances=10 \
  --set-env-vars="NODE_ENV=production,API_KEY_ENV=voice-assistant-api-key-2024,OPENAI_API_KEY=[your-openai-key]"
```

## After Deployment

Test the API:

```bash
# Test health endpoint
curl https://voice-assistant-backend-899362685715.us-central1.run.app/health

# Test voice processing
curl -X POST https://voice-assistant-backend-899362685715.us-central1.run.app/api/voice/process-text \
  -H "Content-Type: application/json" \
  -H "x-api-key: voice-assistant-api-key-2024" \
  -d '{"text": "Hello", "sessionId": "test123", "platform": "ios"}'
```

## Root Cause

The issue is that Cloud Run is treating environment variables that were previously set as secrets differently than regular environment variables. The `--set-env-vars` command fails when trying to override a variable that was previously set with `--set-secrets`.