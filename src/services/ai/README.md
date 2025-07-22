# LangChain Voice Assistant Coordinator

This directory contains the LangChain-based AI coordinator system for the Voice Assistant backend. The coordinator uses OpenAI GPT-4o via OpenRouter to intelligently route requests to specialized agents and provide personalized, voice-optimized responses.

## Architecture Overview

```
VoiceAssistantCoordinator
├── System Prompt Generator    (Dynamic system prompts with personalization)
├── Personalization Manager   (User preferences and learning)
├── Context Manager           (Conversation context and session management)
└── Specialized Agents
    ├── CalendarAgent        (Google Calendar operations)
    ├── TaskAgent           (Airtable task management)
    ├── EmailAgent          (Gmail operations)
    └── GeneralAgent        (General queries and conversation)
```

## Key Features

### 🎯 Intent Classification
- Intelligent routing to appropriate specialized agents
- Confidence scoring for intent classification
- Fallback handling for ambiguous requests

### 🎨 Voice Optimization
- Responses optimized for text-to-speech synthesis
- Concise, conversational language (under 50 words typically)
- Natural speech patterns with proper pauses

### 🧠 Personalization
- User preference learning and adaptation
- Communication style customization (formality, verbosity, enthusiasm)
- Work schedule and timezone awareness
- Interaction pattern analysis

### 🔄 Context Management
- Conversation history tracking
- Session state management
- Integration status awareness
- Environmental context (time, date, etc.)

### 🔌 Service Integration
- Google Calendar (events, scheduling, free time)
- Gmail (reading, sending, managing emails)
- Airtable (task and project management)
- Extensible architecture for additional services

## File Structure

```
src/services/ai/
├── coordinator.js              # Main VoiceAssistantCoordinator class
├── utils/
│   ├── systemPromptGenerator.js   # Dynamic system prompt generation
│   ├── personalizationManager.js # User preferences and learning
│   └── contextManager.js          # Conversation context management
├── agents/
│   ├── calendarAgent.js          # Google Calendar operations
│   ├── taskAgent.js              # Airtable task management
│   ├── emailAgent.js             # Gmail operations
│   └── generalAgent.js           # General queries and conversation
└── README.md                    # This file
```

## Usage

### Basic Request Processing

```javascript
const VoiceAssistantCoordinator = require('./coordinator');

const coordinator = new VoiceAssistantCoordinator();

// Process a voice request
const result = await coordinator.processRequest(
  userId, 
  "Schedule a meeting with John tomorrow at 2 PM",
  { deviceType: 'ios', timeZone: 'America/New_York' }
);

console.log(result.response);  // Voice-optimized response text
console.log(result.audioData); // Base64 audio (if generated)
console.log(result.actions);   // Actions performed
```

### Integration Status Check

```javascript
// Check what integrations are available for a user
const integrationStatus = await coordinator.checkIntegrationStatus(userId);

console.log(integrationStatus);
// {
//   calendar: true,
//   email: false,
//   tasks: true,
//   hasAnyIntegration: true
// }
```

### Conversation History

```javascript
// Get recent conversation history
const history = await coordinator.getConversationHistory(userId, 5);
console.log(history); // Last 5 exchanges
```

## Environment Variables

The coordinator requires the following environment variables:

```bash
# AI Model Access (choose one)
OPENROUTER_API_KEY=your_openrouter_key    # Preferred for GPT-4o access
OPENAI_API_KEY=your_openai_key            # Fallback option

# Application URL (for OpenRouter)
APP_URL=https://yourapp.com

# Database
DATABASE_URL=postgresql://...

# Integration APIs (existing)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
AIRTABLE_API_KEY=your_airtable_key
```

## Database Models

The coordinator adds several new models to the Prisma schema:

### ConversationLog
Stores all user interactions for analytics and learning:
```prisma
model ConversationLog {
  id                String   @id @default(cuid())
  userId            String
  userInput         String
  assistantResponse String
  intent            String?
  confidence        Float?
  reasoning         String?
  entities          Json?
  actions           Json?
  metadata          Json?
  createdAt         DateTime @default(now())
}
```

