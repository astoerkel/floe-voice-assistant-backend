# Fix: iOS App Restriction Error

## The Problem
Your API key is restricted to iOS apps only, but we're calling it from a Node.js server. 

Error: `"Requests from this iOS client application <empty> are blocked."`

## Solution: Remove iOS Restriction

### Method 1: Edit Existing Key (Fastest)
1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your API key 
3. Click the pencil icon (edit)
4. Under **"Application restrictions"**:
   - Currently set to: "iOS apps"  
   - Change to: **"None"** (for development)
   - OR select **"HTTP referrers"** and add your domains
5. Click **SAVE**

### Method 2: Create New Unrestricted Key
1. Go to: https://console.cloud.google.com/apis/credentials  
2. Click **"+ CREATE CREDENTIALS"** → **"API key"**
3. Click **"RESTRICT KEY"**
4. Under **"Application restrictions"**: Select **"None"**
5. Under **"API restrictions"**: Select **"Restrict key"** → **"Cloud Text-to-Speech API"**
6. Click **SAVE**
7. Replace key in `.env` file

### Security Note
For production, you should use application restrictions like:
- **HTTP referrers**: Add your domain (e.g., `https://your-domain.com/*`)
- **IP addresses**: Add your server IP

## Test After Fix
```bash
node validate-credentials.js
```

Should show: ✅ Google TTS API key is valid and working