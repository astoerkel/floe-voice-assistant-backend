# Setting Up Google Text-to-Speech for Backend

The iOS app relies on the backend to convert text to speech. Here's how to set it up:

## Option 1: Using Service Account (Recommended)

### 1. Create Service Account
```bash
# Set your project
gcloud config set project southern-engine-461211-j3

# Create service account
gcloud iam service-accounts create voice-assistant-tts \
  --display-name="Voice Assistant TTS Service"

# Grant Text-to-Speech permissions
gcloud projects add-iam-policy-binding southern-engine-461211-j3 \
  --member="serviceAccount:voice-assistant-tts@southern-engine-461211-j3.iam.gserviceaccount.com" \
  --role="roles/cloudtexttospeech.admin"

# Create and download key
gcloud iam service-accounts keys create voice-assistant-ios-key.json \
  --iam-account=voice-assistant-tts@southern-engine-461211-j3.iam.gserviceaccount.com
```

### 2. Configure Backend
Add to your `.env` file:
```bash
# Option A: Point to the key file
GOOGLE_APPLICATION_CREDENTIALS=./voice-assistant-ios-key.json

# Option B: Or use the JSON directly (for Railway/Cloud deployment)
GOOGLE_APPLICATION_CREDENTIALS_JSON='paste-your-json-here'
```

### 3. For Railway Deployment
```bash
# Convert JSON to single line and add as environment variable
cat voice-assistant-ios-key.json | jq -c . | pbcopy
# Then paste in Railway dashboard as GOOGLE_APPLICATION_CREDENTIALS_JSON
```

## Option 2: Using API Key (Quick Fix)

### 1. Modify the Text-to-Speech Service
Update `voice-assistant-backend/src/services/ai/textToSpeech.js`:

```javascript
// Replace the constructor
constructor() {
  // If using API key instead of service account
  if (process.env.GOOGLE_TTS_API_KEY) {
    this.apiKey = process.env.GOOGLE_TTS_API_KEY;
    this.useApiKey = true;
  } else {
    // Original service account code
    this.client = new textToSpeech.TextToSpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
    });
  }
}
```

### 2. Add API Key to .env
```bash
GOOGLE_TTS_API_KEY=your-new-restricted-api-key
```

## Testing

### 1. Test Locally
```bash
cd voice-assistant-backend
npm run dev
```

### 2. Test the Endpoint
```bash
curl -X POST http://localhost:8080/api/voice/process \
  -H "Content-Type: application/json" \
  -H "x-api-key: voice-assistant-api-key-secure-2024" \
  -d '{"text": "Hello, this is a test"}'
```

### 3. Check Logs
Look for errors related to:
- "GOOGLE_APPLICATION_CREDENTIALS"
- "TextToSpeechClient"
- "Authentication failed"

## Current Status
- ❌ Service account file exists but is empty
- ❌ No GOOGLE_APPLICATION_CREDENTIALS in .env
- ❌ Text-to-Speech service can't authenticate
- ✅ API endpoints are set up correctly
- ✅ iOS app is calling the right endpoints

## Fix Priority
1. Set up service account (5 minutes)
2. Add to .env file (1 minute)
3. Restart backend (1 minute)
4. Test from iOS app

The app should start working again once the backend can authenticate with Google Text-to-Speech!