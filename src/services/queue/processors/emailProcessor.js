const logger = require('../../../utils/logger');
const { JOB_TYPES } = require('../config');
const gmailService = require('../../integrations/google/gmail');
const { prisma } = require('../../../config/database');

const processJob = async (job) => {
  const { name, data } = job;
  logger.info(`Processing email job: ${name}`, { jobId: job.id });
  
  try {
    switch (name) {
      case JOB_TYPES.SEND_EMAIL:
        return await sendEmail(data);
      case JOB_TYPES.SYNC_EMAILS:
        return await syncEmails(data);
      case JOB_TYPES.PROCESS_EMAIL_COMMAND:
        return await processEmailCommand(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  } catch (error) {
    logger.error(`Error processing email job ${job.id}:`, error);
    throw error;
  }
};

const sendEmail = async (data) => {
  const { userId, to, subject, body, cc, bcc, attachments } = data;
  
  try {
    // Get user's Google integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        provider: 'google',
        active: true
      }
    });
    
    if (!integration) {
      throw new Error('Google integration not found');
    }
    
    // Send email
    const result = await gmailService.sendEmail(
      integration.accessToken,
      { to, subject, body, cc, bcc, attachments }
    );
    
    // Log email activity
    await prisma.emailActivity.create({
      data: {
        userId,
        action: 'sent',
        emailId: result.id,
        subject,
        to: Array.isArray(to) ? to.join(', ') : to,
        sentAt: new Date()
      }
    });
    
    return result;
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
};

const syncEmails = async (data) => {
  const { userId } = data;
  
  try {
    // Get user's Google integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        provider: 'google',
        active: true
      }
    });
    
    if (!integration) {
      logger.warn(`No Google integration found for user ${userId}`);
      return { synced: 0 };
    }
    
    // Get last sync timestamp
    const lastSync = await prisma.syncStatus.findFirst({
      where: {
        userId,
        syncType: 'email'
      }
    });
    
    // Sync emails since last sync
    const emails = await gmailService.listEmails(
      integration.accessToken,
      {
        maxResults: 50,
        q: lastSync ? `after:${Math.floor(lastSync.lastSyncAt.getTime() / 1000)}` : 'is:unread'
      }
    );
    
    // Update sync status
    await prisma.syncStatus.upsert({
      where: {
        userId_syncType: {
          userId,
          syncType: 'email'
        }
      },
      update: {
        lastSyncAt: new Date(),
        itemsSynced: emails.length
      },
      create: {
        userId,
        syncType: 'email',
        lastSyncAt: new Date(),
        itemsSynced: emails.length
      }
    });
    
    return { synced: emails.length };
  } catch (error) {
    logger.error('Error syncing emails:', error);
    throw error;
  }
};

const processEmailCommand = async (data) => {
  const { userId, command, parameters } = data;
  
  try {
    // Get user's Google integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        provider: 'google',
        active: true
      }
    });
    
    if (!integration) {
      throw new Error('Google integration not found');
    }
    
    let result;
    
    switch (command) {
      case 'search':
        result = await gmailService.searchEmails(
          integration.accessToken,
          parameters.query,
          parameters.options
        );
        break;
      case 'read':
        result = await gmailService.getEmail(
          integration.accessToken,
          parameters.emailId
        );
        break;
      case 'reply':
        result = await gmailService.replyToEmail(
          integration.accessToken,
          parameters.emailId,
          parameters.body
        );
        break;
      case 'archive':
        result = await gmailService.archiveEmail(
          integration.accessToken,
          parameters.emailId
        );
        break;
      default:
        throw new Error(`Unknown email command: ${command}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Error processing email command:', error);
    throw error;
  }
};

module.exports = processJob;