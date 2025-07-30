# JWT Authentication Issues Analysis

## Problem Summary
The iOS app is receiving 401 "Authentication required" and 500 "Authentication failed" errors despite sending valid JWT tokens.

## Key Findings from Code Analysis

### 1. Authentication Middleware Setup
The backend uses two different JWT authentication patterns:

- **Primary JWT Middleware** (`src/middleware/jwtAuth.js`): Strict authentication that returns 401 if token is invalid
- **Session Auth Middleware** (`src/middleware/sessionAuth.js`): Lenient authentication that continues without error if token is invalid

**Current Route Configuration** (`src/app.js`):
```javascript
app.use('/api/voice', authenticateApiKey, jwtAuth, checkUsageLimit, voiceRoutes);
```
The app is using `sessionAuth.js` (imported as `jwtAuth`) which is **lenient** and won't return 401 errors.

### 2. JWT Service Configuration
**Environment Variables Required**:
- `JWT_SECRET`: Used for access token signing/verification
- `JWT_REFRESH_SECRET`: Used for refresh token signing/verification
- `JWT_EXPIRATION`: Token expiration time (default: 15m)
- `REFRESH_TOKEN_EXPIRATION`: Refresh token expiration (default: 7d)

**Local .env Configuration**:
```
JWT_SECRET=local-dev-secret
JWT_REFRESH_SECRET=local-dev-refresh-secret
JWT_EXPIRATION=15m
REFRESH_TOKEN_EXPIRATION=7d
```

### 3. Potential Issues Identified

#### Issue #1: Environment Variable Mismatch
- Local development uses simple secrets (`local-dev-secret`)
- Production server may have different or missing JWT secrets
- **Fix**: Verify production environment variables match expected values

#### Issue #2: Database Connection Failures
From error logs:
```
Can't reach database server at `localhost:5432`
```
- JWT authentication requires database lookup to verify user exists and is active
- Database connection failures will cause authentication to fail
- **Fix**: Verify PostgreSQL is running and accessible

#### Issue #3: Inconsistent Authentication Middleware
- `sessionAuth.js` (lenient) vs `jwtAuth.js` (strict)
- Different error handling patterns
- **Fix**: Use consistent middleware based on requirements

#### Issue #4: Token Format Expectations
The middleware expects:
```
Authorization: Bearer <jwt-token>
```
- iOS app must send exactly this format
- **Fix**: Verify iOS implementation sends proper Authorization header

### 4. Authentication Flow Analysis

**Expected Flow**:
1. iOS sends `Authorization: Bearer <token>` header
2. Middleware extracts token from `Bearer <token>`
3. JWT service verifies token using `JWT_SECRET`
4. Database lookup for user by `decoded.userId`
5. Verify user exists and `isActive = true`
6. Attach user to request object

**Failure Points**:
- Missing/invalid JWT_SECRET
- Database connection failure
- User not found or inactive
- Malformed Authorization header
- Expired or invalid token

## Recommended Diagnostic Steps

### Step 1: Server Access and Status Check
```bash
# SSH to server
ssh root@floe.cognetica.de

# Check PM2 status
pm2 status
pm2 logs --lines 50

# Run diagnostic script
cd /app  # or wherever the app is deployed
node debug-jwt.js
```

### Step 2: Environment Variable Verification
```bash
# Check PM2 environment
pm2 show voice-assistant-backend

# Verify JWT secrets are set
pm2 exec "echo JWT_SECRET: $JWT_SECRET"
pm2 exec "echo JWT_REFRESH_SECRET: $JWT_REFRESH_SECRET"
```

### Step 3: Database Connectivity
```bash
# Check PostgreSQL status
systemctl status postgresql

# Test database connection
psql -h localhost -U postgres -d voiceassistant -c "SELECT COUNT(*) FROM users;"
```

### Step 4: Token Testing
Use the `debug-jwt.js` script to:
- Verify JWT service initialization
- Test token generation and verification
- Simulate middleware authentication flow

### Step 5: iOS App Token Inspection
Verify iOS app sends:
- Correct Authorization header format
- Valid JWT token in payload
- Token hasn't expired
- User ID in token matches database

## Immediate Actions Required

1. **Run Diagnostic Scripts**:
   - Copy `debug-jwt.js` to server
   - Execute `server-diagnostic-commands.sh`
   - Analyze output for specific failures

2. **Check Production Environment**:
   - Verify JWT_SECRET and JWT_REFRESH_SECRET are properly set
   - Ensure database connection is working
   - Confirm PM2 process is running with correct environment

3. **Review iOS Implementation**:
   - Verify Authorization header format
   - Check token expiration handling
   - Confirm user authentication state

4. **Fix Authentication Middleware**:
   - Choose consistent middleware (strict vs lenient)
   - Update error handling for better debugging
   - Add detailed logging for authentication failures

## Files Created for Diagnosis

1. **`debug-jwt.js`**: Comprehensive JWT system testing
2. **`server-diagnostic-commands.sh`**: Server-side diagnostic commands
3. **`jwt-analysis-report.md`**: This analysis document

## Next Steps

1. Run the diagnostic scripts on the server
2. Share the output for detailed analysis
3. Fix identified issues based on diagnostic results
4. Test authentication flow end-to-end
5. Monitor logs for resolution confirmation