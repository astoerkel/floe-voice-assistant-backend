# Enhanced Coordinator Production Deployment Guide

## Overview

The Enhanced Coordinator has been updated to work with both Prisma (development) and raw PostgreSQL pool (production) configurations. This guide explains how to deploy it to the production server.

## Key Changes

1. **Database Adapter**: Created a database adapter (`databaseAdapter.js`) that abstracts database operations and works with both Prisma and raw PostgreSQL pools.

2. **Production Coordinator**: Created `enhancedCoordinatorProduction.js` that uses the database adapter instead of direct Prisma imports.

3. **Coordinator Factory**: Created `coordinatorFactory.js` that automatically detects and uses the appropriate database configuration.

4. **Production-Ready Utilities**: Updated utility modules to work without Prisma dependencies.

## Files to Deploy

- `src/services/ai/enhancedCoordinatorProduction.js` - Main coordinator
- `src/services/ai/coordinatorFactory.js` - Factory for creating coordinator
- `src/services/ai/utils/databaseAdapter.js` - Database abstraction layer
- `src/services/ai/utils/personalizationManagerProduction.js` - Production personalization manager
- `src/config/databasePool.js` - PostgreSQL pool configuration

## Deployment Steps

### 1. Quick Deployment (Using Script)

```bash
cd voice-assistant-backend
./scripts/deploy-enhanced-coordinator.sh
```

### 2. Manual Deployment

1. **SSH to the server**:
   ```bash
   ssh root@floe.cognetica.de
   ```

2. **Navigate to backend directory**:
   ```bash
   cd /opt/simple-voice-backend
   ```

3. **Copy the new files**:
   ```bash
   # Create backup
   cp -r src/services/ai backup/ai-$(date +%Y%m%d-%H%M%S)
   
   # Copy new files (from your local machine)
   scp -r src/services/ai/* root@floe.cognetica.de:/opt/simple-voice-backend/src/services/ai/
   ```

4. **Update the controller** to use the production coordinator:
   ```bash
   # Edit src/controllers/voice.controller.js
   # Change: require('../services/ai/enhancedCoordinator')
   # To: require('../services/ai/enhancedCoordinatorProduction')
   ```

5. **Install dependencies** (if needed):
   ```bash
   npm install @langchain/openai langchain zod
   ```

6. **Set environment variable**:
   ```bash
   # Add to .env file
   echo "USE_ENHANCED_LANGCHAIN=true" >> .env
   ```

7. **Restart the service**:
   ```bash
   pm2 reload voice-assistant --update-env
   ```

## Configuration

### Environment Variables

- `USE_ENHANCED_LANGCHAIN=true` - Enable the enhanced coordinator
- `OPENROUTER_API_KEY` - OpenRouter API key (must start with `sk-or-`)
- `DATABASE_URL` - PostgreSQL connection string

### Database Configuration

The coordinator will automatically detect the database configuration:
1. First, it tries to load Prisma (development)
2. If Prisma is not available, it looks for `/opt/simple-voice-backend/src/config/database.js`
3. If that's not available, it tries to use `databasePool.js`
4. If no database is available, it runs without database functionality

## Testing

After deployment, test the enhanced coordinator:

```bash
# Check logs
pm2 logs voice-assistant

# Test a voice command
curl -X POST https://floe.cognetica.de/api/voice/process-text \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "What is the weather today?"}'
```

## Monitoring

Monitor the coordinator:

```bash
# View real-time logs
pm2 logs voice-assistant --lines 100

# Check coordinator stats
curl https://floe.cognetica.de/api/voice/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Rollback

If issues occur, rollback to the previous version:

```bash
# On the server
cd /opt/simple-voice-backend
cp -r backup/ai-[TIMESTAMP]/* src/services/ai/
pm2 reload voice-assistant
```

## Troubleshooting

### Common Issues

1. **"Module not found" errors**:
   - Install missing dependencies: `npm install [package-name]`

2. **Database connection errors**:
   - Check DATABASE_URL environment variable
   - Verify PostgreSQL is running
   - Check database credentials

3. **OpenRouter API errors**:
   - Verify OPENROUTER_API_KEY is set correctly
   - Check API key starts with `sk-or-`

### Debug Mode

Enable debug logging:

```bash
# Set in environment
NODE_ENV=development pm2 reload voice-assistant
```

## Production Database Schema

If you need to set up the database tables manually:

```sql
-- ConversationLog table
CREATE TABLE IF NOT EXISTS "ConversationLog" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "userInput" TEXT NOT NULL,
    "assistantResponse" TEXT NOT NULL,
    "intent" TEXT DEFAULT 'general',
    "confidence" DOUBLE PRECISION DEFAULT 1.0,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- User table (if not exists)
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT,
    "name" TEXT,
    "timezone" TEXT DEFAULT 'UTC',
    "preferences" JSONB DEFAULT '{}',
    "monthlyUsageCount" INTEGER DEFAULT 0,
    "totalCommandsUsed" INTEGER DEFAULT 0,
    "subscriptionTier" TEXT DEFAULT 'free',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);
```

## Support

For issues or questions:
1. Check the logs: `pm2 logs voice-assistant`
2. Review this documentation
3. Check the test script: `tests/test-enhanced-coordinator-production.js`