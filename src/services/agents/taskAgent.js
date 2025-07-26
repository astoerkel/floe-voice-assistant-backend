const { Tool } = require('langchain/tools');
const { prisma } = require('../../config/database');
const logger = require('../../utils/logger');

class TaskAgent {
  constructor() {
    this.agentName = 'task';
    this.tools = this.createTools();
  }

  createTools() {
    return [
      new Tool({
        name: 'create_task',
        description: 'Create a new task or reminder',
        func: async (input) => {
          try {
            const taskData = JSON.parse(input);
            return await this.createTask(taskData);
          } catch (error) {
            logger.error('Create task tool error:', error);
            return `Error creating task: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'get_tasks',
        description: 'Get tasks with optional filters',
        func: async (input) => {
          try {
            const { userId, filter, limit } = JSON.parse(input);
            return await this.getTasks(userId, filter, limit);
          } catch (error) {
            logger.error('Get tasks tool error:', error);
            return `Error getting tasks: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'update_task',
        description: 'Update an existing task',
        func: async (input) => {
          try {
            const { taskId, updates } = JSON.parse(input);
            return await this.updateTask(taskId, updates);
          } catch (error) {
            logger.error('Update task tool error:', error);
            return `Error updating task: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'complete_task',
        description: 'Mark a task as completed',
        func: async (input) => {
          try {
            const { taskId } = JSON.parse(input);
            return await this.completeTask(taskId);
          } catch (error) {
            logger.error('Complete task tool error:', error);
            return `Error completing task: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'delete_task',
        description: 'Delete a task',
        func: async (input) => {
          try {
            const { taskId } = JSON.parse(input);
            return await this.deleteTask(taskId);
          } catch (error) {
            logger.error('Delete task tool error:', error);
            return `Error deleting task: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'set_reminder',
        description: 'Set a reminder for a task',
        func: async (input) => {
          try {
            const { taskId, reminderTime } = JSON.parse(input);
            return await this.setReminder(taskId, reminderTime);
          } catch (error) {
            logger.error('Set reminder tool error:', error);
            return `Error setting reminder: ${error.message}`;
          }
        }
      })
    ];
  }

  async processCommand(userId, input, context = {}) {
    try {
      logger.info(`Task agent processing command for user ${userId}:`, {
        input: input.substring(0, 100)
      });

      // Parse the intent and extract relevant information
      const intent = await this.parseTaskIntent(input);
      
      let response;
      switch (intent.type) {
        case 'create_task':
          response = await this.handleCreateTask(userId, intent, context);
          break;
        case 'get_tasks':
          response = await this.handleGetTasks(userId, intent, context);
          break;
        case 'complete_task':
          response = await this.handleCompleteTask(userId, intent, context);
          break;
        case 'update_task':
          response = await this.handleUpdateTask(userId, intent, context);
          break;
        case 'delete_task':
          response = await this.handleDeleteTask(userId, intent, context);
          break;
        case 'set_reminder':
          response = await this.handleSetReminder(userId, intent, context);
          break;
        default:
          response = await this.handleGeneralTaskQuery(userId, input, context);
      }

      logger.info(`Task agent completed processing for user ${userId}`);
      return response;
    } catch (error) {
      logger.error('Task agent processing failed:', error);
      return {
        text: "I'm having trouble with your task request. Could you please try again?",
        actions: [],
        suggestions: ['Create a task', 'Show my tasks', 'Mark task complete']
      };
    }
  }

  async parseTaskIntent(input) {
    const lowerInput = input.toLowerCase();
    
    // Create task patterns
    if (lowerInput.includes('create') || lowerInput.includes('add') || lowerInput.includes('new task') || 
        lowerInput.includes('remind me') || lowerInput.includes('todo') || lowerInput.includes('remember')) {
      return { type: 'create_task', input };
    }
    
    // Get tasks patterns
    if (lowerInput.includes('show') || lowerInput.includes('list') || lowerInput.includes('what') || 
        lowerInput.includes('my tasks') || lowerInput.includes('to do')) {
      if (lowerInput.includes('completed')) {
        return { type: 'get_tasks', filter: 'completed' };
      } else if (lowerInput.includes('pending') || lowerInput.includes('open')) {
        return { type: 'get_tasks', filter: 'pending' };
      } else if (lowerInput.includes('overdue')) {
        return { type: 'get_tasks', filter: 'overdue' };
      } else if (lowerInput.includes('today')) {
        return { type: 'get_tasks', filter: 'today' };
      } else {
        return { type: 'get_tasks', filter: 'all' };
      }
    }
    
    // Complete task patterns
    if (lowerInput.includes('complete') || lowerInput.includes('done') || lowerInput.includes('finish')) {
      return { type: 'complete_task', input };
    }
    
    // Update task patterns
    if (lowerInput.includes('update') || lowerInput.includes('change') || lowerInput.includes('modify')) {
      return { type: 'update_task', input };
    }
    
    // Delete task patterns
    if (lowerInput.includes('delete') || lowerInput.includes('remove') || lowerInput.includes('cancel')) {
      return { type: 'delete_task', input };
    }
    
    // Set reminder patterns
    if (lowerInput.includes('remind') || lowerInput.includes('alert') || lowerInput.includes('notification')) {
      return { type: 'set_reminder', input };
    }
    
    return { type: 'general', input };
  }

  async handleCreateTask(userId, intent, context) {
    try {
      // Parse task details from input
      const taskDetails = await this.parseTaskDetails(intent.input);
      
      if (!taskDetails.title) {
        return {
          text: "What task would you like me to create?",
          actions: [],
          suggestions: ['Add a specific task', 'Set a reminder', 'Create a todo']
        };
      }
      
      const task = await this.createTask({
        userId,
        ...taskDetails
      });
      
      let responseText = `I've created the task "${task.title}".`;
      if (task.dueDate) {
        responseText += ` Due date: ${this.formatDate(task.dueDate)}.`;
      }
      if (task.priority) {
        responseText += ` Priority: ${task.priority}.`;
      }
      
      return {
        text: responseText,
        actions: [{
          type: 'view_task',
          taskId: task.id,
          title: task.title
        }],
        suggestions: ['Add another task', 'Set reminder', 'Show all tasks']
      };
    } catch (error) {
      logger.error('Handle create task failed:', error);
      return {
        text: "I couldn't create the task. Please try again.",
        actions: [],
        suggestions: ['Try again', 'Be more specific']
      };
    }
  }

  async handleGetTasks(userId, intent, context) {
    try {
      const limit = 10;
      const tasks = await this.getTasks(userId, intent.filter, limit);
      
      if (tasks.length === 0) {
        const filterText = intent.filter === 'completed' ? 'completed tasks' : 
                          intent.filter === 'pending' ? 'pending tasks' : 
                          intent.filter === 'overdue' ? 'overdue tasks' :
                          intent.filter === 'today' ? 'tasks for today' : 'tasks';
        return {
          text: `You have no ${filterText}.`,
          actions: [],
          suggestions: ['Create a task', 'Show all tasks', 'Check completed tasks']
        };
      }
      
      const taskList = tasks.map(task => {
        let taskText = task.title;
        if (task.dueDate) {
          taskText += ` (due ${this.formatDate(task.dueDate)})`;
        }
        if (task.priority && task.priority !== 'medium') {
          taskText += ` [${task.priority}]`;
        }
        return taskText;
      }).join(', ');
      
      const filterText = intent.filter === 'completed' ? 'completed tasks' : 
                        intent.filter === 'pending' ? 'pending tasks' : 
                        intent.filter === 'overdue' ? 'overdue tasks' :
                        intent.filter === 'today' ? 'tasks for today' : 'tasks';
      
      return {
        text: `Here are your ${filterText}: ${taskList}`,
        actions: tasks.map(task => ({
          type: 'view_task',
          taskId: task.id,
          title: task.title
        })),
        suggestions: ['Complete task', 'Add new task', 'Set reminder']
      };
    } catch (error) {
      logger.error('Handle get tasks failed:', error);
      return {
        text: "I couldn't retrieve your tasks. Please try again.",
        actions: [],
        suggestions: ['Try again', 'Check connection']
      };
    }
  }

  async handleCompleteTask(userId, intent, context) {
    try {
      // For now, return a generic response since we need more context
      return {
        text: "Which task would you like to mark as complete? Please show me your tasks first and then specify which one.",
        actions: [],
        suggestions: ['Show my tasks', 'Be more specific', 'Show pending tasks']
      };
    } catch (error) {
      logger.error('Handle complete task failed:', error);
      return {
        text: "I couldn't complete the task. Please try again.",
        actions: [],
        suggestions: ['Show tasks first', 'Try again']
      };
    }
  }

  async handleUpdateTask(userId, intent, context) {
    try {
      return {
        text: "Which task would you like to update? Please show me your tasks first and then specify what changes you'd like to make.",
        actions: [],
        suggestions: ['Show my tasks', 'Be more specific', 'Create new task instead']
      };
    } catch (error) {
      logger.error('Handle update task failed:', error);
      return {
        text: "I couldn't update the task. Please try again.",
        actions: [],
        suggestions: ['Show tasks first', 'Try again']
      };
    }
  }

  async handleDeleteTask(userId, intent, context) {
    try {
      return {
        text: "Which task would you like to delete? Please show me your tasks first and then specify which one to remove.",
        actions: [],
        suggestions: ['Show my tasks', 'Be more specific', 'Complete task instead']
      };
    } catch (error) {
      logger.error('Handle delete task failed:', error);
      return {
        text: "I couldn't delete the task. Please try again.",
        actions: [],
        suggestions: ['Show tasks first', 'Try again']
      };
    }
  }

  async handleSetReminder(userId, intent, context) {
    try {
      const reminderDetails = this.parseReminderDetails(intent.input);
      
      if (!reminderDetails.text) {
        return {
          text: "What would you like me to remind you about?",
          actions: [],
          suggestions: ['Set specific reminder', 'Create a task', 'Set time for reminder']
        };
      }
      
      // Create a task with reminder
      const task = await this.createTask({
        userId,
        title: reminderDetails.text,
        dueDate: reminderDetails.reminderTime,
        priority: 'medium',
        type: 'reminder'
      });
      
      let responseText = `I've set a reminder: "${task.title}".`;
      if (task.dueDate) {
        responseText += ` I'll remind you ${this.formatDate(task.dueDate)}.`;
      }
      
      return {
        text: responseText,
        actions: [{
          type: 'view_task',
          taskId: task.id,
          title: task.title
        }],
        suggestions: ['Set another reminder', 'Show all tasks', 'Set time for reminder']
      };
    } catch (error) {
      logger.error('Handle set reminder failed:', error);
      return {
        text: "I couldn't set the reminder. Please try again.",
        actions: [],
        suggestions: ['Try again', 'Be more specific']
      };
    }
  }

  async handleGeneralTaskQuery(userId, input, context) {
    return {
      text: "I can help you manage your tasks. You can ask me to create tasks, show your to-do list, mark tasks as complete, or set reminders.",
      actions: [],
      suggestions: ['Create a task', 'Show my tasks', 'Set a reminder']
    };
  }

  // Task data management methods
  async createTask(taskData) {
    try {
      // Task integration not yet implemented
      logger.warn(`Task creation not yet implemented for user ${taskData.userId}`);
      throw new Error('Task management integration not available. Please set up task management integration first.');
    } catch (error) {
      logger.error('Create task failed:', error);
      throw error;
    }
  }

  async getTasks(userId, filter = 'all', limit = 10) {
    try {
      // For now, return mock data. In a real implementation, this would:
      // 1. Query tasks from database/Airtable
      // 2. Apply filters
      // 3. Return formatted tasks
      
      const mockTasks = [
        {
          id: 'task1',
          title: 'Review project proposal',
          description: 'Review the Q4 project proposal document',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
          priority: 'high',
          status: 'pending',
          type: 'task'
        },
        {
          id: 'task2',
          title: 'Call dentist',
          description: 'Schedule dentist appointment',
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Day after tomorrow
          priority: 'medium',
          status: 'pending',
          type: 'reminder'
        },
        {
          id: 'task3',
          title: 'Buy groceries',
          description: 'Weekly grocery shopping',
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
          priority: 'low',
          status: 'pending',
          type: 'task'
        },
        {
          id: 'task4',
          title: 'Complete monthly report',
          description: 'Finish and submit monthly report',
          dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday (overdue)
          priority: 'high',
          status: 'pending',
          type: 'task'
        },
        {
          id: 'task5',
          title: 'Team meeting prep',
          description: 'Prepare for team meeting',
          dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          priority: 'medium',
          status: 'completed',
          type: 'task'
        }
      ];
      
      let filteredTasks = mockTasks;
      const now = new Date();
      
      switch (filter) {
        case 'pending':
          filteredTasks = mockTasks.filter(task => task.status === 'pending');
          break;
        case 'completed':
          filteredTasks = mockTasks.filter(task => task.status === 'completed');
          break;
        case 'overdue':
          filteredTasks = mockTasks.filter(task => 
            task.status === 'pending' && task.dueDate && task.dueDate < now
          );
          break;
        case 'today':
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          
          filteredTasks = mockTasks.filter(task => 
            task.status === 'pending' && task.dueDate && 
            task.dueDate >= today && task.dueDate < tomorrow
          );
          break;
        default:
          filteredTasks = mockTasks;
      }
      
      return filteredTasks.slice(0, limit);
    } catch (error) {
      logger.error('Get tasks failed:', error);
      return [];
    }
  }

  async updateTask(taskId, updates) {
    try {
      // Mock implementation
      const mockTask = {
        id: taskId,
        ...updates,
        updatedAt: new Date()
      };
      
      logger.info('Task updated:', mockTask);
      return mockTask;
    } catch (error) {
      logger.error('Update task failed:', error);
      throw error;
    }
  }

  async completeTask(taskId) {
    try {
      // Mock implementation
      const mockTask = {
        id: taskId,
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date()
      };
      
      logger.info('Task completed:', mockTask);
      return mockTask;
    } catch (error) {
      logger.error('Complete task failed:', error);
      throw error;
    }
  }

  async deleteTask(taskId) {
    try {
      // Mock implementation
      logger.info('Task deleted:', taskId);
      return { deleted: true, taskId };
    } catch (error) {
      logger.error('Delete task failed:', error);
      throw error;
    }
  }

  async setReminder(taskId, reminderTime) {
    try {
      // Mock implementation
      const mockReminder = {
        id: `reminder_${Date.now()}`,
        taskId,
        reminderTime,
        createdAt: new Date()
      };
      
      logger.info('Reminder set:', mockReminder);
      return mockReminder;
    } catch (error) {
      logger.error('Set reminder failed:', error);
      throw error;
    }
  }

  // Utility methods
  parseTaskDetails(input) {
    // Simple parsing - in a real implementation, this would use NLP
    const taskDetails = {
      title: null,
      description: null,
      dueDate: null,
      priority: 'medium'
    };
    
    // Extract title
    let title = input;
    
    // Remove command words
    title = title.replace(/^(create|add|new task|remind me to|remember to|todo)\s*/i, '');
    
    // Extract priority
    if (title.includes('urgent') || title.includes('important') || title.includes('high priority')) {
      taskDetails.priority = 'high';
      title = title.replace(/(urgent|important|high priority)/gi, '').trim();
    } else if (title.includes('low priority')) {
      taskDetails.priority = 'low';
      title = title.replace(/low priority/gi, '').trim();
    }
    
    // Extract due date
    if (title.includes('today')) {
      taskDetails.dueDate = new Date();
      title = title.replace(/today/gi, '').trim();
    } else if (title.includes('tomorrow')) {
      taskDetails.dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      title = title.replace(/tomorrow/gi, '').trim();
    } else if (title.includes('next week')) {
      taskDetails.dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      title = title.replace(/next week/gi, '').trim();
    }
    
    taskDetails.title = title.trim();
    return taskDetails;
  }

  parseReminderDetails(input) {
    const reminderDetails = {
      text: null,
      reminderTime: null
    };
    
    // Extract reminder text
    let text = input;
    text = text.replace(/^(remind me to|remind me|set reminder)\s*/i, '');
    
    // Extract time
    if (text.includes('in ')) {
      const match = text.match(/in (\d+) (minute|minutes|hour|hours|day|days)/i);
      if (match) {
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        let milliseconds = 0;
        if (unit.startsWith('minute')) {
          milliseconds = amount * 60 * 1000;
        } else if (unit.startsWith('hour')) {
          milliseconds = amount * 60 * 60 * 1000;
        } else if (unit.startsWith('day')) {
          milliseconds = amount * 24 * 60 * 60 * 1000;
        }
        
        reminderDetails.reminderTime = new Date(Date.now() + milliseconds);
        text = text.replace(/in \d+ (minute|minutes|hour|hours|day|days)/i, '').trim();
      }
    }
    
    reminderDetails.text = text.trim();
    return reminderDetails;
  }

  formatDate(date) {
    const now = new Date();
    const diffTime = date - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'today';
    } else if (diffDays === 1) {
      return 'tomorrow';
    } else if (diffDays === -1) {
      return 'yesterday';
    } else if (diffDays < 0) {
      return `${Math.abs(diffDays)} days ago`;
    } else if (diffDays < 7) {
      return `in ${diffDays} days`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  }

  getStats() {
    return {
      agentName: this.agentName,
      toolsAvailable: this.tools.length,
      lastProcessedAt: new Date().toISOString()
    };
  }
}

module.exports = new TaskAgent();