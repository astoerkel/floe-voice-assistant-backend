# Task Completion Checklist

When completing a development task, ensure the following:

## Before Committing
1. **Code Quality**
   - Code follows project conventions (2-space indentation, single quotes)
   - No console.log statements in production code
   - Proper error handling with try/catch blocks
   - Async operations use async/await pattern

2. **Testing**
   - Run tests: `npm test`
   - Ensure all tests pass
   - Add new tests for new functionality
   - Test edge cases and error scenarios

3. **Database Changes**
   - If schema changed, create migration: `npx prisma migrate dev`
   - Regenerate Prisma client: `npx prisma generate`
   - Test database operations locally

4. **Dependencies**
   - If new packages added, ensure they're in package.json
   - Run `npm install` to verify clean installation
   - Check for security vulnerabilities: `npm audit`

5. **Environment Variables**
   - Update `.env.example` if new variables added
   - Document any new configuration requirements
   - Never commit actual `.env` file

## Local Testing
1. Start development server: `npm run dev`
2. Test API endpoints manually or with tools
3. Check logs for errors or warnings
4. Verify WebSocket connections if applicable
5. Test with both success and error scenarios

## Pre-Deployment
1. Ensure code runs without errors
2. All environment variables are configured
3. Database migrations are ready
4. Background workers function properly
5. API documentation is updated if needed

## Deployment (Railway)
1. Commit and push changes to repository
2. Railway auto-deploys on push to main branch
3. Monitor deployment logs: `railway logs`
4. Verify production functionality
5. Check error monitoring/logs

## Post-Deployment
1. Verify all endpoints working in production
2. Check database connectivity
3. Monitor performance and errors
4. Test critical user flows
5. Be ready to rollback if issues arise