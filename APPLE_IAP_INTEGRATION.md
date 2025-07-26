# Apple In-App Purchase Integration Documentation

This document describes the comprehensive Apple In-App Purchase (IAP) integration implemented for the Voice Assistant backend.

## Overview

The Apple IAP integration provides complete subscription management for the Voice Assistant app, including purchase processing, receipt validation, subscription management, and webhook handling for server-to-server notifications.

## Architecture

### Core Components

1. **AppleIAPService** - Main service for Apple receipt validation and subscription processing
2. **SubscriptionsController** - API controller for subscription-related endpoints
3. **Background Worker** - Handles scheduled tasks like subscription expiry processing
4. **Webhook Handler** - Processes Apple's Server-to-Server notifications

### File Structure

```
src/
├── services/subscriptions/
│   └── appleIAP.js                    # Apple IAP service implementation
├── controllers/
│   └── subscriptions.controller.js    # Subscriptions API controller
├── routes/
│   └── subscriptions.js              # Subscription routes
├── jobs/
│   └── subscriptionExpiry.js         # Background job for handling expiries
└── worker.js                         # Background worker process
```

## Product Configuration

### App Store Connect Setup

The following product IDs should be configured in App Store Connect:

```javascript
const productIds = {
  premium_monthly: 'com.floe.voiceassistant.premium.monthly',
  premium_yearly: 'com.floe.voiceassistant.premium.yearly',
  pro_monthly: 'com.floe.voiceassistant.pro.monthly',
  pro_yearly: 'com.floe.voiceassistant.pro.yearly'
};
```

### Subscription Tiers

**Free Tier**
- 50 voice commands per month
- Basic features only

**Premium Tier**
- 500 voice commands per month
- Calendar integration
- Email integration
- Task management
- Priority support

**Pro Tier**
- Unlimited voice commands
- All integrations
- Advanced analytics
- Custom workflows
- Beta features

## API Endpoints

### Purchase Management

#### Process Purchase
```http
POST /api/subscriptions/purchase
Authorization: Bearer <jwt-token>
x-api-key: <api-key>
Content-Type: application/json

{
  "receiptData": "base64-encoded-receipt-data",
  "transactionId": "apple-transaction-id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Purchase processed successfully",
  "subscription": {
    "tier": "premium",
    "status": "active",
    "expiryDate": "2024-02-15T10:30:00.000Z",
    "usageLimit": 500
  }
}
```

#### Restore Purchases
```http
POST /api/subscriptions/restore
Authorization: Bearer <jwt-token>
x-api-key: <api-key>
Content-Type: application/json

{
  "receiptData": "base64-encoded-receipt-data"
}
```

### Subscription Status

#### Get Current Status
```http
GET /api/subscriptions/status
Authorization: Bearer <jwt-token>
x-api-key: <api-key>
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "tier": "premium",
    "status": "active",
    "expiryDate": "2024-02-15T10:30:00.000Z",
    "daysUntilExpiry": 25,
    "usageLimit": 500,
    "usageCount": 123,
    "usagePercentage": 25,
    "isPremium": true,
    "isActive": true,
    "monthlyUsage": 123
  },
  "history": [
    {
      "id": "event-1",
      "eventType": "purchase",
      "subscriptionTier": "premium",
      "amount": 4.99,
      "currency": "USD",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "expiryDate": "2024-02-15T10:30:00.000Z"
    }
  ]
}
```

#### Get Available Plans
```http
GET /api/subscriptions/plans
Authorization: Bearer <jwt-token>
x-api-key: <api-key>
```

### Subscription Management

#### Cancel Subscription
```http
POST /api/subscriptions/cancel
Authorization: Bearer <jwt-token>
x-api-key: <api-key>
Content-Type: application/json

{
  "reason": "user_requested"
}
```

#### Reactivate Subscription
```http
POST /api/subscriptions/reactivate
Authorization: Bearer <jwt-token>
x-api-key: <api-key>
Content-Type: application/json

{
  "receiptData": "base64-encoded-receipt-data"
}
```

### Admin Analytics

#### Get Subscription Analytics
```http
GET /api/subscriptions/analytics?days=30
Authorization: Bearer <jwt-token>
x-api-key: <api-key>
```

