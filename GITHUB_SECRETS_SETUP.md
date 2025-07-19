# GitHub Secrets Setup Guide

## Required GitHub Secrets

You need to add the following secrets to your GitHub repository for the CI/CD pipeline to work correctly:

### 1. GCP_SA_KEY (✅ Already Set)
- **Description**: Google Cloud service account key for deployment
- **Value**: The JSON content of your service account key file

### 2. API_KEY (❌ Currently Empty - NEEDS TO BE SET)
- **Description**: API key for authentication between iOS app and backend
- **Value**: `voice-assistant-api-key-2024`
- **How to set**:
  1. Go to https://github.com/astoerkel/floe-voice-assistant-backend/settings/secrets/actions
  2. Click "New repository secret"
  3. Name: `API_KEY`
  4. Value: `voice-assistant-api-key-2024`
  5. Click "Add secret"

### 3. OPENAI_API_KEY (Optional but recommended)
- **Description**: OpenAI API key for GPT-4 and Whisper
- **Value**: Your OpenAI API key from https://platform.openai.com/api-keys
- **How to set**:
  1. Go to https://github.com/astoerkel/floe-voice-assistant-backend/settings/secrets/actions
  2. Click "New repository secret"
  3. Name: `OPENAI_API_KEY`
  4. Value: Your actual OpenAI API key
  5. Click "Add secret"

## Verification

After setting the secrets, you can verify they're working by:

1. Triggering a new deployment:
   ```bash
   git commit --allow-empty -m "Trigger deployment with updated secrets"
   git push origin main
   ```

2. Check the deployment logs in GitHub Actions

3. Test the API:
   ```bash
   curl -X POST https://voice-assistant-backend-899362685715.us-central1.run.app/api/voice/process-text \
     -H "Content-Type: application/json" \
     -H "x-api-key: voice-assistant-api-key-2024" \
     -d '{"text": "Hello", "sessionId": "test123", "platform": "ios"}'
   ```

## Important Notes

- The `API_KEY` is used for authentication between the iOS app and backend
- It's not a Google API key - it's a custom key we defined
- The same key must be used in both the backend and iOS app
- For production, you should use a more secure, randomly generated key