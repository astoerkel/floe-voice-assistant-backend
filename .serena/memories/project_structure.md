# Project Directory Structure

```
voice-assistant-backend/
├── src/                      # Source code directory
│   ├── app.js               # Main application entry point
│   ├── config/              # Configuration files
│   ├── controllers/         # Request handlers
│   │   ├── auth.controller.js
│   │   ├── integrations.controller.js
│   │   ├── oauth.controller.js
│   │   └── voice.controller.js
│   ├── middleware/          # Express middleware
│   ├── models/              # Database models
│   │   └── prisma/         # Prisma schema and migrations
│   │       └── schema.prisma
│   ├── routes/              # API route definitions
│   ├── services/            # Business logic layer
│   │   ├── agents/         # LangChain AI agents
│   │   ├── ai/             # AI/ML services
│   │   ├── auth/           # Authentication services
│   │   ├── integrations/   # External service integrations
│   │   ├── queue/          # Background job processing
│   │   └── storage/        # File storage services
│   ├── tests/              # Test files
│   ├── utils/              # Utility functions
│   └── websocket/          # WebSocket handlers
├── .env.example            # Environment variables template
├── .gitignore             # Git ignore rules
├── Dockerfile             # Docker container config
├── Dockerfile.production  # Production Docker config
├── README.md              # Project documentation
├── cloudbuild.yaml        # Google Cloud Build config
├── ecosystem.config.js    # PM2 configuration
├── package.json           # Node.js dependencies
├── package-lock.json      # Locked dependency versions
└── start.js               # Production start script
```

## Key Directories
- **controllers/**: HTTP request handling logic
- **services/**: Core business logic, separated by domain
- **routes/**: Express route definitions mapping URLs to controllers
- **models/prisma/**: Database schema and Prisma ORM configuration
- **middleware/**: Reusable Express middleware (auth, validation, etc.)
- **services/agents/**: LangChain agents for AI capabilities
- **services/queue/**: Bull queue processors for background jobs

## Naming Conventions
- Controllers: `[domain].controller.js`
- Routes: `[domain].routes.js`
- Services: Organized by feature in subdirectories
- Tests: Mirror source structure with `.test.js` suffix