**Response:**
```json
{
  "success": true,
  "analytics": {
    "revenue": {
      "total": 1247.65,
      "period": "30 days"
    },
    "subscriptions": {
      "total": 1250,
      "byTier": {
        "free": 800,
        "premium": 350,
        "pro": 100
      },
      "new": 45,
      "churnRate": 12
    },
    "popularPlans": [
      { "tier": "premium", "purchases": 28 },
      { "tier": "pro", "purchases": 17 }
    ]
  }
}
```

## Webhook Integration

### Apple Server-to-Server Notifications

The webhook endpoint handles Apple's server-to-server notifications for subscription events:

```http
POST /api/subscriptions/webhook
x-apple-signature: <signature>
Content-Type: application/json

{
  "notification_type": "DID_RENEW",
  "unified_receipt": {
    "bundle_id": "com.floe.voiceassistant",
    "latest_receipt": "base64-receipt-data",
    "latest_receipt_info": [...]
  }
}
```

### Supported Notification Types

- `INITIAL_BUY` - Initial purchase
- `DID_RENEW` - Subscription renewed
- `DID_CANCEL` - Subscription cancelled
- `EXPIRED` - Subscription expired
- `DID_RECOVER` - Subscription recovered from billing issue
- `RESUBSCRIBE` - User resubscribed

## Receipt Validation

### Validation Process

1. **Primary Validation**: Attempt production validation first
2. **Fallback Validation**: If status 21007, retry with sandbox
3. **Receipt Processing**: Extract transaction details
4. **Duplicate Check**: Verify transaction hasn't been processed
5. **User Update**: Update subscription status and limits

### Security Features

- **Signature Validation**: Webhook signatures validated using shared secret
- **Receipt Verification**: All receipts validated with Apple servers
- **Duplicate Prevention**: Transaction IDs tracked to prevent double processing
- **Environment Detection**: Automatic sandbox/production environment handling

## Background Jobs

### Subscription Expiry Job

Runs daily at 2 AM UTC to process expired subscriptions:

```javascript
// Job configuration
cron.schedule('0 2 * * *', async () => {
  await processExpiredSubscriptions();
});
```

**Process:**
1. Find users with expired subscriptions
2. Update subscription status to 'expired'
3. Reset subscription tier to 'free'
4. Update usage limits
5. Record expiration events
6. Send notifications if configured

### Manual Job Execution

```bash
# Start background worker
npm run worker

# Development mode with auto-reload
npm run worker:dev
```

## Database Schema

### Extended User Model

```prisma
model User {
  // Subscription fields
  subscriptionTier     String   @default("free")
  subscriptionStatus   String   @default("active")
  subscriptionExpiry   DateTime?
  monthlyUsageCount    Int      @default(0)
  monthlyUsageLimit    Int      @default(50)
  totalCommandsUsed    Int      @default(0)
  
  // Relationships
  subscriptionEvents   SubscriptionEvent[]
}

model SubscriptionEvent {
  id                  String    @id @default(cuid())
  userId              String
  user                User      @relation(fields: [userId], references: [id])
  
  eventType           String    // purchase, renewal, cancellation, expiration
  subscriptionTier    String?
  amount              Float?
  currency            String?
  transactionId       String?   @unique
  appleTransactionId  String?
  receiptData         String?
  expiryDate          DateTime?
  metadata            Json?
  
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  
  @@index([userId])
  @@index([eventType])
  @@index([transactionId])
}
```

## Environment Configuration

### Required Environment Variables

```bash
# Apple In-App Purchases
APPLE_SHARED_SECRET=your-apple-shared-secret

# Optional webhook notifications
SUBSCRIPTION_WEBHOOK_URL=https://your-monitoring-service.com/webhook
ERROR_WEBHOOK_URL=https://your-error-tracking.com/webhook
```

### Hetzner Deployment

The system is configured for Hetzner deployment with PM2:

```javascript
// ecosystem.config.js
{
  apps: [
    {
      name: 'voice-assistant-api',
      script: 'src/app.js'
    },
    {
      name: 'voice-assistant-worker',
      script: 'src/worker.js'  // Background jobs
    }
  ]
}
```

