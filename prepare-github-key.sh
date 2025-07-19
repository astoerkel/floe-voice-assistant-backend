#\!/bin/bash

# Prepare service account key for GitHub secrets
echo "🔑 Preparing service account key for GitHub..."

SA_KEY_FILE="/Users/amitstorkel/Downloads/floe-voice-assistant-e906e492e62d.json"

if [ \! -f "$SA_KEY_FILE" ]; then
    echo "❌ Service account file not found at: $SA_KEY_FILE"
    exit 1
fi

echo "✅ Service account key found"
echo ""
echo "📋 GCP_SA_KEY GitHub secret value:"
echo "Copy this ENTIRE content (including all quotes and braces):"
echo ""
cat "$SA_KEY_FILE"
echo ""
echo ""
echo "🚀 Next steps:"
echo "1. Go to: https://github.com/astoerkel/floe-voice-assistant-backend/settings/secrets/actions"
echo "2. Click \"New repository secret\""
echo "3. Name: GCP_SA_KEY"
echo "4. Value: [paste the JSON content from above]"
echo "5. Click \"Add secret\""


