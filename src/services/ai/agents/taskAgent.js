const { ChatOpenAI } = require('@langchain/openai');
const { LLMChain } = require('langchain/chains');
const { PromptTemplate } = require('langchain/prompts');
const logger = require('../../../utils/logger');

class TaskAgent {
  constructor(taskService) {
    this.taskService = taskService;
    this.agentName = 'TaskAgent';
    
    // Initialize LLM with same configuration as coordinator
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.3, // Lower temperature for more consistent task operations
      maxTokens: 1500,
      openAIApiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
      configuration: {
        baseURL: process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined,
        defaultHeaders: process.env.OPENROUTER_API_KEY ? {
          'HTTP-Referer': process.env.APP_URL || 'https://voiceassistant.com',
          'X-Title': 'Voice Assistant Tasks'
        } : {}
      }
    });

    logger.info('TaskAgent initialized');
  }

  /**
   * Handle task-related requests
   */
  async handleRequest(userId, userInput, context, systemPrompt) {
    try {
      logger.info(`TaskAgent handling request for user ${userId}: "${userInput}"`);

      // Check if task integration is available
      const isTasksActive = await this.taskService.isIntegrationActive(userId);
      
      if (!isTasksActive) {
        return this.handleNoTaskIntegration(userInput);
      }

      // Analyze the task intent and extract parameters
      const taskIntent = await this.analyzeTaskIntent(userInput, context);
      
      logger.debug(`Task intent analysis:`, taskIntent);

      // Execute the appropriate task action
      let result;
      switch (taskIntent.action) {
        case 'create_task':
          result = await this.handleCreateTask(userId, taskIntent.parameters);
          break;
        case 'view_tasks':
          result = await this.handleViewTasks(userId, taskIntent.parameters);
          break;
        case 'update_task':
          result = await this.handleUpdateTask(userId, taskIntent.parameters);
          break;
        case 'complete_task':
          result = await this.handleCompleteTask(userId, taskIntent.parameters);
          break;
        case 'delete_task':
          result = await this.handleDeleteTask(userId, taskIntent.parameters);
          break;
        case 'search_tasks':
          result = await this.handleSearchTasks(userId, taskIntent.parameters);
          break;
        case 'get_task_stats':
          result = await this.handleGetTaskStats(userId, taskIntent.parameters);
          break;
        default:
          result = await this.handleGenericTaskQuery(userId, userInput, context, systemPrompt);
      }

      // Generate voice-optimized response
      const response = await this.generateResponse(userInput, result, systemPrompt, context);

      return {
        text: response,
        agentUsed: this.agentName,
        action: taskIntent.action,
        actions: result.actions || [],
        context: {
          taskAction: taskIntent.action,
          parameters: taskIntent.parameters,
          result: result.summary || 'Task operation completed'
        }
      };

    } catch (error) {
      logger.error('Error in TaskAgent:', error);
      return this.handleError(userInput, error);
    }
  }

  /**
   * Analyze task intent and extract parameters
   */
  async analyzeTaskIntent(userInput, context) {
    try {
      const intentPrompt = PromptTemplate.fromTemplate(`
        Analyze this task-related request and extract the action and parameters.

        User Input: "{input}"
        
        Context: {context}

        Available Task Actions:
        - create_task: Create a new task or to-do item
        - view_tasks: View existing tasks (all, by status, by priority)
        - update_task: Modify an existing task
        - complete_task: Mark a task as completed
        - delete_task: Remove a task
        - search_tasks: Search for tasks by keyword
        - get_task_stats: Get overview of task statistics

        Extract and return JSON with:
        {{
          "action": "one of the above actions",
          "confidence": 0.0-1.0,
          "parameters": {{
            "title": "task title if creating/updating",
            "description": "task description",
            "priority": "High, Medium, or Low",
            "status": "Not Started, In Progress, Completed",
            "dueDate": "due date if mentioned",
            "category": "category or project",
            "assignee": "person assigned",
            "taskId": "task ID if updating/completing/deleting specific task",
            "searchQuery": "search terms for finding tasks",
            "filterBy": {{
              "status": "filter by status",
              "priority": "filter by priority",
              "overdue": "true/false for overdue tasks"
            }},
            "limit": "number of tasks to return"
          }}
        }}

        Only include parameters that are explicitly mentioned or can be reasonably inferred.
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: intentPrompt
      });

      const result = await chain.call({
        input: userInput,
        context: JSON.stringify(context, null, 2)
      });

      try {
        const parsed = JSON.parse(result.text);
        return {
          action: parsed.action || 'view_tasks',
          confidence: parsed.confidence || 0.5,
          parameters: parsed.parameters || {}
        };
      } catch (parseError) {
        logger.warn('Failed to parse task intent, using fallback');
        return {
          action: 'view_tasks',
          confidence: 0.3,
          parameters: {}
        };
      }

    } catch (error) {
      logger.error('Error analyzing task intent:', error);
      return {
        action: 'view_tasks',
        confidence: 0.1,
        parameters: {}
      };
    }
  }

  /**
   * Handle creating new tasks
   */
  async handleCreateTask(userId, parameters) {
    try {
      // Validate required parameters
      if (!parameters.title) {
        return {
          success: false,
          error: 'Task title is required',
          needsMoreInfo: true,
          missingInfo: ['title']
        };
      }

      // Prepare task data
      const taskData = {
        title: parameters.title,
        description: parameters.description || '',
        priority: parameters.priority || 'Medium',
        status: parameters.status || 'Not Started',
        category: parameters.category || null,
        assignee: parameters.assignee || null
      };

      // Parse due date if provided
      if (parameters.dueDate) {
        const dueDate = this.parseDate(parameters.dueDate);
        if (dueDate) {
          taskData.dueDate = dueDate;
        }
      }

      // Create the task
      const createdTask = await this.taskService.createTask(userId, taskData);

      return {
        success: true,
        data: createdTask,
        summary: `Created task "${createdTask.title}"`,
        actions: ['create_task'],
        details: {
          taskId: createdTask.id,
          title: createdTask.title,
          priority: createdTask.priority,
          dueDate: createdTask.dueDate,
          status: createdTask.status
        }
      };

    } catch (error) {
      logger.error('Error creating task:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to create task'
      };
    }
  }

  /**
   * Handle viewing tasks
   */
  async handleViewTasks(userId, parameters) {
    try {
      let tasks;
      let description = 'tasks';

      // Handle different view types
      if (parameters.filterBy) {
        if (parameters.filterBy.status) {
          tasks = await this.taskService.getTasksByStatus(userId, parameters.filterBy.status, parameters.limit || 10);
          description = `${parameters.filterBy.status.toLowerCase()} tasks`;
        } else if (parameters.filterBy.priority) {
          tasks = await this.taskService.getTasksByPriority(userId, parameters.filterBy.priority, parameters.limit || 10);
          description = `${parameters.filterBy.priority.toLowerCase()} priority tasks`;
        } else if (parameters.filterBy.overdue === 'true') {
          tasks = await this.taskService.getOverdueTasks(userId, parameters.limit || 10);
          description = 'overdue tasks';
        } else {
          tasks = await this.taskService.getTasks(userId, { limit: parameters.limit || 10 });
        }
      } else {
        tasks = await this.taskService.getTasks(userId, { limit: parameters.limit || 10 });
      }

      return {
        success: true,
        data: tasks,
        summary: `Found ${tasks.length} ${description}`,
        actions: ['view_tasks'],
        details: {
          taskCount: tasks.length,
          description: description,
          tasks: tasks.slice(0, 5) // Limit for voice response
        }
      };

    } catch (error) {
      logger.error('Error viewing tasks:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to retrieve tasks'
      };
    }
  }

  /**
   * Handle updating tasks
   */
  async handleUpdateTask(userId, parameters) {
    try {
      if (!parameters.taskId && !parameters.searchQuery) {
        return {
          success: false,
          error: 'Task ID or search criteria required for updating',
          needsMoreInfo: true,
          missingInfo: ['taskId', 'searchQuery']
        };
      }

      // Find task if needed
      let taskId = parameters.taskId;
      let taskTitle = 'the task';
      
      if (!taskId && parameters.searchQuery) {
        const tasks = await this.findTasksByQuery(userId, parameters.searchQuery);
        if (tasks.length === 0) {
          return {
            success: false,
            error: 'No tasks found matching your criteria'
          };
        }
        if (tasks.length > 1) {
          return {
            success: false,
            error: 'Multiple tasks found, please be more specific',
            data: tasks.slice(0, 3) // Show first 3 matches
          };
        }
        taskId = tasks[0].id;
        taskTitle = tasks[0].title;
      }

      // Prepare update data
      const updates = {};
      if (parameters.title) updates.title = parameters.title;
      if (parameters.description) updates.description = parameters.description;
      if (parameters.priority) updates.priority = parameters.priority;
      if (parameters.status) updates.status = parameters.status;
      if (parameters.category) updates.category = parameters.category;
      if (parameters.assignee) updates.assignee = parameters.assignee;
      if (parameters.dueDate) {
        const dueDate = this.parseDate(parameters.dueDate);
        if (dueDate) updates.dueDate = dueDate;
      }

      // Update the task
      const updatedTask = await this.taskService.updateTask(userId, taskId, updates);

      return {
        success: true,
        data: updatedTask,
        summary: `Updated task "${updatedTask.title}"`,
        actions: ['update_task'],
        details: {
          taskId: updatedTask.id,
          title: updatedTask.title,
          changes: Object.keys(updates)
        }
      };

    } catch (error) {
      logger.error('Error updating task:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to update task'
      };
    }
  }

  /**
   * Handle completing tasks
   */
  async handleCompleteTask(userId, parameters) {
    try {
      if (!parameters.taskId && !parameters.searchQuery) {
        return {
          success: false,
          error: 'Task ID or search criteria required for completing',
          needsMoreInfo: true,
          missingInfo: ['taskId', 'searchQuery']
        };
      }

      // Find task if needed
      let taskId = parameters.taskId;
      let taskTitle = 'the task';
      
      if (!taskId && parameters.searchQuery) {
        const tasks = await this.findTasksByQuery(userId, parameters.searchQuery);
        if (tasks.length === 0) {
          return {
            success: false,
            error: 'No tasks found matching your criteria'
          };
        }
        if (tasks.length > 1) {
          return {
            success: false,
            error: 'Multiple tasks found, please be more specific',
            data: tasks.slice(0, 3)
          };
        }
        taskId = tasks[0].id;
        taskTitle = tasks[0].title;
      }

      // Complete the task
      const completedTask = await this.taskService.completeTask(userId, taskId);

      return {
        success: true,
        data: completedTask,
        summary: `Completed task "${completedTask.title}"`,
        actions: ['complete_task'],
        details: {
          taskId: completedTask.id,
          title: completedTask.title,
          completedAt: completedTask.completedAt
        }
      };

    } catch (error) {
      logger.error('Error completing task:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to complete task'
      };
    }
  }

  /**
   * Handle deleting tasks
   */
  async handleDeleteTask(userId, parameters) {
    try {
      if (!parameters.taskId && !parameters.searchQuery) {
        return {
          success: false,
          error: 'Task ID or search criteria required for deletion',
          needsMoreInfo: true,
          missingInfo: ['taskId', 'searchQuery']
        };
      }

      // Find task if needed
      let taskId = parameters.taskId;
      let taskTitle = 'the task';
      
      if (!taskId && parameters.searchQuery) {
        const tasks = await this.findTasksByQuery(userId, parameters.searchQuery);
        if (tasks.length === 0) {
          return {
            success: false,
            error: 'No tasks found matching your criteria'
          };
        }
        if (tasks.length > 1) {
          return {
            success: false,
            error: 'Multiple tasks found, please be more specific',
            data: tasks.slice(0, 3)
          };
        }
        taskId = tasks[0].id;
        taskTitle = tasks[0].title;
      }

      // Delete the task
      const result = await this.taskService.deleteTask(userId, taskId);

      return {
        success: true,
        data: result,
        summary: `Deleted task "${taskTitle}"`,
        actions: ['delete_task'],
        details: {
          taskId: taskId,
          taskTitle: taskTitle
        }
      };

    } catch (error) {
      logger.error('Error deleting task:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to delete task'
      };
    }
  }

  /**
   * Handle searching tasks
   */
  async handleSearchTasks(userId, parameters) {
    try {
      if (!parameters.searchQuery) {
        return {
          success: false,
          error: 'Search query is required',
          needsMoreInfo: true,
          missingInfo: ['searchQuery']
        };
      }

      const tasks = await this.taskService.searchTasks(userId, parameters.searchQuery, parameters.limit || 10);

      return {
        success: true,
        data: tasks,
        summary: `Found ${tasks.length} tasks matching "${parameters.searchQuery}"`,
        actions: ['search_tasks'],
        details: {
          searchQuery: parameters.searchQuery,
          resultCount: tasks.length,
          tasks: tasks.slice(0, 5) // Limit for voice response
        }
      };

    } catch (error) {
      logger.error('Error searching tasks:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to search tasks'
      };
    }
  }

  /**
   * Handle getting task statistics
   */
  async handleGetTaskStats(userId, parameters) {
    try {
      const stats = await this.taskService.getTaskStatistics(userId);

      return {
        success: true,
        data: stats,
        summary: `You have ${stats.total} total tasks, ${stats.completed} completed, ${stats.pending} pending`,
        actions: ['get_task_stats'],
        details: {
          total: stats.total,
          completed: stats.completed,
          pending: stats.pending,
          overdue: stats.overdue,
          byPriority: stats.byPriority
        }
      };

    } catch (error) {
      logger.error('Error getting task stats:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to get task statistics'
      };
    }
  }

  /**
   * Handle generic task queries using LLM
   */
  async handleGenericTaskQuery(userId, userInput, context, systemPrompt) {
    try {
      // Get recent task data for context
      const recentTasks = await this.taskService.getTasks(userId, { limit: 10 });

      const queryPrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        TASK CONTEXT:
        Recent Tasks: {tasks}

        USER QUERY: "{input}"

        Provide a helpful response about the user's tasks. Be specific and actionable.
        If you need to perform a task action, explain what you would do.
        Keep the response under 50 words and voice-optimized.
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: queryPrompt
      });

      const result = await chain.call({
        input: userInput,
        tasks: JSON.stringify(recentTasks.slice(0, 5), null, 2)
      });

      return {
        success: true,
        summary: 'Task query processed',
        data: { response: result.text.trim() }
      };

    } catch (error) {
      logger.error('Error handling generic task query:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to process task query'
      };
    }
  }

  /**
   * Handle case where task integration is not available
   */
  handleNoTaskIntegration(userInput) {
    return {
      text: "I'd be happy to help with your tasks, but you'll need to connect your Airtable first. Would you like me to guide you through setting that up?",
      agentUsed: this.agentName,
      action: 'integration_required',
      actions: ['setup_task_integration'],
      context: {
        integrationNeeded: 'airtable_tasks',
        originalRequest: userInput
      }
    };
  }

  /**
   * Generate voice-optimized response
   */
  async generateResponse(userInput, result, systemPrompt, context) {
    try {
      const responsePrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        USER REQUEST: "{input}"
        
        TASK OPERATION RESULT:
        Success: {success}
        Summary: {summary}
        Details: {details}
        Error: {error}

        Generate a voice-optimized response that:
        1. Acknowledges the request
        2. Reports the result clearly
        3. Suggests next actions if appropriate
        4. Keeps it under 50 words
        5. Uses natural, conversational language

        Response:
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: responsePrompt
      });

      const response = await chain.call({
        input: userInput,
        success: result.success,
        summary: result.summary || 'Operation completed',
        details: JSON.stringify(result.details || {}, null, 2),
        error: result.error || 'None'
      });

      return response.text.trim();

    } catch (error) {
      logger.error('Error generating response:', error);
      return result.success ? 
        (result.summary || 'Task operation completed successfully.') :
        (result.error || 'I had trouble with that task request. Please try again.');
    }
  }

  /**
   * Handle errors
   */
  handleError(userInput, error) {
    return {
      text: "I'm sorry, I had trouble with that task request. Please try again or be more specific about what you'd like me to do.",
      agentUsed: this.agentName,
      action: 'error',
      actions: [],
      context: {
        error: error.message,
        originalRequest: userInput
      }
    };
  }

  /**
   * Helper methods
   */
  parseDate(dateString) {
    if (!dateString) return null;
    
    // Handle natural language dates
    const today = new Date();
    const lower = dateString.toLowerCase();
    
    if (lower.includes('today')) return today;
    if (lower.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    if (lower.includes('next week')) {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    }
    if (lower.includes('end of week')) {
      const endOfWeek = new Date(today);
      const daysUntilFriday = 5 - today.getDay();
      endOfWeek.setDate(today.getDate() + daysUntilFriday);
      return endOfWeek;
    }
    
    // Try to parse as regular date
    const parsed = new Date(dateString);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  async findTasksByQuery(userId, query) {
    try {
      // Use the search functionality if available
      if (this.taskService.searchTasks) {
        return await this.taskService.searchTasks(userId, query, 10);
      }

      // Fallback: get all tasks and filter manually
      const allTasks = await this.taskService.getTasks(userId, { limit: 100 });
      const queryLower = query.toLowerCase();
      
      return allTasks.filter(task => 
        task.title?.toLowerCase().includes(queryLower) ||
        task.description?.toLowerCase().includes(queryLower) ||
        task.category?.toLowerCase().includes(queryLower)
      );

    } catch (error) {
      logger.error('Error searching tasks by query:', error);
      return [];
    }
  }

  /**
   * Get task priority level for sorting/filtering
   */
  getPriorityLevel(priority) {
    const levels = { 'High': 3, 'Medium': 2, 'Low': 1 };
    return levels[priority] || 2;
  }

  /**
   * Format task for voice response
   */
  formatTaskForVoice(task) {
    let description = task.title;
    
    if (task.priority && task.priority !== 'Medium') {
      description += ` (${task.priority} priority)`;
    }
    
    if (task.dueDate) {
      const today = new Date();
      const dueDate = new Date(task.dueDate);
      const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDue === 0) {
        description += ' (due today)';
      } else if (daysUntilDue === 1) {
        description += ' (due tomorrow)';
      } else if (daysUntilDue > 0) {
        description += ` (due in ${daysUntilDue} days)`;
      } else {
        description += ` (overdue by ${Math.abs(daysUntilDue)} days)`;
      }
    }
    
    return description;
  }
}

module.exports = TaskAgent;