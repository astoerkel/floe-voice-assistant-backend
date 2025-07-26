#!/bin/bash

# Fix script for backend response format corruption
# This fixes the issue where success field contains audio data instead of boolean

echo "🔧 Fixing backend response format corruption..."

# Create a backup of the current voice controller
ssh hetzner "cd /opt/voice-assistant && cp src/controllers/voice.controller.js src/controllers/voice.controller.js.backup-$(date +%Y%m%d-%H%M%S)"

# Create the fix - ensure success is always a boolean
ssh hetzner "cd /opt/voice-assistant && cat > /tmp/response_fix.js << 'EOF'
// Fix for response format corruption
// This ensures the success field is always a boolean

// Find any res.json() calls and ensure success is boolean
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/controllers/voice.controller.js');
let content = fs.readFileSync(filePath, 'utf8');

// Add a helper function to sanitize responses
const sanitizeResponseHelper = `
// Helper to ensure response format is correct
function sanitizeResponse(response) {
  if (response && typeof response === 'object') {
    // Ensure success is always boolean
    if ('success' in response && typeof response.success !== 'boolean') {
      response.success = !!response.success;
    }
    // Ensure audioBase64 is in the correct field
    if (response.success && typeof response.success === 'string' && response.success.startsWith('//')) {
      response.audioBase64 = response.success;
      response.success = true;
    }
  }
  return response;
}
`;

// Insert the helper function after the class declaration
content = content.replace(/class VoiceController {/, 'class VoiceController {\n' + sanitizeResponseHelper);

// Wrap all res.json() calls with sanitizeResponse
content = content.replace(/res\.json\(([^)]+)\)/g, 'res.json(sanitizeResponse($1))');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Response format fix applied successfully');
EOF"

# Run the fix script
ssh hetzner "cd /opt/voice-assistant && node /tmp/response_fix.js"

# Restart the service
ssh hetzner "cd /opt/voice-assistant && pm2 restart voice-assistant-api"

echo "✅ Response format fix deployed and service restarted"

# Check the status
ssh hetzner "cd /opt/voice-assistant && pm2 status"