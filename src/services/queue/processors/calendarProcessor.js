const logger = require('../../../utils/logger');
const { JOB_TYPES } = require('../config');
const calendarService = require('../../integrations/google/calendar');
const { prisma } = require('../../../config/database');

const processJob = async (job) => {
  const { name, data } = job;
  logger.info(`Processing calendar job: ${name}`, { jobId: job.id });
  
  try {
    switch (name) {
      case JOB_TYPES.SYNC_CALENDAR:
        return await syncCalendar(data);
      case JOB_TYPES.CREATE_EVENT:
        return await createEvent(data);
      case JOB_TYPES.UPDATE_EVENT:
        return await updateEvent(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  } catch (error) {
    logger.error(`Error processing calendar job ${job.id}:`, error);
    throw error;
  }
};

const syncCalendar = async (data) => {
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
        syncType: 'calendar'
      }
    });
    
    // Calculate time range
    const timeMin = lastSync 
      ? lastSync.lastSyncAt.toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago
    const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ahead
    
    // Sync calendar events
    const events = await calendarService.listEvents(
      integration.accessToken,
      {
        timeMin,
        timeMax,
        maxResults: 100,
        singleEvents: true,
        orderBy: 'startTime'
      }
    );
    
    // Update sync status
    await prisma.syncStatus.upsert({
      where: {
        userId_syncType: {
          userId,
          syncType: 'calendar'
        }
      },
      update: {
        lastSyncAt: new Date(),
        itemsSynced: events.length
      },
      create: {
        userId,
        syncType: 'calendar',
        lastSyncAt: new Date(),
        itemsSynced: events.length
      }
    });
    
    return { synced: events.length };
  } catch (error) {
    logger.error('Error syncing calendar:', error);
    throw error;
  }
};

const createEvent = async (data) => {
  const { userId, event } = data;
  
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
    
    // Create calendar event
    const result = await calendarService.createEvent(
      integration.accessToken,
      event
    );
    
    // Log calendar activity
    await prisma.calendarActivity.create({
      data: {
        userId,
        action: 'created',
        eventId: result.id,
        eventTitle: event.summary,
        eventStart: new Date(event.start.dateTime || event.start.date),
        eventEnd: new Date(event.end.dateTime || event.end.date)
      }
    });
    
    return result;
  } catch (error) {
    logger.error('Error creating calendar event:', error);
    throw error;
  }
};

const updateEvent = async (data) => {
  const { userId, eventId, updates } = data;
  
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
    
    // Update calendar event
    const result = await calendarService.updateEvent(
      integration.accessToken,
      eventId,
      updates
    );
    
    // Log calendar activity
    await prisma.calendarActivity.create({
      data: {
        userId,
        action: 'updated',
        eventId: result.id,
        eventTitle: result.summary,
        eventStart: new Date(result.start.dateTime || result.start.date),
        eventEnd: new Date(result.end.dateTime || result.end.date)
      }
    });
    
    return result;
  } catch (error) {
    logger.error('Error updating calendar event:', error);
    throw error;
  }
};

module.exports = processJob;