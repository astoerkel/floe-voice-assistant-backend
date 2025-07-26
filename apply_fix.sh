#!/bin/bash

# Apply fix for response corruption
echo "🔧 Applying response corruption fix..."

# First, let's examine the actual response to understand the issue better
echo "📊 Current response format:"
ssh hetzner "cd /opt/voice-assistant && curl -X POST http://localhost:8080/api/voice/process-text \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: voice-assistant-api-key-2024' \
  -H 'Authorization: Bearer mock_access_token_for_development' \
  -d '{\"text\": \"what time is it\", \"platform\": \"ios\"}' \
  -s > /tmp/response.json && cat /tmp/response.json | python3 -m json.tool 2>&1 | head -20"

# Check if it's a JSON parsing issue
echo -e "\n🔍 Checking raw response structure:"
ssh hetzner "cat /tmp/response.json | head -c 100"

# Now let's check where this might be coming from
echo -e "\n\n📍 Checking for the issue in voice controller..."

# Look for where the response might be getting corrupted
ssh hetzner "cd /opt/voice-assistant && grep -A 30 'res\\.json({' src/controllers/voice.controller.js | grep -B 30 'success: overallSuccess' | tail -40"

# Apply a simpler fix - check if there's an issue with variable assignment
echo -e "\n\n🔧 Applying targeted fix..."

ssh hetzner 'cd /opt/voice-assistant && cat > /tmp/fix_response.js << '\''EOF'\''
const fs = require('\''fs'\'');
const path = require('\''path'\'');

const filePath = path.join(process.cwd(), '\''src/controllers/voice.controller.js'\'');
let content = fs.readFileSync(filePath, '\''utf8'\'');

// Backup
fs.writeFileSync(filePath + '\''.backup-'\'' + Date.now(), content);

// Look for the problematic response and add debugging
content = content.replace(
  /res\.json\({(\s*)success: overallSuccess,/g,
  `res.json({$1success: Boolean(overallSuccess), // FIXED: Ensure boolean$1_debug_overallSuccess: overallSuccess,`
);

// Also add logging before res.json calls
content = content.replace(
  /(res\.json\({[^}]*success:[^}]*})/g,
  function(match) {
    return `console.log('\''DEBUG: About to send response with success='\'', typeof overallSuccess, overallSuccess);
    ${match}`;
  }
);

fs.writeFileSync(filePath, content);
console.log('\''Fix applied to voice.controller.js'\'');
EOF
node /tmp/fix_response.js'

# Restart the service
echo -e "\n🔄 Restarting service..."
ssh hetzner "cd /opt/voice-assistant && pm2 restart voice-assistant-api"

# Wait for restart
sleep 3

# Test again
echo -e "\n🧪 Testing fix..."
ssh hetzner "cd /opt/voice-assistant && curl -X POST http://localhost:8080/api/voice/process-text \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: voice-assistant-api-key-2024' \
  -H 'Authorization: Bearer mock_access_token_for_development' \
  -d '{\"text\": \"check my emails\", \"platform\": \"ios\", \"integrations\": {\"google\": true}}' \
  -s | python3 -m json.tool 2>&1 | head -20"

echo -e "\n✅ Fix deployment complete"