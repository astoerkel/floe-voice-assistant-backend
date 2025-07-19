The GitHub Actions deployment is failing due to authentication.

Since you have the API_KEY_ENV environment variable configured in Cloud Run,
you can manually trigger a new deployment by:

1. Go to: https://console.cloud.google.com/run/detail/us-central1/voice-assistant-backend/revisions?project=floe-voice-assistant

2. Click "EDIT & DEPLOY NEW REVISION"

3. Keep all current settings (including the API_KEY_ENV variable you just added)

4. Click "Deploy"

This will deploy the latest code with the API_KEY_ENV support.

Alternatively, if the current deployment is working with API_KEY_ENV,
your iOS app should work now without needing a new deployment.

