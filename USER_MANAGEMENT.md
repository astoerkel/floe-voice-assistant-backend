# User Management System Documentation

This document describes the comprehensive user management system implemented for the Voice Assistant Backend.

## Overview

The user management system provides complete user lifecycle management, analytics, and administration capabilities. It includes user profiles, preferences, device management, usage tracking, analytics, and admin oversight.

## Architecture

### Core Components

1. **User Model** - Extended Prisma model with subscription management
2. **Authentication** - JWT-based authentication with refresh tokens
3. **Authorization** - Role-based access control (user/admin)
4. **Analytics** - User behavior tracking and insights
5. **Admin Dashboard** - Complete user oversight and management

### Database Schema

The system uses an extended User model with the following key fields:

```prisma
model User {
  // Basic Information
  id                    String   @id @default(cuid())
  email                 String   @unique
  name                  String?
  preferredName        String?
  profilePictureUrl    String?
  timezone             String?
  
  // Subscription Management
  subscriptionTier     String   @default("free") // "free", "premium", "pro"
  subscriptionStatus   String   @default("active") // "active", "cancelled", "expired"
  subscriptionExpiry   DateTime?
  monthlyUsageCount    Int      @default(0)
  monthlyUsageLimit    Int      @default(50)
  totalCommandsUsed    Int      @default(0)
  
  // Authentication & Authorization
  provider             String   @default("apple")
  role                 String   @default("user") // user, admin
  isActive             Boolean  @default(true)
  
  // Relationships
  userPreferences      UserPreferences?
  devices              Device[]
  usageEvents          UsageEvent[]
  subscriptionEvents   SubscriptionEvent[]
  userLearningData     UserLearningData[]
}
```

## API Endpoints

### User Management (`/api/user`)

#### Profile Management
- `GET /api/user/profile` - Get detailed user profile
- `PUT /api/user/profile` - Update user profile

#### Preferences
- `GET /api/user/preferences` - Get user preferences
- `PUT /api/user/preferences` - Update user preferences

#### Usage & Analytics
- `GET /api/user/usage` - Get usage statistics
- `GET /api/user/devices` - Get user devices
- `POST /api/user/devices` - Register a new device
- `PUT /api/user/devices/:deviceId` - Update device information

#### Account Management
- `DELETE /api/user/account` - Delete user account (GDPR compliance)
- `GET /api/user/export` - Export user data (GDPR compliance)

### Analytics (`/api/analytics`)

#### User Analytics
- `GET /api/analytics/insights` - Get user behavior insights
- `GET /api/analytics/recommendations` - Get personalized recommendations
- `GET /api/analytics/engagement` - Get user engagement metrics
- `POST /api/analytics/feedback` - Track user feedback

#### System Analytics (Admin Only)
- `GET /api/analytics/system` - Get system-wide analytics

### Admin Management (`/api/admin`)

#### User Management
- `GET /api/admin/users` - Get all users (paginated, filtered)
- `GET /api/admin/users/:userId` - Get user details
- `PUT /api/admin/users/:userId` - Update user (admin override)
- `POST /api/admin/users/:userId/reset-usage` - Reset user usage
- `POST /api/admin/users/:userId/deactivate` - Deactivate user
- `POST /api/admin/users/:userId/reactivate` - Reactivate user

#### System Monitoring
- `GET /api/admin/stats` - Get system statistics
- `GET /api/admin/activity` - Get recent activity

## Features

### 1. User Profiles

Complete profile management including:
- Basic information (name, email, profile picture)
- Personalization (preferred name, timezone)
- Subscription details
- Usage statistics

**Example Request:**
```javascript
GET /api/user/profile
Authorization: Bearer <jwt-token>

Response:
{
  "success": true,
  "user": {
    "id": "user123",
    "email": "user@example.com",
    "name": "John Doe",
    "subscriptionTier": "premium",
    "monthlyUsageCount": 25,
    "monthlyUsageLimit": 500,
    "usagePercentage": 5,
    "subscriptionActive": true,
    "isPremium": true
  }
}
```

### 2. User Preferences

Comprehensive preference system for personalization:

- **Response Style**: brief, balanced, detailed
- **Communication**: formal, balanced, casual
- **Enthusiasm Level**: low, balanced, high
- **Work Schedule**: hours, days, timezone
- **Meeting Defaults**: duration, style

**Example Request:**
```javascript
PUT /api/user/preferences
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "responseLength": "balanced",
  "communicationFormality": "casual",
  "workStartTime": "09:00",
  "workEndTime": "17:00",
  "workDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  "timezone": "America/New_York"
}
```

### 3. Device Management

Track and manage user devices:

- Device registration and updates
- Push token management
- Version tracking
- Active/inactive status

**Example Request:**
```javascript
POST /api/user/devices
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "John's iPhone",
  "type": "ios",
  "osVersion": "17.0",
  "appVersion": "2.1.0",
  "pushToken": "abc123..."
}
```

### 4. Usage Analytics

Detailed usage tracking and insights:

- **Command Statistics**: count, types, success rate
- **Time Patterns**: most active times, days
- **Feature Usage**: integration usage breakdown
- **Trends**: growth patterns, engagement

