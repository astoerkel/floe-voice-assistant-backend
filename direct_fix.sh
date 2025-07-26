#!/bin/bash

# Direct fix for the response corruption issue
echo "🚨 Applying direct fix for success field corruption..."

# Create the fix
ssh hetzner 'cat > /tmp/fix_voice_controller.js << '\''EOF'\''
const fs = require('\''fs'\'');
const path = require('\''path'\'');

const filePath = path.join(process.cwd(), '\''src/controllers/voice.controller.js'\'');
let content = fs.readFileSync(filePath, '\''utf8'\'');

// Backup the file
const backupPath = filePath + '\''.backup-'\'' + Date.now();
fs.writeFileSync(backupPath, content);
console.log('\''Backup created: '\'' + backupPath);

// Find where res.json is being called with success field
// The issue is likely that success is being assigned audioBase64 or some other value

// First, let'\''s check if there'\''s a place where success might be getting the wrong value
const lines = content.split('\''\n'\'');
let fixedLines = [];
let inProcessText = false;
let modified = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Track if we'\''re in processText function
    if (line.includes('\''async processText'\'')) {
        inProcessText = true;
    }
    
    // Look for res.json calls with success field
    if (inProcessText && line.includes('\''res.json({'\'' ) && lines[i+1] && lines[i+1].includes('\''success:'\'')) {
        console.log('\''Found res.json with success at line '\'' + (i+1));
        
        // Check what'\''s being assigned to success
        const successLine = lines[i+1];
        const successMatch = successLine.match(/success:\s*([^,]+),/);
        
        if (successMatch) {
            const successValue = successMatch[1].trim();
            console.log('\''Success is being set to: '\'' + successValue);
            
            // If it'\''s not explicitly a boolean, wrap it
            if (!successValue.match(/^(true|false|Boolean\(|!!)/) && successValue !== '\''overallSuccess'\'') {
                console.log('\''Fixing non-boolean success assignment'\'');
                lines[i+1] = successLine.replace(/success:\s*([^,]+),/, '\''success: Boolean($1),'\'');
                modified = true;
            }
        }
    }
    
    fixedLines.push(lines[i]);
}

// Also add a safety check at the beginning of processText
if (!modified) {
    console.log('\''Adding response interceptor as safety measure'\'');
    
    // Find processText function and add interceptor
    for (let i = 0; i < fixedLines.length; i++) {
        if (fixedLines[i].includes('\''async processText(req, res) {'\'')) {
            // Insert interceptor after function declaration
            fixedLines.splice(i + 1, 0, 
                '\''    // Response interceptor to fix success field corruption'\'',
                '\''    const originalJson = res.json.bind(res);'\'',
                '\''    res.json = function(data) {'\'',
                '\''      if (data && typeof data === "object" && "success" in data) {'\'',
                '\''        if (typeof data.success === "string" && data.success.startsWith("//")) {'\'',
                '\''          console.error("CRITICAL: Fixing success field corruption - moving audio to audioBase64");'\'',
                '\''          if (!data.audioBase64) data.audioBase64 = data.success;'\'',
                '\''          data.success = true;'\'',
                '\''        } else if (typeof data.success !== "boolean") {'\'',
                '\''          data.success = Boolean(data.success);'\'',
                '\''        }'\'',
                '\''      }'\'',
                '\''      return originalJson.call(this, data);'\'',
                '\''    };'\''
            );
            modified = true;
            break;
        }
    }
}

if (modified) {
    fs.writeFileSync(filePath, fixedLines.join('\''\n'\''));
    console.log('\''Fix applied successfully'\'');
} else {
    console.log('\''No modifications needed or pattern not found'\'');
}
EOF
cd /opt/voice-assistant && node /tmp/fix_voice_controller.js'

# Restart the service
echo "🔄 Restarting service..."
ssh hetzner "cd /opt/voice-assistant && pm2 restart voice-assistant-api"

# Wait for service to restart
sleep 3

# Test the fix
echo "🧪 Testing the fix..."
ssh hetzner "cd /opt/voice-assistant && curl -X POST http://localhost:8080/api/voice/process-text \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: voice-assistant-api-key-2024' \
  -H 'Authorization: Bearer mock_access_token_for_development' \
  -d '{\"text\": \"what time is it\", \"platform\": \"ios\"}' \
  -s | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
    print(\"✅ Response parsed successfully!\")
    print(f\"Success field: type={type(data.get(\"success\"))}, value={data.get(\"success\")}\")
    if \"audioBase64\" in data:
        print(f\"audioBase64: present at root level, starts with: {data[\"audioBase64\"][:20]}...\")
    elif \"audioResponse\" in data and data[\"audioResponse\"] and \"audioBase64\" in data[\"audioResponse\"]:
        print(f\"audioResponse.audioBase64: present, starts with: {data[\"audioResponse\"][\"audioBase64\"][:20]}...\")
except Exception as e:
    print(f\"❌ Failed to parse: {e}\")
    print(\"Raw response (first 200 chars):\")
    raw = sys.stdin.read()
    print(raw[:200])
'"

echo "
📊 Deployment complete!"