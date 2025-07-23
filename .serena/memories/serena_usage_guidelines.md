# Serena MCP Usage Guidelines

## Scope of Usage
Serena MCP is configured and should be used **exclusively for backend development** in this project.

### Backend (Node.js) - USE SERENA ✓
- **Project**: voice-assistant-backend
- **Language**: JavaScript/Node.js
- **Use Serena for**:
  - Semantic code navigation with `find_symbol` and `get_symbols_overview`
  - Intelligent code editing with `replace_symbol_body` and `replace_regex`
  - Pattern searching with `search_for_pattern`
  - Memory management for backend knowledge
  - Avoiding reading entire files unnecessarily

### Frontend (iOS/Swift) - DO NOT USE SERENA ✗
- **Project**: VoiceAssistant iOS/watchOS apps
- **Language**: Swift/SwiftUI
- **Use instead**:
  - Xcode for semantic navigation and refactoring
  - XcodeBuild MCP tools for building, testing, and UI automation
  - Regular Read/Write/Edit tools for Swift file modifications
  - Native iOS development tools and workflows

## Rationale
- Serena is optimized for languages with robust LSP support
- The backend project (Node.js) has better compatibility
- iOS/Swift development has specialized tools (Xcode, XcodeBuild MCP) that are more appropriate
- Keeping Serena focused on backend prevents configuration conflicts

## Best Practices
1. Always check active project with `get_current_config`
2. Use Serena's semantic tools for backend code exploration
3. Maintain backend memories separate from frontend documentation
4. Use appropriate tools for each part of the stack