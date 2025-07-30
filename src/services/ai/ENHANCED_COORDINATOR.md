# Enhanced LangChain Coordinator

The Enhanced LangChain Coordinator is an advanced implementation of the voice assistant's AI coordination system that uses LangChain's agent framework with real integration tools.

## Features

### 1. **LangChain Agent Architecture**
- Uses OpenAI Functions Agent for intelligent tool selection
- Conversation memory with summarization for context retention
- Multi-step task execution with up to 5 iterations
- Automatic fallback handling between LLM providers

### 2. **Real Integration Tools**

#### Calendar Tool
- **Operations**: view, create, update, delete, find_free_time, get_summary
- **Integration**: Google Calendar API
- **Features**:
  - Natural language date/time parsing
  - Free time slot detection
  - Event search and filtering
  - Attendee management

#### Email Tool
- **Operations**: read, compose, send, search, get_unread_count
- **Integration**: Gmail API
- **Features**:
  - Email search with Gmail query syntax
  - Thread-aware responses
  - Unread count tracking
  - Rich email composition

#### Task Tool
- **Operations**: create, view, update, complete, delete
- **Integration**: Airtable API
- **Features**:
  - Priority management
  - Due date tracking
  - Task search and filtering
  - Status updates

#### Weather Tool
- **Operations**: Current weather and forecasts
- **Features**: Location-based queries (currently mock implementation)

#### General Assistant Tool
- **Operations**: Handle general queries and information requests
- **Features**: Fallback for non-specific requests

### 3. **LLM Configuration**
- **Primary**: OpenRouter with GPT-4o model
- **Fallback**: Direct OpenAI API with GPT-4o
- **Automatic failover**: Seamlessly switches between providers

### 4. **User Personalization**
- Per-user conversation memory
- User profile integration
- Context-aware responses
- Conversation history tracking

## Configuration

### Environment Variables

```bash
# Enable enhanced coordinator
USE_ENHANCED_LANGCHAIN=true

# LLM Configuration (at least one required)
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENAI_API_KEY=sk-proj-xxxxx

# OpenRouter Configuration (optional)
OPENROUTER_SITE_URL=https://floe.cognetica.de
OPENROUTER_SITE_NAME=VoiceAssistant

# Integration Keys
GOOGLE_CLIENT_ID=xxxxx
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/oauth/google/callback

AIRTABLE_API_KEY=xxxxx
```

## Usage

### 1. **Enable in Voice Controller**

The enhanced coordinator is automatically used when `USE_ENHANCED_LANGCHAIN=true` is set in the environment.

### 2. **Direct API Testing**

```bash
# Test a request
curl -X POST https://api.yourdomain.com/api/test-coordinator \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "What meetings do I have today?"
  }'

# Get coordinator stats
curl -X GET https://api.yourdomain.com/api/test-coordinator/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-API-Key: YOUR_API_KEY"

# Clear user memory
curl -X POST https://api.yourdomain.com/api/test-coordinator/clear-memory \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-API-Key: YOUR_API_KEY"

# Get conversation history
curl -X GET https://api.yourdomain.com/api/test-coordinator/history?limit=10 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-API-Key: YOUR_API_KEY"
```

### 3. **Test Script**

Run the included test script:

```bash
cd /path/to/voice-assistant-backend
node src/services/ai/testEnhancedCoordinator.js
```

## Example Interactions

### Calendar Management
```
User: "Schedule a meeting with the team tomorrow at 3pm for 1 hour"
Assistant: [Creates calendar event] "I've scheduled your team meeting for tomorrow at 3:00 PM for 1 hour."

User: "What's on my calendar today?"
Assistant: [Retrieves events] "You have 3 events today: Staff meeting at 10 AM, Lunch with Sarah at 12:30 PM, and Project review at 4 PM."

User: "Find me a free slot tomorrow afternoon for 30 minutes"
Assistant: [Analyzes calendar] "You have several free slots tomorrow afternoon: 2:00-2:30 PM, 3:30-4:00 PM, and 4:30-5:00 PM."
```

