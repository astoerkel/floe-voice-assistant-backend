#!/bin/bash

# Navigate to iOS repository
cd /Users/amitstorkel/Projects/VoiceAssistantIOS/VoiceAssistant

echo "=== Switching to main branch ==="
git checkout main

echo -e "\n=== Merging phase-4-restore-original-ui ==="
git merge phase-4-restore-original-ui

echo -e "\n=== Pushing to origin ==="
git push origin main

echo -e "\n=== Push complete! ==="