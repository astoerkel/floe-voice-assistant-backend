# Queue System Documentation

## Overview

The Voice Assistant backend uses BullMQ for managing background jobs and asynchronous processing. This ensures reliable job execution, retry logic, and scalability.

## Architecture

### Queue Types

1. **Voice Processing** (`voice-processing`)
   - Process voice commands
   - Handle AI responses
   - Priority: High

2. **Transcription** (`transcription`)
   - Speech-to-text processing
   - Audio file transcription
   - Priority: High

3. **Synthesis** (`synthesis`)
   - Text-to-speech generation
   - Voice synthesis
   - Priority: Medium

4. **Email Processing** (`email-processing`)
   - Send emails
   - Sync email inbox
   - Process email commands
   - Priority: Medium

5. **Calendar Sync** (`calendar-sync`)
   - Sync calendar events
   - Create/update events
   - Priority: Medium

6. **Task Processing** (`task-processing`)
   - Create/update tasks
   - Sync with Airtable
   - Priority: Low

7. **AI Processing** (`ai-processing`)
   - General AI requests
   - Batch processing
   - Priority: High

8. **Notification** (`notification`)
   - Push notifications
   - Email notifications
   - Priority: Low

## Usage

### Adding Jobs to Queue

```javascript
const queueService = require('./services/queue');

// Process voice command
await queueService.processVoiceCommand({
  userId: 'user123',
  text: 'What's my next meeting?',
  conversationId: 'conv456'
});

// Transcribe audio
await queueService.transcribeAudio({
  userId: 'user123',
  audioBuffer: audioData,
  mimeType: 'audio/mp3',
  language: 'en'
});

// Send email
await queueService.sendEmail({
  userId: 'user123',
  to: 'recipient@example.com',
  subject: 'Meeting Reminder',
  body: 'Your meeting starts in 10 minutes'
});
```

### Monitoring Queues

```bash
# Get all queue statuses
GET /api/queue/status

# Get specific queue status
GET /api/queue/status/voice-processing

# Clean completed jobs (admin only)
POST /api/queue/clean/voice-processing
{
  "status": "completed",
  "grace": 3600000,  // 1 hour
  "limit": 100
}

# Pause/Resume queue (admin only)
POST /api/queue/pause/voice-processing
POST /api/queue/resume/voice-processing
```

## Worker Process

### Starting Workers

```bash
# Start worker process
npm run worker

# Start specific worker in development
node src/services/queue/worker.js
```

### Worker Configuration

Workers are configured with:
- Concurrency limits
- Retry strategies
- Error handling
- Graceful shutdown

## Job Configuration

### Default Job Options

```javascript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  removeOnComplete: {
    age: 3600,    // 1 hour
    count: 100    // Keep last 100
  },
  removeOnFail: {
    age: 86400    // 24 hours
  }
}
```

### Priority Levels

- 1: Critical (voice commands, AI processing)
- 2: High (transcription, synthesis)
- 3: Normal (email, calendar)
- 4: Low (notifications, background sync)

## Recurring Jobs

Some jobs run on schedules:

```javascript
// Email sync - every 30 minutes
{ repeat: { cron: '0 */30 * * * *' } }

// Calendar sync - every 15 minutes
{ repeat: { cron: '0 */15 * * * *' } }

// Task sync - every hour
{ repeat: { cron: '0 0 */1 * * *' } }
```

## Error Handling

### Retry Strategy

- Exponential backoff starting at 2 seconds
- Maximum 3 attempts
- Failed jobs kept for 24 hours

### Error Recovery

```javascript
// Jobs automatically retry on failure
// Final failures are logged with error details
// Failed jobs can be manually retried via admin API
```

## Performance Tuning

### Concurrency Settings

- Voice Processing: 5 concurrent jobs
- Transcription: 3 concurrent jobs
- Email/Calendar: 10 concurrent jobs
- Notifications: 20 concurrent jobs

### Redis Configuration

```javascript
{
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  reconnectOnError: true
}
```

## Deployment

### Environment Variables

```bash
REDIS_URL=redis://default:password@host:port
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret
```

### Hetzner Deployment

The worker process runs with PM2:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'voice-assistant-web',
      script: 'npm start',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'voice-assistant-worker',
      script: 'npm run worker',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
```

## Monitoring

### Health Checks

- Queue status endpoint: `/api/queue/status`
- Worker health logged every 30 seconds
- Failed job alerts via logging

### Metrics

- Jobs processed per minute
- Average processing time
- Queue depth
- Failure rate

## Best Practices

1. **Keep Jobs Small**: Break large tasks into smaller jobs
2. **Idempotent Jobs**: Ensure jobs can be safely retried
3. **Error Handling**: Always handle errors gracefully
4. **Logging**: Log job progress and results
5. **Timeouts**: Set appropriate job timeouts
6. **Cleanup**: Regularly clean old completed jobs

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Check REDIS_URL environment variable
   - Verify Redis is running
   - Check network connectivity

2. **Jobs Not Processing**
   - Ensure worker process is running
   - Check queue is not paused
   - Verify Redis connection

3. **High Memory Usage**
   - Clean old completed jobs
   - Reduce concurrency
   - Check for memory leaks

### Debug Mode

Enable debug logging:

```bash
DEBUG=bull* npm run worker
```