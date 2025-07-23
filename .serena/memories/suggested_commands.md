# Development Commands

## Project Setup
```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Then edit .env with your configuration
```

## Database Commands
```bash
# Run database migrations
npm run migrate
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Open Prisma Studio (database GUI)
npx prisma studio

# Reset database (caution: deletes all data)
npx prisma migrate reset
```

## Development
```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Start background worker for queue processing
npm run worker

# Build project (generates Prisma client)
npm run build
```

## Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Run specific test file
npm test path/to/test.js
```

## Deployment (Railway)
```bash
# Login to Railway
railway login

# Deploy to Railway
railway up

# Deploy specific service
railway up --service "VoiceAssistant Floe"

# View logs
railway logs

# Run command in Railway environment
railway run [command]
```

## Process Management (Production)
```bash
# Start with PM2
pm2 start ecosystem.config.js

# View PM2 processes
pm2 list

# View logs
pm2 logs voice-assistant-api

# Restart process
pm2 restart voice-assistant-api

# Stop process
pm2 stop voice-assistant-api
```

## Git Commands (Darwin/macOS)
```bash
# Stage changes
git add .

# Commit changes
git commit -m "message"

# Push to remote
git push origin main

# Check status
git status

# View commit history
git log --oneline
```

## Utility Commands
```bash
# Find files
find . -name "*.js" -type f

# Search in files (macOS)
grep -r "pattern" src/

# List directory contents
ls -la

# View file content
cat filename

# Monitor logs in real-time
tail -f logs/error.log
```

## Environment Check
```bash
# Check Node version
node --version

# Check npm version
npm --version

# Check installed packages
npm list

# Check for outdated packages
npm outdated
```