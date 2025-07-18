const logger = require('../../utils/logger');
const {
  QUEUE_NAMES,
  JOB_TYPES,
  createQueue,
  createWorker,
  createQueueEvents
} = require('./config');

// Queue instances
const queues = {};

// Initialize all queues
const initializeQueues = () => {
  Object.values(QUEUE_NAMES).forEach(queueName => {
    const queue = createQueue(queueName);
    if (queue) {
      queues[queueName] = queue;
      logger.info(`Initialized queue: ${queueName}`);
    }
  });
};

// Add job to queue
const addJob = async (queueName, jobType, data, options = {}) => {
  const queue = queues[queueName];
  if (!queue) {
    logger.warn(`Queue ${queueName} not available`);
    return null;
  }
  
  try {
    const job = await queue.add(jobType, data, options);
    logger.info(`Added job ${job.id} to queue ${queueName}`);
    return job;
  } catch (error) {
    logger.error(`Error adding job to queue ${queueName}:`, error);
    throw error;
  }
};

// Voice processing jobs
const processVoiceCommand = async (data) => {
  return addJob(
    QUEUE_NAMES.VOICE_PROCESSING,
    JOB_TYPES.PROCESS_VOICE_COMMAND,
    data,
    { priority: 1 }
  );
};

const transcribeAudio = async (data) => {
  return addJob(
    QUEUE_NAMES.TRANSCRIPTION,
    JOB_TYPES.TRANSCRIBE_AUDIO,
    data,
    { priority: 2 }
  );
};

const synthesizeSpeech = async (data) => {
  return addJob(
    QUEUE_NAMES.SYNTHESIS,
    JOB_TYPES.SYNTHESIZE_SPEECH,
    data,
    { priority: 2 }
  );
};

// Email processing jobs
const sendEmail = async (data) => {
  return addJob(
    QUEUE_NAMES.EMAIL_PROCESSING,
    JOB_TYPES.SEND_EMAIL,
    data
  );
};

const syncEmails = async (userId) => {
  return addJob(
    QUEUE_NAMES.EMAIL_PROCESSING,
    JOB_TYPES.SYNC_EMAILS,
    { userId },
    { 
      repeat: {
        cron: '0 */30 * * * *' // Every 30 minutes
      }
    }
  );
};

// Calendar processing jobs
const syncCalendar = async (userId) => {
  return addJob(
    QUEUE_NAMES.CALENDAR_SYNC,
    JOB_TYPES.SYNC_CALENDAR,
    { userId },
    { 
      repeat: {
        cron: '0 */15 * * * *' // Every 15 minutes
      }
    }
  );
};

const createCalendarEvent = async (data) => {
  return addJob(
    QUEUE_NAMES.CALENDAR_SYNC,
    JOB_TYPES.CREATE_EVENT,
    data
  );
};

// Task processing jobs
const createTask = async (data) => {
  return addJob(
    QUEUE_NAMES.TASK_PROCESSING,
    JOB_TYPES.CREATE_TASK,
    data
  );
};

const syncTasks = async (userId) => {
  return addJob(
    QUEUE_NAMES.TASK_PROCESSING,
    JOB_TYPES.SYNC_TASKS,
    { userId },
    { 
      repeat: {
        cron: '0 0 */1 * * *' // Every hour
      }
    }
  );
};

// AI processing jobs
const processAIRequest = async (data) => {
  return addJob(
    QUEUE_NAMES.AI_PROCESSING,
    JOB_TYPES.PROCESS_AI_REQUEST,
    data,
    { priority: 1 }
  );
};

const batchAIProcessing = async (requests) => {
  return addJob(
    QUEUE_NAMES.AI_PROCESSING,
    JOB_TYPES.BATCH_AI_PROCESSING,
    { requests },
    { priority: 3 }
  );
};

// Notification jobs
const sendPushNotification = async (data) => {
  return addJob(
    QUEUE_NAMES.NOTIFICATION,
    JOB_TYPES.SEND_PUSH_NOTIFICATION,
    data
  );
};

// Get queue status
const getQueueStatus = async (queueName) => {
  const queue = queues[queueName];
  if (!queue) {
    return null;
  }
  
  try {
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getPausedCount()
    ]);
    
    return {
      name: queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused
    };
  } catch (error) {
    logger.error(`Error getting queue status for ${queueName}:`, error);
    return null;
  }
};

// Get all queues status
const getAllQueuesStatus = async () => {
  const statuses = {};
  for (const queueName of Object.keys(queues)) {
    statuses[queueName] = await getQueueStatus(queueName);
  }
  return statuses;
};

// Clean queue
const cleanQueue = async (queueName, grace = 0, limit = 0, status = 'completed') => {
  const queue = queues[queueName];
  if (!queue) {
    return;
  }
  
  try {
    await queue.clean(grace, limit, status);
    logger.info(`Cleaned ${status} jobs from queue ${queueName}`);
  } catch (error) {
    logger.error(`Error cleaning queue ${queueName}:`, error);
  }
};

// Pause queue
const pauseQueue = async (queueName) => {
  const queue = queues[queueName];
  if (queue) {
    await queue.pause();
    logger.info(`Paused queue: ${queueName}`);
  }
};

// Resume queue
const resumeQueue = async (queueName) => {
  const queue = queues[queueName];
  if (queue) {
    await queue.resume();
    logger.info(`Resumed queue: ${queueName}`);
  }
};

// Close all queues
const closeAllQueues = async () => {
  for (const [name, queue] of Object.entries(queues)) {
    try {
      await queue.close();
      logger.info(`Closed queue: ${name}`);
    } catch (error) {
      logger.error(`Error closing queue ${name}:`, error);
    }
  }
};

// Initialize queues on module load
initializeQueues();

module.exports = {
  queues,
  addJob,
  processVoiceCommand,
  transcribeAudio,
  synthesizeSpeech,
  sendEmail,
  syncEmails,
  syncCalendar,
  createCalendarEvent,
  createTask,
  syncTasks,
  processAIRequest,
  batchAIProcessing,
  sendPushNotification,
  getQueueStatus,
  getAllQueuesStatus,
  cleanQueue,
  pauseQueue,
  resumeQueue,
  closeAllQueues,
  QUEUE_NAMES,
  JOB_TYPES
};