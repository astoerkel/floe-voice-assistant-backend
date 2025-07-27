#!/bin/bash

# Navigate to iOS repository
cd /Users/amitstorkel/Projects/VoiceAssistantIOS/VoiceAssistant

echo "=== iOS Repository Status ==="
git status

echo -e "\n=== Adding changes ==="
# Add specific changed files
git add VoiceAssistant/SimpleAPIClient.swift
git add VoiceAssistant/SimpleSettingsView.swift
git add VoiceAssistant/SimpleContentView.swift
git add docs/implementation-plan.md
git add docs/project-structure.md
git add docs/bug-tracking.md

echo -e "\n=== Creating commit ==="
git commit -m "MVP Working Version: Simplified Voice Assistant

Major changes:
- Fixed Apple Sign In authentication with proper JWT token decoding
- Enhanced settings page to show user email and extract display name
- Added navigation to settings from main view
- Fixed backend authentication crash issues
- Resolved network timeout errors
- Updated documentation to reflect simplified MVP architecture

Features working:
- Apple Sign In authentication
- Voice recording and transcription
- Backend LLM processing
- Audio response playback
- User profile display
- Clear chat history
- Conversation management

This is a stable, working MVP version focused on core voice assistant functionality.

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

echo -e "\n=== Current branch and remote ==="
git branch
git remote -v

echo -e "\nCommit created successfully!"
echo "To push: git push origin main"