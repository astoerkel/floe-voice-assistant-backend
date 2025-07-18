const { Queue, Worker, QueueEvents } = require('bullmq');
const logger = require('../../utils/logger');

// Queue configuration
const defaultQueueConfig = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      age: 3600, // keep completed jobs for 1 hour
      count: 100 // keep last 100 completed jobs
    },
    removeOnFail: {
      age: 24 * 3600 // keep failed jobs for 24 hours
    }
  }
};

// Redis connection for BullMQ - disable if URL contains localhost or railway internal
const shouldUseRedis = process.env.REDIS_URL && 
  !process.env.REDIS_URL.includes('localhost') && 
  !process.env.REDIS_URL.includes('railway.internal') &&
  !process.env.DISABLE_REDIS;

const connection = shouldUseRedis ? {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  url: process.env.REDIS_URL
} : null;

// Queue names
const QUEUE_NAMES = {
  VOICE_PROCESSING: 'voice-processing',
  EMAIL_PROCESSING: 'email-processing',
  CALENDAR_SYNC: 'calendar-sync',
  TASK_PROCESSING: 'task-processing',
  AI_PROCESSING: 'ai-processing',
  NOTIFICATION: 'notification',
  TRANSCRIPTION: 'transcription',
  SYNTHESIS: 'synthesis'
};

// Job types
const JOB_TYPES = {
  // Voice processing jobs
  PROCESS_VOICE_COMMAND: 'process-voice-command',
  TRANSCRIBE_AUDIO: 'transcribe-audio',
  SYNTHESIZE_SPEECH: 'synthesize-speech',
  
  // Email jobs
  SEND_EMAIL: 'send-email',
  SYNC_EMAILS: 'sync-emails',
  PROCESS_EMAIL_COMMAND: 'process-email-command',
  
  // Calendar jobs
  SYNC_CALENDAR: 'sync-calendar',
  CREATE_EVENT: 'create-event',
  UPDATE_EVENT: 'update-event',
  
  // Task jobs
  CREATE_TASK: 'create-task',
  UPDATE_TASK: 'update-task',
  SYNC_TASKS: 'sync-tasks',
  
  // AI processing jobs
  PROCESS_AI_REQUEST: 'process-ai-request',
  BATCH_AI_PROCESSING: 'batch-ai-processing',
  
  // Notification jobs
  SEND_PUSH_NOTIFICATION: 'send-push-notification',
  SEND_EMAIL_NOTIFICATION: 'send-email-notification'
};

// Create queue instance
const createQueue = (queueName, options = {}) => {
  if (!connection) {
    logger.warn(`Cannot create queue ${queueName} - Redis not configured`);
    return null;
  }
  
  return new Queue(queueName, {
    connection,
    ...defaultQueueConfig,
    ...options
  });
};

// Create worker instance
const createWorker = (queueName, processor, options = {}) => {
  if (!connection) {
    logger.warn(`Cannot create worker for ${queueName} - Redis not configured`);
    return null;
  }
  
  const worker = new Worker(queueName, processor, {
    connection,
    concurrency: options.concurrency || 5,
    ...options
  });
  
  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} completed in queue ${queueName}`);
  });
  
  worker.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed in queue ${queueName}:`, err);
  });
  
  worker.on('error', (err) => {
    logger.error(`Worker error in queue ${queueName}:`, err);
  });
  
  return worker;
};

// Create queue events listener
const createQueueEvents = (queueName) => {
  if (!connection) {
    return null;
  }
  
  return new QueueEvents(queueName, { connection });
};

module.exports = {
  defaultQueueConfig,
  connection,
  QUEUE_NAMES,
  JOB_TYPES,
  createQueue,
  createWorker,
  createQueueEvents
};