**Example Response:**
```javascript
GET /api/analytics/insights?days=30

{
  "success": true,
  "insights": {
    "totalInteractions": 156,
    "averageConfidence": 0.89,
    "mostUsedIntents": [
      { "intent": "calendar", "count": 45 },
      { "intent": "email", "count": 32 }
    ],
    "mostActiveTimeOfDay": "morning",
    "successRate": 0.94,
    "helpfulnessScore": 87
  }
}
```

### 5. Personalized Recommendations

AI-powered recommendations based on usage patterns:

- Feature suggestions
- Usage optimization tips
- Subscription recommendations
- Performance improvements

**Example Response:**
```javascript
GET /api/analytics/recommendations

{
  "success": true,
  "recommendations": [
    {
      "type": "feature",
      "title": "Try Calendar Integration",
      "description": "Connect your calendar to manage meetings with voice commands.",
      "priority": "medium"
    },
    {
      "type": "optimization", 
      "title": "Peak Performance Time",
      "description": "You're most active in the morning. Consider setting up recurring tasks for this time.",
      "priority": "low"
    }
  ]
}
```

### 6. Admin Dashboard

Comprehensive admin tools for user management:

- **User Overview**: paginated user list with filters
- **User Details**: complete user information
- **Usage Management**: reset quotas, change limits
- **Account Control**: activate/deactivate users
- **System Analytics**: platform-wide insights

**Example Admin Request:**
```javascript
GET /api/admin/users?page=1&limit=20&subscriptionTier=premium&sortBy=lastActive

{
  "success": true,
  "users": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalCount": 89,
    "hasNext": true
  }
}
```

### 7. Subscription Management

Built-in subscription tier management:

- **Free Tier**: 50 commands/month
- **Premium Tier**: 500 commands/month + integrations
- **Pro Tier**: Unlimited usage + advanced features

Usage limiting is automatically enforced via middleware.

### 8. GDPR Compliance

Complete data privacy compliance:

- **Data Export**: Full user data export
- **Account Deletion**: Complete data removal
- **Data Portability**: Structured data format
- **Audit Trails**: Admin action logging

## Security Features

### Authentication
- JWT access tokens (15-minute expiry)
- Refresh tokens (7-day expiry)
- Token revocation support
- Session management

### Authorization
- Role-based access control
- Route-level protection
- Admin privilege checking
- API key authentication

### Data Protection
- Input validation
- SQL injection prevention
- XSS protection
- Rate limiting

## Usage Patterns

### Integration with Voice Commands

The user management system integrates seamlessly with voice command processing:

```javascript
// Usage tracking is automatic via middleware
app.use('/api/voice', authenticateApiKey, jwtAuth, checkUsageLimit, voiceRoutes);

// Analytics tracking in voice processing
await UserAnalyticsService.trackInteraction(userId, {
  interactionType: 'voice_command',
  userInput: transcription,
  assistantResponse: response,
  intent: intent,
  confidence: confidence,
  responseTime: processingTime,
  integrationUsed: agentUsed,
  platform: 'ios'
});
```

### Admin Monitoring

Admins can monitor system health and user activity:

```javascript
// System statistics
GET /api/admin/stats

{
  "users": {
    "total": 1250,
    "active": 890,
    "newThisMonth": 45
  },
  "subscriptions": {
    "free": 800,
    "premium": 350,
    "pro": 100
  },
  "health": {
    "overallHealth": "good",
    "failedCommandsThisWeek": 23
  }
}
```

## Error Handling

The system includes comprehensive error handling:

- **Validation Errors**: Detailed field-level validation
- **Authentication Errors**: Clear auth failure messages
- **Authorization Errors**: Role-based access denials
- **Rate Limiting**: Usage quota enforcement
- **Server Errors**: Graceful error responses

## Performance Considerations

### Database Optimization
- Indexed fields for fast queries
- Efficient pagination
- Optimized analytics queries
- Connection pooling

### Caching
- Redis for session data
- JWT token caching
- Analytics result caching
- Rate limit tracking

### Scalability
- Stateless authentication
- Horizontal scaling support
- Background job processing
- Efficient data structures

## Development and Testing

### Local Development
```bash
# Start the backend
npm run dev

# Test user endpoints
curl -X GET "http://localhost:3000/api/user/profile" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "x-api-key: <api-key>"
```

### Testing Strategy
- Unit tests for controllers
- Integration tests for API endpoints
- Load testing for analytics
- Security testing for auth flows

## Deployment

The user management system is fully integrated with the Hetzner deployment:

```bash
# Deploy with user management
./deploy.sh

# Check user management status
npm run hetzner:logs | grep "user\|admin\|analytics"
```

## Monitoring

Key metrics to monitor:
- User registration rate
- Authentication success rate
- API response times
- Usage limit violations
- Admin actions
- System analytics performance

## Future Enhancements

Planned improvements:
- Real-time notifications
- Advanced ML recommendations
- Multi-tenant support
- Enhanced analytics dashboards
- A/B testing framework
- Advanced security features

## Support

For questions about the user management system:
1. Check this documentation
2. Review API endpoint responses
3. Check application logs
4. Contact system administrators

The user management system provides a complete foundation for user lifecycle management, analytics, and administration in the Voice Assistant platform.