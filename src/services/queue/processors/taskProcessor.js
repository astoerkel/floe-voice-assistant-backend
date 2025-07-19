const logger = require('../../../utils/logger');
const { JOB_TYPES } = require('../config');
const airtableService = require('../../integrations/airtable/tasks');
const { prisma } = require('../../../config/database');

const processJob = async (job) => {
  const { name, data } = job;
  logger.info(`Processing task job: ${name}`, { jobId: job.id });
  
  try {
    switch (name) {
      case JOB_TYPES.CREATE_TASK:
        return await createTask(data);
      case JOB_TYPES.UPDATE_TASK:
        return await updateTask(data);
      case JOB_TYPES.SYNC_TASKS:
        return await syncTasks(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  } catch (error) {
    logger.error(`Error processing task job ${job.id}:`, error);
    throw error;
  }
};

const createTask = async (data) => {
  const { userId, task } = data;
  
  try {
    // Get user's Airtable integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        provider: 'airtable',
        active: true
      }
    });
    
    if (!integration) {
      throw new Error('Airtable integration not found');
    }
    
    // Create task in Airtable
    const result = await airtableService.createTask({
      ...task,
      userId
    });
    
    // Save task reference
    await prisma.task.create({
      data: {
        userId,
        externalId: result.id,
        title: task.title,
        description: task.description,
        status: task.status || 'todo',
        priority: task.priority || 'medium',
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        provider: 'airtable'
      }
    });
    
    return result;
  } catch (error) {
    logger.error('Error creating task:', error);
    throw error;
  }
};

const updateTask = async (data) => {
  const { userId, taskId, updates } = data;
  
  try {
    // Get task from database
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        userId
      }
    });
    
    if (!task) {
      throw new Error('Task not found');
    }
    
    // Get user's Airtable integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        provider: 'airtable',
        active: true
      }
    });
    
    if (!integration) {
      throw new Error('Airtable integration not found');
    }
    
    // Update task in Airtable
    const result = await airtableService.updateTask(
      task.externalId,
      updates
    );
    
    // Update local task
    await prisma.task.update({
      where: { id: taskId },
      data: {
        title: updates.title || task.title,
        description: updates.description || task.description,
        status: updates.status || task.status,
        priority: updates.priority || task.priority,
        dueDate: updates.dueDate ? new Date(updates.dueDate) : task.dueDate,
        completedAt: updates.status === 'completed' ? new Date() : null
      }
    });
    
    return result;
  } catch (error) {
    logger.error('Error updating task:', error);
    throw error;
  }
};

const syncTasks = async (data) => {
  const { userId } = data;
  
  try {
    // Get user's Airtable integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        provider: 'airtable',
        active: true
      }
    });
    
    if (!integration) {
      logger.warn(`No Airtable integration found for user ${userId}`);
      return { synced: 0 };
    }
    
    // Get tasks from Airtable
    const tasks = await airtableService.listTasks({
      filterByUser: userId,
      maxRecords: 100
    });
    
    // Sync tasks to local database
    let syncedCount = 0;
    for (const airtableTask of tasks) {
      await prisma.task.upsert({
        where: {
          externalId_userId: {
            externalId: airtableTask.id,
            userId
          }
        },
        update: {
          title: airtableTask.fields.Title,
          description: airtableTask.fields.Description,
          status: airtableTask.fields.Status || 'todo',
          priority: airtableTask.fields.Priority || 'medium',
          dueDate: airtableTask.fields.DueDate ? new Date(airtableTask.fields.DueDate) : null,
          completedAt: airtableTask.fields.CompletedAt ? new Date(airtableTask.fields.CompletedAt) : null
        },
        create: {
          userId,
          externalId: airtableTask.id,
          title: airtableTask.fields.Title,
          description: airtableTask.fields.Description,
          status: airtableTask.fields.Status || 'todo',
          priority: airtableTask.fields.Priority || 'medium',
          dueDate: airtableTask.fields.DueDate ? new Date(airtableTask.fields.DueDate) : null,
          provider: 'airtable'
        }
      });
      syncedCount++;
    }
    
    // Update sync status
    await prisma.syncStatus.upsert({
      where: {
        userId_syncType: {
          userId,
          syncType: 'tasks'
        }
      },
      update: {
        lastSyncAt: new Date(),
        itemsSynced: syncedCount
      },
      create: {
        userId,
        syncType: 'tasks',
        lastSyncAt: new Date(),
        itemsSynced: syncedCount
      }
    });
    
    return { synced: syncedCount };
  } catch (error) {
    logger.error('Error syncing tasks:', error);
    throw error;
  }
};

module.exports = processJob;