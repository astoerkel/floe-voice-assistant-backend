# Get Google Cloud Text-to-Speech API Key

## Quick Setup (5 minutes)

### 1. Go to Google Cloud Console
Visit: https://console.cloud.google.com/apis/credentials

### 2. Select Your Project  
- Make sure "southern-engine-461211-j3" is selected in the project dropdown
- If not, click the project selector and choose it

### 3. Create API Key
- Click "**+ CREATE CREDENTIALS**" 
- Select "**API key**"
- Copy the API key that appears (starts with "AIza...")

### 4. Restrict the API Key (Important for security)
- Click "**RESTRICT KEY**" in the popup, or click the pencil icon next to your new key
- Under "API restrictions":
  - Select "**Restrict key**"  
  - Choose "**Cloud Text-to-Speech API**"
- Click "**SAVE**"

### 5. Enable the API (if not already enabled)
- Go to https://console.cloud.google.com/apis/library/texttospeech.googleapis.com
- Click "**ENABLE**" if the button shows

### 6. Add to Your .env File
Add this line to your `.env` file:
```bash
GOOGLE_TTS_API_KEY=AIzaYourActualKeyHere
```

### 7. Test
Run this command to test:
```bash
node validate-credentials.js
```

## Alternative: Use Existing Service Account
If you prefer to use a service account instead:

1. Go to https://console.cloud.google.com/iam-admin/serviceaccounts
2. Find the "voice-assistant-tts" service account 
3. Click Actions (⋮) → "Manage keys"
4. Click "Add Key" → "Create new key" → JSON
5. Download and save as `voice-assistant-ios-key.json`

Both methods will work - API key is simpler for local development!