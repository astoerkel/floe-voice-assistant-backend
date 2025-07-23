#!/bin/bash

# Check OpenRouter API Key Status
# This script checks the current OpenRouter configuration on the Hetzner server

echo "🔍 Checking OpenRouter API Key Status on Hetzner Server..."
echo ""

# Step 1: Check environment variables
echo "📋 Step 1: Checking environment variables..."
ssh hetzner "cd /opt/voice-assistant && grep -E '(OPENROUTER|OPENAI)' .env" || echo "No environment variables found"

echo ""

# Step 2: Check service status
echo "⚙️ Step 2: Checking service status..."
ssh hetzner "cd /opt/voice-assistant && PM2_HOME=/opt/voice-assistant/.pm2 pm2 status"

echo ""

# Step 3: Test configuration
echo "🧪 Step 3: Testing configuration..."
ssh hetzner "cd /opt/voice-assistant && node validate-credentials.js"

echo ""

# Step 4: Test voice processing
echo "🎙️ Step 4: Testing voice processing..."
echo "Testing with: 'Hello, how are you?'"
curl -X POST https://floe.cognetica.de/api/voice/process-text \
  -H "Content-Type: application/json" \
  -H "x-api-key: voice-assistant-api-key-2024" \
  -d '{"text": "Hello, how are you?"}' \
  -s | jq '.response' 2>/dev/null || echo "Response received (not JSON)"

echo ""

# Step 5: Check recent logs
echo "📝 Step 5: Checking recent logs..."
ssh hetzner "cd /opt/voice-assistant && PM2_HOME=/opt/voice-assistant/.pm2 pm2 logs --lines 10" | grep -E "(OpenRouter|LLM|coordinator|GeneralAgent)" | tail -5

echo ""
echo "🎯 Status Check Complete!"
echo ""
echo "If you see:"
echo "❌ 'No valid LLM configuration found' - OpenRouter API key is missing/invalid"
echo "❌ 'OpenRouter API key authentication failed' - API key is invalid"
echo "✅ 'OpenRouter API key is valid and working' - Configuration is correct"
echo ""
echo "To fix issues, run: ./fix-openrouter-key.sh YOUR_OPENROUTER_API_KEY" 