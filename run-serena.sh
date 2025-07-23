#!/bin/bash
# Wrapper script to run Serena MCP server
cd /Users/amitstorkel/Projects/VoiceAssistantIOS/VoiceAssistant/voice-assistant-backend/serena-temp/serena-main
source $HOME/.local/bin/env
uv run scripts/mcp_server.py --context ide-assistant --project /Users/amitstorkel/Projects/VoiceAssistantIOS/VoiceAssistant/voice-assistant-backend