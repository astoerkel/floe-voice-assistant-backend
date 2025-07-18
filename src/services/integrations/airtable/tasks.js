const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');

// Check if Airtable API key is available before requiring the module
const AIRTABLE_ENABLED = !!process.env.AIRTABLE_API_KEY;
const Airtable = AIRTABLE_ENABLED ? require('airtable') : null;

class AirtableTasksIntegration {
  constructor() {
    this.serviceName = 'airtable_tasks';
    this.isEnabled = AIRTABLE_ENABLED;
    
    if (this.isEnabled) {
      this.airtable = new Airtable({
        apiKey: process.env.AIRTABLE_API_KEY
      });
    } else {
      logger.warn('Airtable API key not provided - Airtable integration will be disabled');
      this.airtable = null;
    }
  }

  async setupIntegration(userId, config) {
    if (!this.isEnabled) {
      throw new Error('Airtable integration is disabled - API key not configured');
    }
    
    try {
      const { baseId, tableId, apiKey } = config;
      
      // Test the connection
      const testConnection = await this.testConnection(baseId, tableId, apiKey);
      if (!testConnection.success) {
        throw new Error(`Connection test failed: ${testConnection.error}`);
      }

      // Store integration in database
      await prisma.integration.upsert({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        },
        update: {
          accessToken: apiKey,
          isActive: true,
          metadata: {
            baseId,
            tableId,
            tableName: testConnection.tableName
          }
        },
        create: {
          userId,
          type: this.serviceName,
          accessToken: apiKey,
          isActive: true,
          metadata: {
            baseId,
            tableId,
            tableName: testConnection.tableName
          }
        }
      });

      logger.info(`Airtable tasks integration setup for user ${userId}`);
      return { success: true, message: 'Airtable tasks integration configured successfully' };
    } catch (error) {
      logger.error('Airtable tasks integration setup failed:', error);
      return { success: false, error: error.message };
    }
  }

  async testConnection(baseId, tableId, apiKey) {
    try {
      const airtable = new Airtable({ apiKey });
      const base = airtable.base(baseId);
      
      // Try to get table info
      const records = await base(tableId).select({
        maxRecords: 1,
        view: 'Grid view'
      }).firstPage();

      return {
        success: true,
        tableName: tableId,
        recordCount: records.length
      };
    } catch (error) {
      logger.error('Airtable connection test failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getIntegrationConfig(userId) {
    try {
      const integration = await prisma.integration.findUnique({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        }
      });

      if (!integration || !integration.isActive) {
        throw new Error('Airtable integration not found or inactive');
      }

      return {
        apiKey: integration.accessToken,
        baseId: integration.metadata.baseId,
        tableId: integration.metadata.tableId,
        tableName: integration.metadata.tableName
      };
    } catch (error) {
      logger.error('Failed to get integration config:', error);
      throw error;
    }
  }

  async getTasks(userId, options = {}) {
    try {
      const config = await this.getIntegrationConfig(userId);
      const airtable = new Airtable({ apiKey: config.apiKey });
      const base = airtable.base(config.baseId);

      const {
        limit = 10,
        filterByFormula = '',
        sort = [{ field: 'Created', direction: 'desc' }],
        view = 'Grid view'
      } = options;

      const records = await base(config.tableId).select({
        maxRecords: limit,
        view: view,
        filterByFormula: filterByFormula,
        sort: sort
      }).all();

      const tasks = records.map(record => this.parseTaskRecord(record));
      
      logger.info(`Retrieved ${tasks.length} tasks from Airtable for user ${userId}`);
      return tasks;
    } catch (error) {
      logger.error('Failed to get tasks from Airtable:', error);
      throw error;
    }
  }

  async getTask(userId, taskId) {
    try {
      const config = await this.getIntegrationConfig(userId);
      const airtable = new Airtable({ apiKey: config.apiKey });
      const base = airtable.base(config.baseId);

      const record = await base(config.tableId).find(taskId);
      const task = this.parseTaskRecord(record);
      
      logger.info(`Retrieved task ${taskId} from Airtable for user ${userId}`);
      return task;
    } catch (error) {
      logger.error('Failed to get task from Airtable:', error);
      throw error;
    }
  }

  async createTask(userId, taskData) {
    try {
      const config = await this.getIntegrationConfig(userId);
      const airtable = new Airtable({ apiKey: config.apiKey });
      const base = airtable.base(config.baseId);

      const recordData = this.createTaskRecord(taskData);
      
      const records = await base(config.tableId).create([{
        fields: recordData
      }]);

      const task = this.parseTaskRecord(records[0]);
      
      logger.info(`Created task ${task.id} in Airtable for user ${userId}`);
      return task;
    } catch (error) {
      logger.error('Failed to create task in Airtable:', error);
      throw error;
    }
  }

  async updateTask(userId, taskId, updates) {
    try {
      const config = await this.getIntegrationConfig(userId);
      const airtable = new Airtable({ apiKey: config.apiKey });
      const base = airtable.base(config.baseId);

      const recordData = this.createTaskRecord(updates);
      
      const records = await base(config.tableId).update([{
        id: taskId,
        fields: recordData
      }]);

      const task = this.parseTaskRecord(records[0]);
      
      logger.info(`Updated task ${taskId} in Airtable for user ${userId}`);
      return task;
    } catch (error) {
      logger.error('Failed to update task in Airtable:', error);
      throw error;
    }
  }

  async deleteTask(userId, taskId) {
    try {
      const config = await this.getIntegrationConfig(userId);
      const airtable = new Airtable({ apiKey: config.apiKey });
      const base = airtable.base(config.baseId);

      await base(config.tableId).destroy([taskId]);
      
      logger.info(`Deleted task ${taskId} from Airtable for user ${userId}`);
      return { success: true, taskId };
    } catch (error) {
      logger.error('Failed to delete task from Airtable:', error);
      throw error;
    }
  }

  async completeTask(userId, taskId) {
    try {
      return await this.updateTask(userId, taskId, {
        status: 'Completed',
        completedAt: new Date()
      });
    } catch (error) {
      logger.error('Failed to complete task in Airtable:', error);
      throw error;
    }
  }

  async getTasksByStatus(userId, status, limit = 10) {
    try {
      const filterByFormula = `{Status} = '${status}'`;
      return await this.getTasks(userId, { filterByFormula, limit });
    } catch (error) {
      logger.error('Failed to get tasks by status from Airtable:', error);
      throw error;
    }
  }

  async getTasksByPriority(userId, priority, limit = 10) {
    try {
      const filterByFormula = `{Priority} = '${priority}'`;
      return await this.getTasks(userId, { filterByFormula, limit });
    } catch (error) {
      logger.error('Failed to get tasks by priority from Airtable:', error);
      throw error;
    }
  }

  async getOverdueTasks(userId, limit = 10) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const filterByFormula = `AND({Due Date} < '${today}', {Status} != 'Completed')`;
      return await this.getTasks(userId, { filterByFormula, limit });
    } catch (error) {
      logger.error('Failed to get overdue tasks from Airtable:', error);
      throw error;
    }
  }

  async searchTasks(userId, query, limit = 10) {
    try {
      const filterByFormula = `OR(SEARCH('${query}', {Title}), SEARCH('${query}', {Description}))`;
      return await this.getTasks(userId, { filterByFormula, limit });
    } catch (error) {
      logger.error('Failed to search tasks in Airtable:', error);
      throw error;
    }
  }

  parseTaskRecord(record) {
    const fields = record.fields;
    
    return {
      id: record.id,
      title: fields.Title || fields.Name || 'Untitled Task',
      description: fields.Description || '',
      status: fields.Status || 'Not Started',
      priority: fields.Priority || 'Medium',
      dueDate: fields['Due Date'] ? new Date(fields['Due Date']) : null,
      completedAt: fields['Completed Date'] ? new Date(fields['Completed Date']) : null,
      createdAt: fields.Created ? new Date(fields.Created) : new Date(),
      updatedAt: fields['Last Modified'] ? new Date(fields['Last Modified']) : new Date(),
      assignee: fields.Assignee || null,
      tags: fields.Tags || [],
      progress: fields.Progress || 0,
      estimatedHours: fields['Estimated Hours'] || null,
      actualHours: fields['Actual Hours'] || null,
      project: fields.Project || null,
      category: fields.Category || null
    };
  }

  createTaskRecord(taskData) {
    const record = {};
    
    if (taskData.title) record.Title = taskData.title;
    if (taskData.description) record.Description = taskData.description;
    if (taskData.status) record.Status = taskData.status;
    if (taskData.priority) record.Priority = taskData.priority;
    if (taskData.dueDate) record['Due Date'] = taskData.dueDate.toISOString().split('T')[0];
    if (taskData.completedAt) record['Completed Date'] = taskData.completedAt.toISOString().split('T')[0];
    if (taskData.assignee) record.Assignee = taskData.assignee;
    if (taskData.tags) record.Tags = taskData.tags;
    if (taskData.progress !== undefined) record.Progress = taskData.progress;
    if (taskData.estimatedHours) record['Estimated Hours'] = taskData.estimatedHours;
    if (taskData.actualHours) record['Actual Hours'] = taskData.actualHours;
    if (taskData.project) record.Project = taskData.project;
    if (taskData.category) record.Category = taskData.category;
    
    return record;
  }

  async getTaskStatistics(userId) {
    try {
      const allTasks = await this.getTasks(userId, { limit: 1000 });
      
      const stats = {
        total: allTasks.length,
        completed: allTasks.filter(t => t.status === 'Completed').length,
        pending: allTasks.filter(t => t.status === 'Not Started' || t.status === 'In Progress').length,
        overdue: allTasks.filter(t => t.dueDate && t.dueDate < new Date() && t.status !== 'Completed').length,
        byPriority: {
          high: allTasks.filter(t => t.priority === 'High').length,
          medium: allTasks.filter(t => t.priority === 'Medium').length,
          low: allTasks.filter(t => t.priority === 'Low').length
        },
        byStatus: {}
      };

      // Count by status
      allTasks.forEach(task => {
        stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get task statistics:', error);
      throw error;
    }
  }

  async isIntegrationActive(userId) {
    try {
      const integration = await prisma.integration.findUnique({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        }
      });

      return integration && integration.isActive;
    } catch (error) {
      logger.error('Failed to check integration status:', error);
      return false;
    }
  }

  async deactivateIntegration(userId) {
    try {
      await prisma.integration.update({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        },
        data: {
          isActive: false
        }
      });

      logger.info(`Deactivated Airtable tasks integration for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to deactivate integration:', error);
      return { success: false, error: error.message };
    }
  }

  getStats() {
    return {
      serviceName: this.serviceName,
      isConfigured: !!process.env.AIRTABLE_API_KEY,
      supportedOperations: [
        'getTasks',
        'getTask',
        'createTask',
        'updateTask',
        'deleteTask',
        'completeTask',
        'getTasksByStatus',
        'getTasksByPriority',
        'getOverdueTasks',
        'searchTasks'
      ]
    };
  }
}

// Only export instance if API key is available
if (AIRTABLE_ENABLED) {
  module.exports = new AirtableTasksIntegration();
} else {
  // Export a stub that logs warnings for all methods
  module.exports = {
    serviceName: 'airtable_tasks',
    isEnabled: false,
    setupIntegration: () => Promise.reject(new Error('Airtable integration is disabled - API key not configured')),
    testConnection: () => Promise.reject(new Error('Airtable integration is disabled - API key not configured')),
    createTask: () => Promise.reject(new Error('Airtable integration is disabled - API key not configured')),
    updateTask: () => Promise.reject(new Error('Airtable integration is disabled - API key not configured')),
    deleteTask: () => Promise.reject(new Error('Airtable integration is disabled - API key not configured')),
    listTasks: () => Promise.reject(new Error('Airtable integration is disabled - API key not configured')),
    getTask: () => Promise.reject(new Error('Airtable integration is disabled - API key not configured')),
    markTaskComplete: () => Promise.reject(new Error('Airtable integration is disabled - API key not configured')),
    searchTasks: () => Promise.reject(new Error('Airtable integration is disabled - API key not configured')),
    getSupportedActions: () => ({
      create: false,
      read: false,
      update: false,
      delete: false,
      actions: []
    })
  };
}