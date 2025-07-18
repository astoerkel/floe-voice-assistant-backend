const logger = require('../../../utils/logger');
const { JOB_TYPES } = require('../config');
const { prisma } = require('../../../config/database');

// Mock notification service - would be replaced with actual implementation
const notificationService = {
  sendPush: async (deviceToken, payload) => {
    logger.info('Sending push notification:', { deviceToken, payload });
    // In production, this would use Apple Push Notification Service (APNS)
    return { success: true, messageId: `mock-${Date.now()}` };
  },
  
  sendEmail: async (to, subject, body) => {
    logger.info('Sending email notification:', { to, subject });
    // In production, this would use an email service
    return { success: true, messageId: `email-${Date.now()}` };
  }
};

const processJob = async (job) => {
  const { name, data } = job;
  logger.info(`Processing notification job: ${name}`, { jobId: job.id });
  
  try {
    switch (name) {
      case JOB_TYPES.SEND_PUSH_NOTIFICATION:
        return await sendPushNotification(data);
      case JOB_TYPES.SEND_EMAIL_NOTIFICATION:
        return await sendEmailNotification(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  } catch (error) {
    logger.error(`Error processing notification job ${job.id}:`, error);
    throw error;
  }
};

const sendPushNotification = async (data) => {
  const { userId, title, body, category, threadId, data: customData } = data;
  
  try {
    // Get user device tokens
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        devices: {
          where: { 
            active: true,
            pushToken: { not: null }
          }
        }
      }
    });
    
    if (!user || user.devices.length === 0) {
      logger.warn(`No active devices found for user ${userId}`);
      return { sent: 0 };
    }
    
    // Send to all user devices
    const results = await Promise.all(
      user.devices.map(async (device) => {
        try {
          const result = await notificationService.sendPush(
            device.pushToken,
            {
              aps: {
                alert: {
                  title,
                  body
                },
                category,
                'thread-id': threadId,
                sound: 'default'
              },
              customData
            }
          );
          
          // Log notification
          await prisma.notification.create({
            data: {
              userId,
              deviceId: device.id,
              type: 'push',
              title,
              body,
              category,
              status: 'sent',
              sentAt: new Date()
            }
          });
          
          return result;
        } catch (error) {
          logger.error(`Failed to send push to device ${device.id}:`, error);
          
          // Log failed notification
          await prisma.notification.create({
            data: {
              userId,
              deviceId: device.id,
              type: 'push',
              title,
              body,
              category,
              status: 'failed',
              error: error.message
            }
          });
          
          return null;
        }
      })
    );
    
    const successCount = results.filter(r => r && r.success).length;
    return { sent: successCount, total: user.devices.length };
  } catch (error) {
    logger.error('Error sending push notification:', error);
    throw error;
  }
};

const sendEmailNotification = async (data) => {
  const { userId, subject, body, template } = data;
  
  try {
    // Get user email
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user || !user.email) {
      logger.warn(`No email found for user ${userId}`);
      return { sent: false };
    }
    
    // Check notification preferences
    const preferences = await prisma.notificationPreference.findUnique({
      where: { userId }
    });
    
    if (preferences && !preferences.emailEnabled) {
      logger.info(`Email notifications disabled for user ${userId}`);
      return { sent: false, reason: 'disabled' };
    }
    
    // Send email
    const result = await notificationService.sendEmail(
      user.email,
      subject,
      body
    );
    
    // Log notification
    await prisma.notification.create({
      data: {
        userId,
        type: 'email',
        title: subject,
        body,
        status: result.success ? 'sent' : 'failed',
        sentAt: result.success ? new Date() : null
      }
    });
    
    return { sent: result.success };
  } catch (error) {
    logger.error('Error sending email notification:', error);
    throw error;
  }
};

module.exports = processJob;