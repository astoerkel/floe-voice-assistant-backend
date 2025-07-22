#!/bin/bash

# Deploy fix for database compatibility issue
# This script updates the voice controller to remove preferredName field reference

echo "🚀 Deploying database compatibility fix..."

# Backup current file
cp /opt/voice-assistant/src/controllers/voice.controller.js /opt/voice-assistant/src/controllers/voice.controller.js.backup

# Update the file to remove preferredName field
sed -i 's/preferred_name: true,/\/\/ preferred_name: true, \/\/ Temporarily disabled until migration/' /opt/voice-assistant/src/controllers/voice.controller.js
sed -i 's/user?.preferred_name ||/\/\/ user?.preferred_name || \/\/ Temporarily disabled/' /opt/voice-assistant/src/controllers/voice.controller.js

# Restart the API service
cd /opt/voice-assistant
pm2 restart voice-assistant-api

echo "✅ Fix deployed and service restarted"
pm2 status