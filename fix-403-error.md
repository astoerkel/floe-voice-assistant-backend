# Fix Google TTS 403 Forbidden Error

## Common Causes & Solutions

### 1. Enable the Text-to-Speech API
**Most Common Issue**
- Go to: https://console.cloud.google.com/apis/library/texttospeech.googleapis.com
- Make sure project "southern-engine-461211-j3" is selected
- Click **"ENABLE"** if the button shows
- Wait 1-2 minutes for the API to be fully enabled

### 2. Check API Key Restrictions
- Go to: https://console.cloud.google.com/apis/credentials
- Find your API key
- Click the pencil icon to edit
- Under "API restrictions":
  - Make sure "Cloud Text-to-Speech API" is selected
  - If "None" is selected, change to "Restrict key" and add "Cloud Text-to-Speech API"
- Click **SAVE**

### 3. Check Project Permissions
- Go to: https://console.cloud.google.com/iam-admin/iam
- Make sure your account has "Cloud Text-to-Speech API User" role

### 4. Try a Fresh API Key
If the above doesn't work:
- Go to: https://console.cloud.google.com/apis/credentials
- Create a new API key
- Restrict it to "Cloud Text-to-Speech API"
- Replace the key in your .env file

### 5. Test Steps
After making changes:
1. Wait 1-2 minutes for changes to propagate
2. Run: `node validate-credentials.js`
3. Should show "✅ Google TTS API key is valid and working"

## Quick Debug
Run this to see the exact error:
```bash
curl "https://texttospeech.googleapis.com/v1/voices?key=AIzaSyAO-B17TS4cKljqlj5saf4K_Ud51Uhy6zo"
```