## iOS Integration

### StoreKit Integration

The iOS app should implement StoreKit for purchase handling:

```swift
// Example purchase flow
let product = try await Product.products(for: [productId]).first
let result = try await product.purchase()

if case .success(let verification) = result {
    let receiptData = try await getReceiptData()
    let transactionId = verification.transaction.id
    
    // Send to backend
    await processpurchase(receiptData: receiptData, transactionId: transactionId)
}
```

### Receipt Data Retrieval

```swift
func getReceiptData() async throws -> String {
    if let appStoreReceiptURL = Bundle.main.appStoreReceiptURL,
       FileManager.default.fileExists(atPath: appStoreReceiptURL.path) {
        let receiptData = try Data(contentsOf: appStoreReceiptURL)
        return receiptData.base64EncodedString()
    }
    throw ReceiptError.noReceipt
}
```

## Error Handling

### Common Error Cases

1. **Invalid Receipt**: Receipt data is malformed or invalid
2. **Network Errors**: Apple server communication failures
3. **Duplicate Transactions**: Transaction already processed
4. **Expired Receipts**: Receipt contains no active subscriptions
5. **User Not Found**: No user associated with transaction

### Error Response Format

```json
{
  "error": "Purchase processing failed",
  "message": "Receipt verification failed"
}
```

## Monitoring and Analytics

### Key Metrics to Track

- Purchase success/failure rates
- Receipt validation response times
- Subscription churn rates
- Revenue trends
- Feature adoption by subscription tier

### Logging

The system includes comprehensive logging:

```javascript
logger.info('Subscription purchase processed', {
  userId,
  tier: subscriptionInfo.tier,
  transactionId,
  expiryDate
});
```

## Testing

### Development Testing

1. **Sandbox Environment**: Use Sandbox receipts for testing
2. **Mock Receipts**: Test with various receipt scenarios
3. **Expiry Simulation**: Test subscription expiry handling
4. **Webhook Testing**: Simulate Apple webhook notifications

### Production Validation

1. **Receipt Validation**: Verify production receipts work correctly
2. **Webhook Handling**: Test live webhook notifications
3. **Background Jobs**: Monitor expiry job performance
4. **Analytics**: Validate subscription analytics accuracy

## Security Considerations

### Best Practices

1. **Shared Secret Protection**: Store Apple shared secret securely
2. **Signature Validation**: Always validate webhook signatures
3. **Receipt Verification**: Never trust client-side purchase data
4. **Transaction Logging**: Log all subscription events for audit
5. **Rate Limiting**: Protect API endpoints from abuse

### Compliance

- **App Store Guidelines**: Follow Apple's subscription guidelines
- **GDPR**: Implement data privacy for EU users
- **PCI DSS**: Handle payment data securely
- **Audit Trails**: Maintain subscription event logs

## Troubleshooting

### Common Issues

1. **21007 Status Code**: Receipt is from sandbox, retry with sandbox URL
2. **21002 Status Code**: Receipt data is malformed
3. **Webhook Signature Mismatch**: Check shared secret configuration
4. **User Not Found**: Ensure proper user-transaction linking

### Debug Tools

```bash
# Check subscription worker status
npm run hetzner:status

# View worker logs
npm run hetzner:logs

# Manual subscription check
curl -X GET "https://your-api.com/api/subscriptions/status" \
  -H "Authorization: Bearer <token>" \
  -H "x-api-key: <api-key>"
```

## Future Enhancements

### Planned Features

1. **Family Sharing**: Support for Apple Family Sharing
2. **Promotional Offers**: Implement promotional codes
3. **Grace Period**: Handle subscription billing issues
4. **Advanced Analytics**: More detailed subscription insights
5. **A/B Testing**: Test different subscription offerings

### Integration Opportunities

- Push notifications for subscription events
- Email marketing for subscription reminders
- Advanced fraud detection
- Revenue optimization algorithms

The Apple In-App Purchase integration provides a robust foundation for subscription management in the Voice Assistant platform, ensuring reliable payment processing, comprehensive analytics, and seamless user experience.