### ConversationContext
Manages conversation state and context:
```prisma
model ConversationContext {
  id        String   @id @default(cuid())
  userId    String   @unique
  data      Json
  expiresAt DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### UserPreferences
Stores personalization preferences:
```prisma
model UserPreferences {
  id                      String   @id @default(cuid())
  userId                  String   @unique
  responseLength          String?  // brief, balanced, detailed
  communicationFormality  String?  // formal, balanced, casual
  responseVerbosity       String?  // brief, balanced, detailed
  enthusiasmLevel         String?  // low, balanced, high
  reminderStyle           String?  // formal, friendly, urgent
  defaultMeetingDuration  Int?
  workStartTime           String?
  workEndTime             String?
  timezone                String?
  // ... other fields
}
```

### UserLearningData
Captures interaction data for machine learning:
```prisma
model UserLearningData {
  id              String   @id @default(cuid())
  userId          String
  userInput       String
  assistantResponse String?
  userFeedback    String?  // positive, negative, neutral
  intent          String?
  confidence      Float?
  wasHelpful      Boolean?
  integrationUsed String?
  metadata        Json?
  createdAt       DateTime @default(now())
}
```

## Agent Specifications

### CalendarAgent
Handles Google Calendar operations:
- View events (today, week, specific dates)
- Create new events with intelligent parsing
- Update existing events
- Delete events
- Find free time slots
- Calendar summaries

**Example intents**: "Schedule a meeting", "What's on my calendar", "Find free time"

### TaskAgent  
Manages Airtable tasks and projects:
- Create tasks with priorities and due dates
- View tasks (all, by status, by priority)
- Update task details
- Mark tasks complete
- Search tasks
- Task statistics

**Example intents**: "Create a task", "Show my pending tasks", "Mark project complete"

### EmailAgent
Handles Gmail operations:
- Read emails (unread, important, recent)
- Send new emails
- Reply to existing emails
- Search emails
- Mark as read/unread
- Delete emails
- Email statistics

**Example intents**: "Check my email", "Send email to John", "Reply saying yes"

### GeneralAgent
Handles miscellaneous queries:
- Information requests
- Conversational interactions
- General assistance
- Time/date queries
- Basic calculations
- Help and capability questions

**Example intents**: "What time is it?", "Hello", "How can you help me?"

## Personalization Features

### Communication Style Adaptation
- **Formality**: Formal, balanced, casual
- **Verbosity**: Brief, balanced, detailed  
- **Enthusiasm**: Low, balanced, high

### Context Awareness
- Time of day preferences
- Work schedule integration
- Timezone handling
- Recent interaction patterns

### Learning System
- Tracks response helpfulness
- Analyzes user feedback
- Adapts communication style automatically
- Improves intent classification over time

## Voice Optimization Guidelines

### Response Format
1. **Acknowledgment**: "I understand you want to..."
2. **Action**: "Let me check your calendar..."
3. **Result**: "I found a free slot at 2 PM."
4. **Next Steps**: "Should I book it for you?"

### Language Guidelines
- Use natural, conversational language
- Avoid technical jargon
- Keep responses under 50 words when possible
- Use verbal transitions ("Let me check", "I found", "Here's what I can do")
- Structure lists with "first", "second", "next" instead of bullets

### Audio Considerations
- Responses optimized for text-to-speech
- Clear sentence structure with periods for pauses
- Avoid complex punctuation
- Numbers and dates spelled appropriately for speech

## Development Guidelines

### Adding New Agents
1. Create agent class in `agents/` directory
2. Implement `handleRequest(userId, userInput, context, systemPrompt)` method
3. Add agent to coordinator's agents object
4. Update intent classification in coordinator
5. Add agent-specific tests

### Extending Integrations
1. Create integration service in `../integrations/`
2. Add integration to relevant agent constructor
3. Update integration status checks
4. Add database models if needed
5. Update user preferences schema

### Testing Considerations
- Mock external API calls
- Test intent classification accuracy
- Verify voice optimization guidelines
- Test personalization features
- Validate error handling

## Performance Considerations

### Response Times
- Target: Under 2 seconds for simple queries
- Target: Under 5 seconds for complex operations
- Use caching for frequently accessed data
- Parallel processing for independent operations

### Rate Limiting
- Respect API rate limits for integrations
- Implement exponential backoff for retries
- Cache responses when appropriate
- Batch operations when possible

### Resource Usage
- Monitor token usage for LLM calls
- Implement conversation context pruning
- Clean up expired contexts regularly
- Optimize database queries

## Monitoring and Analytics

### Key Metrics
- Response time distribution
- Intent classification accuracy
- User satisfaction scores
- Integration usage patterns
- Error rates by agent

### Logging
- All interactions logged to ConversationLog
- Error details captured with context
- Performance metrics tracked
- User feedback recorded

### Health Checks
```javascript
// Check coordinator health
const health = await coordinator.healthCheck();
console.log(health.status); // 'healthy', 'degraded', 'unhealthy'
```

## Security Considerations

### Data Privacy
- User data encrypted in transit and at rest
- Conversation logs anonymized for analytics
- Integration tokens securely stored
- Regular token rotation

### Access Control
- User-specific data isolation
- Integration permission validation
- Rate limiting per user
- Audit logging for sensitive operations

### AI Safety
- Input validation and sanitization
- Response content filtering
- Prompt injection protection
- Fallback mechanisms for AI failures

## Troubleshooting

### Common Issues

**Intent Classification Errors**
- Check system prompt generation
- Verify user context completeness
- Review conversation history
- Update classification examples

**Integration Failures**
- Verify API keys and permissions
- Check token expiration
- Test integration connectivity
- Review error logs

**Performance Issues**
- Monitor LLM response times
- Check database query performance
- Review context size and complexity
- Optimize agent logic

**Personalization Not Working**
- Verify user preferences are saved
- Check learning data collection
- Review adaptation algorithms
- Test with sufficient interaction history

For additional support, check the logs in the coordinator and specific agents, and review the conversation context and user preferences data.