const cron = require('node-cron');
const AppleIAPService = require('../services/subscriptions/appleIAP');
const logger = require('../utils/logger');

class SubscriptionExpiryJob {
  constructor() {
    this.appleIAP = new AppleIAPService();
    this.isRunning = false;
  }

  // Start the cron job
  start() {
    // Run daily at 2 AM
    this.cronJob = cron.schedule('0 2 * * *', async () => {
      await this.processExpiredSubscriptions();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.cronJob.start();
    logger.info('Subscription expiry job started - runs daily at 2 AM UTC');
  }

  // Stop the cron job
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Subscription expiry job stopped');
    }
  }

  // Process expired subscriptions
  async processExpiredSubscriptions() {
    if (this.isRunning) {
      logger.info('Subscription expiry job already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting subscription expiry processing...');

      const result = await this.appleIAP.processExpiredSubscriptions();

      const duration = Date.now() - startTime;
      
      logger.info('Subscription expiry processing completed', {
        processedCount: result.processedCount,
        duration: `${duration}ms`
      });

      // Send notification to monitoring service if needed
      if (result.processedCount > 0) {
        await this.notifySubscriptionExpiries(result.processedCount);
      }

    } catch (error) {
      logger.error('Subscription expiry processing failed:', error);
      
      // Send error notification to monitoring service
      await this.notifyProcessingError(error);
    } finally {
      this.isRunning = false;
    }
  }

  // Run immediately (for testing or manual trigger)
  async runImmediately() {
    logger.info('Running subscription expiry job immediately...');
    await this.processExpiredSubscriptions();
  }

  // Notify monitoring service about expiries
  async notifySubscriptionExpiries(count) {
    try {
      // Here you could integrate with monitoring services like:
      // - Slack notifications
      // - Email alerts
      // - Webhook notifications
      // - Analytics tracking
      
      logger.info(`Subscription expiry notification: ${count} subscriptions expired`);
      
      // Example: Send to webhook if configured
      if (process.env.SUBSCRIPTION_WEBHOOK_URL) {
        const axios = require('axios');
        await axios.post(process.env.SUBSCRIPTION_WEBHOOK_URL, {
          type: 'subscription_expiry',
          count,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Failed to send subscription expiry notification:', error);
    }
  }

  // Notify monitoring service about processing errors
  async notifyProcessingError(error) {
    try {
      logger.error('Subscription expiry processing error notification', {
        error: error.message,
        stack: error.stack
      });

      // Example: Send error to monitoring service
      if (process.env.ERROR_WEBHOOK_URL) {
        const axios = require('axios');
        await axios.post(process.env.ERROR_WEBHOOK_URL, {
          type: 'subscription_job_error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    } catch (notificationError) {
      logger.error('Failed to send error notification:', notificationError);
    }
  }

  // Get job status
  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.cronJob ? this.cronJob.scheduled : false,
      nextRun: this.cronJob ? this.cronJob.nextDate() : null
    };
  }
}

// Export singleton instance
const subscriptionExpiryJob = new SubscriptionExpiryJob();

module.exports = subscriptionExpiryJob;