# Voice Assistant Backend

A comprehensive Node.js/Express backend for a voice assistant application that replaces N8N workflows with proper LangChain agents. This backend handles Apple ecosystem apps (iPhone/Apple Watch) and web clients.

## Architecture

- **Framework**: Node.js with Express.js
- **AI/LLM**: LangChain with OpenAI GPT-4 and Anthropic Claude
- **Database**: PostgreSQL with Prisma ORM (Railway managed)
- **Authentication**: JWT + Apple Sign In + Google OAuth
- **Real-time**: Socket.IO for WebSocket connections
- **Voice Processing**: OpenAI Whisper API for speech-to-text, Google Text-to-Speech for responses
- **Task Queue**: Bull/BullMQ with Redis (Railway managed)
- **Caching**: Redis for session/token caching
- **File Storage**: Railway volumes for audio files
- **Deployment**: Railway for hosting and CI/CD

## Project Structure

```
voice-assistant-backend/
├── src/
│   ├── config/           # Configuration files
│   ├── controllers/      # Request handlers
│   ├── services/         # Business logic
│   │   ├── agents/       # LangChain agents
│   │   ├── integrations/ # Third-party integrations
│   │   ├── ai/          # AI/ML services
│   │   ├── auth/        # Authentication services
│   │   ├── queue/       # Background job processing
│   │   └── storage/     # File storage services
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── middleware/      # Express middleware
│   ├── utils/           # Utility functions
│   └── websocket/       # WebSocket handlers
├── tests/               # Test files
├── railway.json         # Railway deployment config
├── nixpacks.toml        # Nixpacks build config
└── Procfile            # Process definitions
```

## Quick Start

1. **Install dependencies**:
```bash
npm install
```

2. **Set up environment variables**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Database setup**:
```bash
npx prisma migrate dev
npx prisma generate
```

4. **Start development server**:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/apple-signin` - Apple Sign In
- `POST /api/auth/google-oauth/init` - Google OAuth initialization
- `POST /api/auth/google-oauth/callback` - Google OAuth callback
- `POST /api/auth/refresh` - Refresh JWT tokens
- `DELETE /api/auth/logout` - Logout
- `GET /api/auth/profile` - Get user profile

### Voice Processing
- `POST /api/voice/process` - Process voice commands
- `POST /api/voice/stream-start` - Start voice streaming
- `POST /api/voice/stream-chunk` - Stream audio chunks
- `POST /api/voice/stream-end` - End voice streaming
- `GET /api/voice/history` - Get voice command history

### Integrations
- `GET /api/integrations` - List user integrations
- `POST /api/integrations/google/connect` - Connect Google services
- `POST /api/integrations/airtable/connect` - Connect Airtable
- `DELETE /api/integrations/:id` - Remove integration
- `GET /api/integrations/:id/status` - Check integration status

### Calendar
- `GET /api/calendar/events` - Get calendar events
- `POST /api/calendar/events` - Create calendar event
- `PUT /api/calendar/events/:id` - Update calendar event
- `DELETE /api/calendar/events/:id` - Delete calendar event
- `GET /api/calendar/free-time` - Find free time slots

### Email
- `GET /api/email/messages` - Get email messages
- `GET /api/email/messages/:id` - Get specific email
- `POST /api/email/compose` - Compose new email
- `POST /api/email/reply/:id` - Reply to email
- `GET /api/email/search` - Search emails

### Tasks
- `GET /api/tasks` - Get tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `GET /api/tasks/overdue` - Get overdue tasks

## Development Status

### ✅ Completed
- [x] Basic Express server structure
- [x] Prisma database schema
- [x] Railway deployment configuration
- [x] Error handling and logging
- [x] API route structure
- [x] WebSocket setup

### 🚧 In Progress
- [ ] JWT authentication system
- [ ] LangChain agent implementation
- [ ] Voice processing pipeline

### 📋 Planned
- [ ] Google/Airtable integrations
- [ ] Background job processing
- [ ] Testing suite
- [ ] Production deployment

## Environment Variables

See `.env.example` for all required environment variables.

## Railway Deployment

1. **Install Railway CLI**:
```bash
npm install -g @railway/cli
```

2. **Initialize Railway project**:
```bash
railway login
railway init
```

3. **Add services**:
```bash
railway add postgresql
railway add redis
```

4. **Deploy**:
```bash
railway up
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC