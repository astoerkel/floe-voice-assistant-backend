# OAuth Integration Deployment - Railway

## Quick Start

Based on your Google Cloud Console setup, here's how to deploy the OAuth integration to Railway:

### 1. Set Railway Environment Variables

```bash
# Copy these values from your Google Cloud Console
GOOGLE_CLIENT_ID=899362685715-cspn... # Your web application client ID
GOOGLE_CLIENT_SECRET=your_client_secret_here

# Railway URLs
BACKEND_URL=https://voiceassistant-floe-production.up.railway.app
FRONTEND_URL=com.amitstoerkel.VoiceAssistant://oauth

# Generate strong JWT secrets (32+ characters)
JWT_SECRET=your_super_secret_jwt_key_here
JWT_REFRESH_SECRET=your_super_secret_refresh_key_here

# Existing variables (should already be set)
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account"...}
```

### 2. Deploy OAuth System

```bash
# Deploy the OAuth integration
npm run deploy-oauth

# Or run individual steps
npm run validate-deployment
npm run deploy-migrations
```

### 3. Test OAuth Flow

Your OAuth endpoints are ready at:
- **Google OAuth Init**: `https://voiceassistant-floe-production.up.railway.app/api/oauth/google/init`
- **Google OAuth Callback**: `https://voiceassistant-floe-production.up.railway.app/api/oauth/google/callback`
- **Integrations List**: `https://voiceassistant-floe-production.up.railway.app/api/oauth/integrations`

## iOS App Integration

### Update Info.plist

Your Info.plist needs the reversed client ID from GoogleService-Info.plist:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>com.amitstoerkel.VoiceAssistant</string>
            <string>YOUR_REVERSED_CLIENT_ID</string> <!-- From GoogleService-Info.plist -->
        </array>
    </dict>
</array>
```

### APIClient Configuration

Update your APIClient base URL to point to Railway:

```swift
class APIClient {
    static let shared = APIClient()
    
    private let baseURL = "https://voiceassistant-floe-production.up.railway.app"
    
    // ... rest of implementation
}
```

### Testing OAuth Flow

1. **Open iOS App**
2. **Navigate to Settings → Service Integrations**
3. **Tap "Connect" for Google Services**
4. **Complete OAuth flow in Safari**
5. **Return to app via deep link**
6. **Verify connection status**

## Google Cloud Console Configuration

Your setup should match these settings:

### Web Application Credentials
- **Client ID**: `899362685715-cspn...` (starts with your project number)
- **Client Secret**: From Google Cloud Console
- **Authorized origins**: `https://voiceassistant-floe-production.up.railway.app`
- **Redirect URIs**: `https://voiceassistant-floe-production.up.railway.app/api/oauth/google/callback`

### iOS Application Credentials
- **Client ID**: `899362685715-eha0...` (different from web client ID)
- **Bundle ID**: `com.amitstoerkel.VoiceAssistant`
- **GoogleService-Info.plist**: Added to iOS project

### OAuth Scopes
```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

## API Endpoints

### OAuth Management
```
GET  /api/oauth/google/init           - Start Google OAuth flow
GET  /api/oauth/google/callback       - Handle Google OAuth callback
GET  /api/oauth/integrations          - List user integrations
DELETE /api/oauth/integrations/:id    - Disconnect integration
GET  /api/oauth/integrations/google/test - Test Google connection
```

### Service Integration (Coming Soon)
```
GET  /api/integrations/calendar/events    - List calendar events
POST /api/integrations/calendar/events    - Create calendar event
GET  /api/integrations/email/messages     - List emails
POST /api/integrations/email/send         - Send email
```

## Database Schema

The OAuth system uses these models:

```prisma
model Integration {
  id           String   @id @default(cuid())
  userId       String
  type         String   // 'google', 'airtable'
  accessToken  String   @db.Text
  refreshToken String?  @db.Text
  tokenType    String   @default("Bearer")
  expiresAt    DateTime?
  scope        String?  @db.Text
  isActive     Boolean  @default(true)
  lastSyncAt   DateTime?
  serviceData  Json?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  user         User     @relation(fields: [userId], references: [id])
  
  @@unique([userId, type])
}

model OAuthState {
  id          String   @id @default(cuid())
  state       String   @unique
  userId      String?
  provider    String
  returnUrl   String?
  codeVerifier String?
  createdAt   DateTime @default(now())
  expiresAt   DateTime
}
```

## Monitoring

### Check Deployment Status
```bash
# View Railway logs
railway logs --follow

# Check health
curl https://voiceassistant-floe-production.up.railway.app/health

# Test OAuth endpoint
curl https://voiceassistant-floe-production.up.railway.app/api/oauth/google/init
```

### Monitor OAuth Events
```bash
# Filter OAuth-related logs
railway logs --filter="oauth"

# Monitor token refresh events
railway logs --filter="token refresh"

# Watch for errors
railway logs --filter="error"
```

## Troubleshooting

### Common Issues

1. **OAuth Redirect URI Mismatch**
   - Ensure redirect URI exactly matches: `https://voiceassistant-floe-production.up.railway.app/api/oauth/google/callback`

2. **Missing Environment Variables**
   - Run `npm run validate-deployment` to check configuration

3. **Database Connection Issues**
   - Check Railway database service status
   - Verify DATABASE_URL is correct

4. **Token Refresh Failures**
   - Monitor logs for refresh token errors
   - Users may need to reconnect their accounts

### Debug Commands

```bash
# Validate OAuth configuration
npm run validate-deployment

# Test database connection
npx prisma db push --preview-feature

# Check migration status
npx prisma migrate status

# Generate deployment report
npm run deploy-oauth
```

## Security Notes

- **Never commit OAuth credentials** to version control
- **Use strong JWT secrets** (32+ characters)
- **Monitor for token refresh failures**
- **Set up alerts for integration errors**
- **Rotate secrets periodically**

## Next Steps

1. **Deploy to Railway**: `npm run deploy-oauth`
2. **Test OAuth flows** from iOS app
3. **Implement service integrations** (Calendar, Gmail)
4. **Set up monitoring** and alerts
5. **Add Airtable OAuth** when ready

## Support

If you encounter issues:
1. Check Railway logs: `railway logs`
2. Verify environment variables are set
3. Test OAuth flow in browser first
4. Review Google Cloud Console configuration
5. Check database connectivity

The OAuth system is ready for production deployment to Railway! 🚀