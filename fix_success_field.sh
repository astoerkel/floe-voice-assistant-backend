#!/bin/bash

# Fix script for success field containing audio data
# This fixes the critical issue where success field contains base64 audio instead of boolean

echo "🔧 Fixing critical backend response corruption..."

# Create backup
ssh hetzner "cd /opt/voice-assistant && cp src/controllers/voice.controller.js src/controllers/voice.controller.js.backup-$(date +%Y%m%d-%H%M%S)"

# Apply the fix directly using sed
ssh hetzner "cd /opt/voice-assistant && cat > /tmp/fix_success.sh << 'EOF'
#!/bin/bash

# Fix the response structure to ensure success is always boolean
cd /opt/voice-assistant

# Create a temporary file with the fix
cat > /tmp/response_wrapper.js << 'WRAPPER'
// Response wrapper to fix success field corruption
const originalJson = res.json.bind(res);
res.json = function(data) {
  if (data && typeof data === 'object') {
    // Check if success field contains base64 audio data
    if (data.success && typeof data.success === 'string' && data.success.startsWith('//')) {
      console.log('CRITICAL: Fixing corrupted response - moving audio from success to audioBase64');
      data.audioBase64 = data.success;
      data.success = true;
    }
    // Ensure success is always boolean
    if ('success' in data && typeof data.success !== 'boolean') {
      data.success = !!data.success;
    }
  }
  return originalJson(data);
};
WRAPPER

# Insert the wrapper at the beginning of processText method
sed -i '/async processText(req, res) {/a\
    // Fix for success field corruption\
    const originalJson = res.json.bind(res);\
    res.json = function(data) {\
      if (data && typeof data === '\''object'\'') {\
        if (data.success && typeof data.success === '\''string'\'' && data.success.startsWith('\''///'\'')) {\
          console.log('\''CRITICAL: Fixing corrupted response - moving audio from success to audioBase64'\'');\
          data.audioBase64 = data.success;\
          data.success = true;\
        }\
        if ('\''success'\'' in data && typeof data.success !== '\''boolean'\'') {\
          data.success = !!data.success;\
        }\
      }\
      return originalJson(data);\
    };' src/controllers/voice.controller.js

echo "Fix applied to voice.controller.js"
EOF"

# Make the fix script executable and run it
ssh hetzner "chmod +x /tmp/fix_success.sh && /tmp/fix_success.sh"

# Restart the service
ssh hetzner "cd /opt/voice-assistant && pm2 restart voice-assistant-api"

echo "✅ Critical fix deployed - testing the response..."

# Wait for service to restart
sleep 3

# Test the fix
echo "🧪 Testing the fix..."
ssh hetzner "cd /opt/voice-assistant && curl -X POST http://localhost:8080/api/voice/process-text \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: voice-assistant-api-key-2024' \
  -H 'Authorization: Bearer mock_access_token_for_development' \
  -d '{\"text\": \"check my emails\", \"platform\": \"ios\", \"integrations\": {\"google\": true}}' \
  -s | python3 -c 'import sys, json; data = json.load(sys.stdin); print(\"Success field type:\", type(data.get(\"success\")), \"Value:\", data.get(\"success\")); print(\"Has audioBase64:\", \"audioBase64\" in data or (\"audioResponse\" in data and data[\"audioResponse\"] and \"audioBase64\" in data[\"audioResponse\"]))'
"

echo "📊 PM2 Status:"
ssh hetzner "pm2 status"