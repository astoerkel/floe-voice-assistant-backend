# Manual Service Account Setup for Text-to-Speech

Since gcloud needs authentication, here are two options:

## Option 1: Authenticate gcloud and run script

```bash
# Navigate to backend directory
cd voice-assistant-backend

# Authenticate with Google Cloud
./google-cloud-sdk/bin/gcloud auth login

# Set the project
./google-cloud-sdk/bin/gcloud config set project southern-engine-461211-j3

# Run the setup script again
./create-service-account.sh
```

## Option 2: Use Google Cloud Console (Web UI)

### 1. Open Google Cloud Console
Open: https://console.cloud.google.com/iam-admin/serviceaccounts?project=southern-engine-461211-j3

### 2. Create Service Account
- Click "CREATE SERVICE ACCOUNT"
- Service account name: `voice-assistant-tts`
- Service account ID: `voice-assistant-tts` (auto-filled)
- Description: "Voice Assistant Text-to-Speech Service"
- Click "CREATE AND CONTINUE"

### 3. Grant Permissions
- Select role: "Cloud Text-to-Speech Admin"
- Click "CONTINUE"
- Click "DONE"

### 4. Create Key
- Find the service account in the list
- Click the three dots menu (⋮) → "Manage keys"
- Click "ADD KEY" → "Create new key"
- Choose "JSON"
- Click "CREATE"
- Save the file as `voice-assistant-ios-key.json`

### 5. Move Key to Backend
```bash
# Move the downloaded file to backend directory
mv ~/Downloads/southern-engine-*.json voice-assistant-backend/voice-assistant-ios-key.json
```

### 6. Verify Setup
```bash
cd voice-assistant-backend

# Check the file
cat voice-assistant-ios-key.json | jq '.type, .project_id, .client_email'

# Should output:
# "service_account"
# "southern-engine-461211-j3"
# "voice-assistant-tts@southern-engine-461211-j3.iam.gserviceaccount.com"
```

## Next Steps

The .env file has already been updated with:
```
GOOGLE_APPLICATION_CREDENTIALS=./voice-assistant-ios-key.json
GOOGLE_CLOUD_PROJECT_ID=southern-engine-461211-j3
```

1. Restart the backend:
   ```bash
   npm run dev
   ```

2. Test the endpoint:
   ```bash
   curl -X POST http://localhost:8080/api/voice/process \
     -H "Content-Type: application/json" \
     -H "x-api-key: voice-assistant-api-key-secure-2024" \
     -d '{"text": "Hello, this is a test"}'
   ```

3. Test from your iOS app - Text-to-Speech should work now!

## For Railway Deployment

```bash
# Convert to single line for environment variable
cat voice-assistant-ios-key.json | jq -c . | pbcopy

# Add to Railway as:
# GOOGLE_APPLICATION_CREDENTIALS_JSON = <paste>
```