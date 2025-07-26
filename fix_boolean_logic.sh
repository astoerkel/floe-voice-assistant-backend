#!/bin/bash

# Fix the boolean logic issue
echo "🔧 Fixing boolean logic for overallSuccess..."

ssh hetzner 'cat > /tmp/fix_boolean.js << '\''EOF'\''
const fs = require('\''fs'\'');
const path = require('\''path'\'');

const filePath = path.join(process.cwd(), '\''src/controllers/voice.controller.js'\'');
let content = fs.readFileSync(filePath, '\''utf8'\'');

// Backup
fs.writeFileSync(filePath + '\''.backup-boolean-'\'' + Date.now(), content);

// Fix the hasValidAudio assignment to be boolean
// Replace audioResponse?.audioBase64 with !!audioResponse?.audioBase64
content = content.replace(
    /const hasValidAudio = audioResponse\?\.audioBase64;/g,
    '\''const hasValidAudio = !!audioResponse?.audioBase64;'\''
);

// Also fix the overallSuccess to ensure it'\''s boolean
content = content.replace(
    /const overallSuccess = hasValidAudio \|\| hasValidResponse;/g,
    '\''const overallSuccess = !!(hasValidAudio || hasValidResponse);'\''
);

// Fix the other variant too
content = content.replace(
    /const overallSuccess = hasValidAudio \|\| \(hasValidResponse && result\.success !== false\);/g,
    '\''const overallSuccess = !!(hasValidAudio || (hasValidResponse && result.success !== false));'\''
);

fs.writeFileSync(filePath, content);
console.log('\''Boolean logic fix applied'\'');

// Count how many replacements were made
const hasValidAudioMatches = (content.match(/!!audioResponse\?\.audioBase64/g) || []).length;
const overallSuccessMatches = (content.match(/!!\(hasValidAudio/g) || []).length;

console.log(`Fixed ${hasValidAudioMatches} hasValidAudio assignments`);
console.log(`Fixed ${overallSuccessMatches} overallSuccess assignments`);
EOF
cd /opt/voice-assistant && node /tmp/fix_boolean.js'

# Restart
echo "🔄 Restarting service..."
ssh hetzner "cd /opt/voice-assistant && pm2 restart voice-assistant-api"

sleep 3

# Test
echo "🧪 Testing fix..."
ssh hetzner "cd /opt/voice-assistant && curl -X POST http://localhost:8080/api/voice/process-text \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: voice-assistant-api-key-2024' \
  -H 'Authorization: Bearer mock_access_token_for_development' \
  -d '{\"text\": \"hello world\", \"platform\": \"ios\"}' \
  -s | python3 -c '
import sys, json
data = json.loads(sys.stdin.read())
print(\"✅ Success type:\", type(data.get(\"success\")), \"Value:\", data.get(\"success\"))
if \"audioResponse\" in data and data[\"audioResponse\"]:
    print(\"✅ audioResponse.audioBase64 present, length:\", len(data[\"audioResponse\"].get(\"audioBase64\", \"\")))
'"

echo "✅ Fix complete!"