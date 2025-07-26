#!/bin/bash

# Emergency fix for success field corruption
# This is a critical production fix

echo "🚨 EMERGENCY FIX: Backend response corruption..."

# First, let's find the exact issue
echo "📍 Locating the corruption source..."

ssh hetzner "cd /opt/voice-assistant && cat > /tmp/find_corruption.js << 'EOF'
const fs = require('fs');
const path = require('path');

// Read the voice controller
const controllerPath = path.join(process.cwd(), 'src/controllers/voice.controller.js');
const content = fs.readFileSync(controllerPath, 'utf8');

// Find all res.json calls in processText
const processTextMatch = content.match(/async processText[\s\S]*?^  \}/m);
if (processTextMatch) {
  const processTextContent = processTextMatch[0];
  const jsonCalls = processTextContent.match(/res\.json\([^)]+\)/g);
  
  console.log('Found', jsonCalls ? jsonCalls.length : 0, 'res.json calls in processText');
  
  // Check for any suspicious patterns
  const lines = processTextContent.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('res.json') && line.includes('success')) {
      console.log('Line', idx + 1, ':', line.trim());
    }
  });
}

// Look for any place where success might be assigned audioBase64
const suspiciousPatterns = [
  /success:\s*audioBase64/g,
  /success:\s*audioResponse/g,
  /success:\s*result\.audioBase64/g,
  /success:\s*ttsResult/g
];

suspiciousPatterns.forEach(pattern => {
  const matches = content.match(pattern);
  if (matches) {
    console.log('FOUND SUSPICIOUS PATTERN:', pattern, matches);
  }
});

console.log('\\nChecking for response object construction issues...');
// Check the actual response structure
const responsePattern = /res\.json\(\s*{\s*success:\s*([^,}]+)/g;
let match;
while ((match = responsePattern.exec(content)) !== null) {
  console.log('Success assignment:', match[1].trim());
}
EOF
node /tmp/find_corruption.js"

# Apply emergency patch
echo "🔧 Applying emergency patch..."

ssh hetzner "cd /opt/voice-assistant && cat > /tmp/emergency_patch.sh << 'EOF'
#!/bin/bash

# Create a patched version that intercepts and fixes responses
cat > /tmp/response_interceptor.js << 'INTERCEPTOR'
// Emergency response interceptor
const logger = require('./utils/logger');

function createResponseInterceptor(res) {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  
  res.json = function(data) {
    try {
      if (data && typeof data === 'object') {
        // CRITICAL FIX: Check if success contains base64 audio
        if (data.success && typeof data.success === 'string') {
          if (data.success.startsWith('//') || data.success.includes('AAA')) {
            logger.error('CRITICAL: Response corruption detected - success contains audio data');
            
            // Move audio data to correct location
            if (!data.audioBase64 && !data.audioResponse?.audioBase64) {
              data.audioBase64 = data.success;
            }
            data.success = true;
            
            logger.info('CRITICAL: Response fixed - success is now boolean');
          }
        }
        
        // Ensure success is always boolean
        if ('success' in data) {
          data.success = Boolean(data.success);
        }
      }
    } catch (err) {
      logger.error('Error in response interceptor:', err);
    }
    
    return originalJson.call(this, data);
  };
  
  res.send = function(data) {
    // Also intercept res.send in case it's used
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.success && typeof parsed.success === 'string') {
          res.json(parsed);
          return;
        }
      } catch (e) {
        // Not JSON, continue normally
      }
    }
    return originalSend.call(this, data);
  };
  
  return res;
}

module.exports = { createResponseInterceptor };
INTERCEPTOR

# Patch the controller to use the interceptor
cp src/controllers/voice.controller.js src/controllers/voice.controller.js.pre-emergency

# Add the interceptor import at the top
sed -i "1i const { createResponseInterceptor } = require('../../tmp/response_interceptor');" src/controllers/voice.controller.js

# Add interceptor to processText method
sed -i '/async processText(req, res) {/a\    res = createResponseInterceptor(res);' src/controllers/voice.controller.js

echo "Emergency patch applied"
EOF

chmod +x /tmp/emergency_patch.sh
/tmp/emergency_patch.sh"

# Restart service
echo "🔄 Restarting service..."
ssh hetzner "cd /opt/voice-assistant && pm2 restart voice-assistant-api"

# Wait for restart
sleep 3

# Test the fix
echo "🧪 Testing emergency fix..."
ssh hetzner "cd /opt/voice-assistant && curl -X POST http://localhost:8080/api/voice/process-text \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: voice-assistant-api-key-2024' \
  -H 'Authorization: Bearer mock_access_token_for_development' \
  -d '{\"text\": \"check my emails\", \"platform\": \"ios\", \"integrations\": {\"google\": true}}' \
  -s | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
    print(\"✅ Response parsed successfully\")
    print(f\"Success field: type={type(data.get(\"success\"))}, value={data.get(\"success\")}\")
    if \"audioBase64\" in data:
        print(f\"audioBase64: present, length={len(data[\"audioBase64\"])}\")
    elif \"audioResponse\" in data and data[\"audioResponse\"]:
        print(f\"audioResponse.audioBase64: present, length={len(data[\"audioResponse\"].get(\"audioBase64\", \"\"))}\")
    else:
        print(\"⚠️  No audio data found in response\")
except Exception as e:
    print(f\"❌ Failed to parse response: {e}\")
    print(\"Raw response:\", sys.stdin.read())
'"

echo "📊 Service status:"
ssh hetzner "pm2 status"