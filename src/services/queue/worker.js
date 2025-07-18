require('dotenv').config();
const logger = require('../../utils/logger');
const { QUEUE_NAMES, JOB_TYPES, createWorker } = require('./config');
const processors = require('./processors');

// Workers array to track all workers
const workers = [];

// Voice processing worker
const voiceProcessingWorker = createWorker(
  QUEUE_NAMES.VOICE_PROCESSING,
  processors.voiceProcessor,
  { concurrency: 5 }
);
if (voiceProcessingWorker) workers.push(voiceProcessingWorker);

// Transcription worker
const transcriptionWorker = createWorker(
  QUEUE_NAMES.TRANSCRIPTION,
  processors.transcriptionProcessor,
  { concurrency: 3 }
);
if (transcriptionWorker) workers.push(transcriptionWorker);

// Synthesis worker
const synthesisWorker = createWorker(
  QUEUE_NAMES.SYNTHESIS,
  processors.synthesisProcessor,
  { concurrency: 3 }
);
if (synthesisWorker) workers.push(synthesisWorker);

// Email processing worker
const emailWorker = createWorker(
  QUEUE_NAMES.EMAIL_PROCESSING,
  processors.emailProcessor,
  { concurrency: 10 }
);
if (emailWorker) workers.push(emailWorker);

// Calendar sync worker
const calendarWorker = createWorker(
  QUEUE_NAMES.CALENDAR_SYNC,
  processors.calendarProcessor,
  { concurrency: 5 }
);
if (calendarWorker) workers.push(calendarWorker);

// Task processing worker
const taskWorker = createWorker(
  QUEUE_NAMES.TASK_PROCESSING,
  processors.taskProcessor,
  { concurrency: 10 }
);
if (taskWorker) workers.push(taskWorker);

// AI processing worker
const aiWorker = createWorker(
  QUEUE_NAMES.AI_PROCESSING,
  processors.aiProcessor,
  { concurrency: 3 }
);
if (aiWorker) workers.push(aiWorker);

// Notification worker
const notificationWorker = createWorker(
  QUEUE_NAMES.NOTIFICATION,
  processors.notificationProcessor,
  { concurrency: 20 }
);
if (notificationWorker) workers.push(notificationWorker);

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down workers...');
  
  // Close all workers
  await Promise.all(
    workers.map(worker => worker ? worker.close() : Promise.resolve())
  );
  
  logger.info('All workers shut down');
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown();
});

logger.info(`Worker process started with ${workers.length} workers`);