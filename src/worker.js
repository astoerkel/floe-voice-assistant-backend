// Load environment variables
require('dotenv').config();

const logger = require('./utils/logger');
const subscriptionExpiryJob = require('./jobs/subscriptionExpiry');
const { connectDatabase } = require('./config/database');
const { connectRedis } = require('./config/redis');

// Worker process for background jobs
class BackgroundWorker {
  constructor() {
    this.jobs = [];
    this.isShuttingDown = false;
  }

  async start() {
    try {
      logger.info('=== BACKGROUND WORKER STARTUP ===');
      logger.info('NODE_ENV:', process.env.NODE_ENV);
      
      // Initialize connections
      await Promise.all([
        connectDatabase().catch(err => {
          logger.error('Database connection failed:', err);
          throw err;
        }),
        connectRedis().catch(err => {
          logger.error('Redis connection failed:', err);
          throw err;
        })
      ]);

      logger.info('Database and Redis connections established');

      // Start background jobs
      await this.startJobs();

      logger.info('Background worker started successfully');
      
      // Set up graceful shutdown handlers
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start background worker:', error);
      process.exit(1);
    }
  }

  async startJobs() {
    try {
      // Start subscription expiry job
      subscriptionExpiryJob.start();
      this.jobs.push({
        name: 'subscriptionExpiry',
        instance: subscriptionExpiryJob
      });

      logger.info('All background jobs started');
    } catch (error) {
      logger.error('Failed to start background jobs:', error);
      throw error;
    }
  }

  async stopJobs() {
    logger.info('Stopping background jobs...');
    
    for (const job of this.jobs) {
      try {
        logger.info(`Stopping job: ${job.name}`);
        if (job.instance.stop) {
          job.instance.stop();
        }
        logger.info(`Job stopped: ${job.name}`);
      } catch (error) {
        logger.error(`Failed to stop job ${job.name}:`, error);
      }
    }

    logger.info('All background jobs stopped');
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        logger.info('Shutdown already in progress...');
        return;
      }

      this.isShuttingDown = true;
      logger.info(`${signal} received, shutting down background worker gracefully...`);

      try {
        // Stop all background jobs
        await this.stopJobs();

        logger.info('Background worker shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('UNHANDLED_REJECTION');
    });
  }

  // Get status of all jobs
  getJobsStatus() {
    return this.jobs.map(job => ({
      name: job.name,
      status: job.instance.getStatus ? job.instance.getStatus() : 'unknown'
    }));
  }
}

// Start the worker if this file is run directly
if (require.main === module) {
  const worker = new BackgroundWorker();
  worker.start().catch(error => {
    logger.error('Worker startup failed:', error);
    process.exit(1);
  });
}

module.exports = BackgroundWorker;