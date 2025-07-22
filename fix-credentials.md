# Fix OpenRouter and Google Cloud TTS Credentials

## 1. Get New OpenRouter API Key

### Steps:
1. Go to https://openrouter.ai/keys
2. Log in to your account
3. Create a new API key
4. Copy the key (starts with `sk-or-v1-`)

### Add to .env:
Replace line 21 in `.env` with your new key:
```bash
OPENROUTER_API_KEY=sk-or-v1-YOUR_ACTUAL_KEY_HERE
```

## 2. Set up Google Cloud TTS Credentials

### Option A: Use Service Account (Recommended)
Run these commands in terminal:

```bash
# Make sure you're in the right directory
cd /Users/amitstorkel/Projects/VoiceAssistantIOS/VoiceAssistant/voice-assistant-backend

# Set your project
gcloud config set project southern-engine-461211-j3

# Create service account (if it doesn't exist)
gcloud iam service-accounts create voice-assistant-tts \
  --display-name="Voice Assistant TTS Service" || echo "Service account may already exist"

# Grant Text-to-Speech permissions
gcloud projects add-iam-policy-binding southern-engine-461211-j3 \
  --member="serviceAccount:voice-assistant-tts@southern-engine-461211-j3.iam.gserviceaccount.com" \
  --role="roles/cloudtexttospeech.admin"

# Create and download key
gcloud iam service-accounts keys create voice-assistant-ios-key.json \
  --iam-account=voice-assistant-tts@southern-engine-461211-j3.iam.gserviceaccount.com
```

### Option B: Use API Key (Quick Fix)
If you prefer using an API key:

1. Go to https://console.cloud.google.com/apis/credentials
2. Select project "southern-engine-461211-j3"
3. Click "Create Credentials" > "API Key"
4. Restrict the key to "Cloud Text-to-Speech API"
5. Copy the API key

Then add to `.env`:
```bash
GOOGLE_TTS_API_KEY=your-api-key-here
```

## 3. Test Setup

Once you've set up the credentials, run:
```bash
node test-tts-only.js
```

This will test both the coordinator (OpenRouter) and TTS (Google Cloud) functionality.