### Email Management
```
User: "Check my unread emails"
Assistant: [Checks Gmail] "You have 5 unread emails. The most recent is from John about the project proposal."

User: "Send an email to alice@example.com saying I'll be late to the meeting"
Assistant: [Composes and sends] "I've sent the email to Alice letting her know you'll be late to the meeting."
```

### Task Management
```
User: "Create a task to review the quarterly report by end of week"
Assistant: [Creates task] "I've created a task 'Review quarterly report' with a due date of Friday."

User: "Show me my high priority tasks"
Assistant: [Retrieves tasks] "You have 3 high priority tasks: Complete budget analysis, Call client about contract, and Submit performance reviews."
```

### Multi-Tool Requests
```
User: "Find a free time slot tomorrow afternoon and check if I have any urgent emails"
Assistant: [Uses multiple tools] "You're free tomorrow from 2-3 PM and 4-5 PM. You have 2 urgent emails: one from your manager about the budget review and another from IT about system maintenance."
```

## Architecture

```
┌─────────────────────┐
│   Voice Request     │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Enhanced Coordinator│
├─────────────────────┤
│ - Intent Analysis   │
│ - Tool Selection    │
│ - Memory Management │
└──────────┬──────────┘
           │
     ┌─────┴─────┬──────────┬──────────┬──────────┐
     │           │          │          │          │
┌────▼────┐ ┌───▼───┐ ┌────▼────┐ ┌───▼───┐ ┌───▼───┐
│Calendar │ │ Email │ │  Tasks  │ │Weather│ │General│
│  Tool   │ │ Tool  │ │  Tool   │ │ Tool  │ │ Tool  │
└────┬────┘ └───┬───┘ └────┬────┘ └───┬───┘ └───┬───┘
     │          │          │          │          │
┌────▼──────────▼──────────▼──────────▼──────────▼────┐
│             Integration Services                      │
├───────────────────────────────────────────────────────┤
│ Google Calendar │ Gmail │ Airtable │ Weather API │   │
└───────────────────────────────────────────────────────┘
```

## Monitoring and Debugging

### Logs
- All coordinator actions are logged with the prefix `[EnhancedLangChainCoordinator]`
- Tool usage is tracked and logged
- Failed operations include detailed error information

### Database Tracking
- All interactions are stored in the `conversationLog` table
- Includes: user input, response, intent, tools used, execution time

### Performance Metrics
- Average execution time: 2-5 seconds
- Tool success rates tracked per operation
- Memory usage monitored per user

## Limitations and Future Improvements

### Current Limitations
1. Weather tool is currently a mock implementation
2. No direct file system access for security
3. Limited to configured integrations

### Planned Improvements
1. Real weather API integration
2. Additional tools (Slack, Notion, etc.)
3. Streaming response support
4. Custom tool creation interface
5. Advanced memory management with vector storage

## Troubleshooting

### Common Issues

1. **"No valid LLM configuration found"**
   - Ensure either `OPENROUTER_API_KEY` or `OPENAI_API_KEY` is set
   - Verify API keys are valid and have correct format

2. **"Integration not active"**
   - User needs to complete OAuth flow for the service
   - Check integration status in database

3. **"Tool execution failed"**
   - Check service-specific logs
   - Verify API credentials and permissions
   - Check rate limits

4. **Memory issues**
   - Clear user memory if responses become inconsistent
   - Monitor memory usage for long conversations

## Security Considerations

1. **API Keys**: All integration API keys are encrypted in the database
2. **User Isolation**: Each user's data and memory is completely isolated
3. **Input Validation**: All tool inputs are validated before execution
4. **Rate Limiting**: Prevents abuse and excessive API usage
5. **OAuth Security**: Tokens are refreshed automatically and securely stored