const { ChatOpenAI } = require('@langchain/openai');
const { AgentExecutor } = require('langchain/agents');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { ConversationSummaryMemory } = require('langchain/memory');
const { DynamicStructuredTool } = require('langchain/tools');
const { createOpenAIFunctionsAgent } = require('langchain/agents');
const { z } = require('zod');
const logger = require('../../utils/logger');
const DatabaseAdapter = require('./utils/databaseAdapter');

// Import existing service integrations
const GoogleIntegrationFactory = require('../integrations/google/factory');
const AirtableTasksIntegration = require('../integrations/airtable/tasks');

// Import agent utilities
const SystemPromptGenerator = require('./utils/systemPromptGenerator');
const PersonalizationManager = require('./utils/personalizationManagerProduction');
const ContextManager = require('./utils/contextManager');

class EnhancedLangChainCoordinator {
  constructor(databaseConfig) {
    this.serviceName = 'enhanced_langchain_coordinator';
    
    // Initialize database adapter
    this.db = new DatabaseAdapter(databaseConfig);
    
    // Initialize LLMs
    this.initializeLLMs();

    // Initialize service integrations using factories
    this.calendarService = GoogleIntegrationFactory.createCalendarService();
    this.gmailService = GoogleIntegrationFactory.createGmailService();
    this.airtableService = AirtableTasksIntegration;

    // Initialize utilities
    this.systemPromptGenerator = new SystemPromptGenerator();
    this.personalizationManager = new PersonalizationManager(this.db);
    this.contextManager = new ContextManager();

    // User memory storage
    this.userMemory = new Map();

    logger.info('Enhanced LangChain Coordinator (Production) initialized successfully');
  }

  /**
   * Initialize LLM with OpenRouter only
   */
  initializeLLMs() {
    try {
      // Initialize OpenRouter LLM
      if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_API_KEY.startsWith('sk-or-')) {
        throw new Error('OPENROUTER_API_KEY is not set or invalid. Please set a valid OpenRouter API key.');
      }

      // Configuration for LangChain with OpenRouter
      // The second parameter is for configuration options including basePath and headers
      this.llm = new ChatOpenAI(
        {
          modelName: 'openai/gpt-4o',
          temperature: 0.7,
          maxTokens: 2000,
          openAIApiKey: process.env.OPENROUTER_API_KEY,
        },
        {
          basePath: 'https://openrouter.ai/api/v1',
          baseOptions: {
            headers: {
              'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://floe.cognetica.de',
              'X-Title': process.env.OPENROUTER_SITE_NAME || 'voice_assistant'
            }
          }
        }
      );
      
      logger.info('OpenRouter LLM initialized successfully');
      logger.info(`Using model: openai/gpt-4o via OpenRouter`);

    } catch (error) {
      logger.error('Failed to initialize OpenRouter LLM:', error);
      throw error;
    }
  }

  /**
   * Create LangChain tools for the agent
   */
  createTools(userId) {
    const tools = [];

    // Calendar Tool
    tools.push(new DynamicStructuredTool({
      name: 'calendar_operations',
      description: 'Manage calendar events - view, create, update, delete events and find free time',
      schema: z.object({
        operation: z.enum(['view', 'create', 'update', 'delete', 'find_free_time', 'get_summary']),
        parameters: z.object({
          title: z.string().optional(),
          date: z.string().optional(),
          time: z.string().optional(),
          duration: z.number().optional(),
          location: z.string().optional(),
          description: z.string().optional(),
          attendees: z.array(z.string()).optional(),
          eventId: z.string().optional(),
          searchQuery: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional()
        }).optional()
      }),
      func: async ({ operation, parameters = {} }) => {
        try {
          // Check if calendar integration is active
          const isActive = await this.calendarService.isIntegrationActive(userId);
          if (!isActive) {
            return 'Calendar integration is not active. Please connect your Google Calendar first.';
          }

          switch (operation) {
            case 'view': {
              const startDate = parameters.startDate ? new Date(parameters.startDate) : new Date();
              const endDate = parameters.endDate ? new Date(parameters.endDate) : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
              const events = await this.calendarService.getCalendarEvents(userId, startDate, endDate);
              return JSON.stringify({
                success: true,
                count: events.length,
                events: events.slice(0, 5).map(e => ({
                  title: e.title,
                  startTime: e.startTime,
                  endTime: e.endTime,
                  location: e.location
                }))
              });
            }

            case 'create': {
              if (!parameters.title || !parameters.date || !parameters.time) {
                return JSON.stringify({
                  success: false,
                  error: 'Missing required fields: title, date, and time'
                });
              }
              
              const startTime = this.parseDateTime(parameters.date, parameters.time);
              const duration = parameters.duration || 60;
              const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
              
              const event = await this.calendarService.createCalendarEvent(userId, {
                title: parameters.title,
                description: parameters.description || '',
                startTime,
                endTime,
                location: parameters.location || '',
                attendees: parameters.attendees || []
              });
              
              return JSON.stringify({
                success: true,
                eventId: event.id,
                title: event.title,
                startTime: event.startTime
              });
            }

            case 'update': {
              if (!parameters.eventId && !parameters.searchQuery) {
                return JSON.stringify({
                  success: false,
                  error: 'Need either eventId or searchQuery to identify the event'
                });
              }
              
              // Implementation would go here
              return JSON.stringify({
                success: true,
                message: 'Event update functionality to be implemented'
              });
            }

            case 'delete': {
              if (!parameters.eventId) {
                return JSON.stringify({
                  success: false,
                  error: 'Need eventId to delete the event'
                });
              }
              
              const result = await this.calendarService.deleteCalendarEvent(userId, parameters.eventId);
              return JSON.stringify(result);
            }

            case 'find_free_time': {
              const date = parameters.date ? new Date(parameters.date) : new Date();
              const duration = parameters.duration || 60;
              const freeSlots = await this.calendarService.findFreeTime(userId, date, duration);
              
              return JSON.stringify({
                success: true,
                date: date.toDateString(),
                duration,
                freeSlots: freeSlots.slice(0, 3).map(slot => ({
                  start: slot.startTime.toLocaleTimeString(),
                  end: slot.endTime.toLocaleTimeString()
                }))
              });
            }

            case 'get_summary': {
              const today = new Date();
              const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
              const events = await this.calendarService.getCalendarEvents(userId, today, endDate);
              
              const todayEvents = events.filter(e => 
                e.startTime.toDateString() === today.toDateString()
              );
              
              return JSON.stringify({
                success: true,
                todayCount: todayEvents.length,
                weekCount: events.length,
                nextEvent: events[0] ? {
                  title: events[0].title,
                  startTime: events[0].startTime
                } : null
              });
            }

            default:
              return JSON.stringify({
                success: false,
                error: `Unknown operation: ${operation}`
              });
          }
        } catch (error) {
          logger.error(`Calendar tool error (${operation}):`, error);
          return JSON.stringify({
            success: false,
            error: error.message
          });
        }
      }
    }));

    // Email Tool
    tools.push(new DynamicStructuredTool({
      name: 'email_operations',
      description: 'Manage emails - read, compose, send, search emails',
      schema: z.object({
        operation: z.enum(['read', 'compose', 'send', 'search', 'get_unread_count']),
        parameters: z.object({
          to: z.array(z.string()).optional(),
          subject: z.string().optional(),
          body: z.string().optional(),
          query: z.string().optional(),
          limit: z.number().optional(),
          emailId: z.string().optional()
        }).optional()
      }),
      func: async ({ operation, parameters = {} }) => {
        try {
          // Check if email integration is active
          const isActive = await this.gmailService.isIntegrationActive(userId);
          if (!isActive) {
            return 'Email integration is not active. Please connect your Gmail account first.';
          }

          switch (operation) {
            case 'read': {
              const emails = await this.gmailService.getEmails(userId, parameters.limit || 5);
              return JSON.stringify({
                success: true,
                count: emails.length,
                emails: emails.map(e => ({
                  id: e.id,
                  from: e.from,
                  subject: e.subject,
                  snippet: e.snippet,
                  date: e.date
                }))
              });
            }

            case 'search': {
              if (!parameters.query) {
                return JSON.stringify({
                  success: false,
                  error: 'Search query is required'
                });
              }
              
              const emails = await this.gmailService.searchEmails(userId, parameters.query, parameters.limit || 5);
              return JSON.stringify({
                success: true,
                query: parameters.query,
                count: emails.length,
                emails: emails.map(e => ({
                  id: e.id,
                  from: e.from,
                  subject: e.subject,
                  snippet: e.snippet
                }))
              });
            }

            case 'compose': {
              // This would typically return a draft or prepare for sending
              return JSON.stringify({
                success: true,
                draft: {
                  to: parameters.to,
                  subject: parameters.subject,
                  body: parameters.body
                },
                message: 'Email draft prepared. Use send operation to send it.'
              });
            }

            case 'send': {
              if (!parameters.to || !parameters.subject || !parameters.body) {
                return JSON.stringify({
                  success: false,
                  error: 'Missing required fields: to, subject, and body'
                });
              }
              
              const result = await this.gmailService.sendEmail(userId, {
                to: parameters.to,
                subject: parameters.subject,
                body: parameters.body
              });
              
              return JSON.stringify({
                success: true,
                messageId: result.id,
                message: 'Email sent successfully'
              });
            }

            case 'get_unread_count': {
              const unreadCount = await this.gmailService.getUnreadCount(userId);
              return JSON.stringify({
                success: true,
                unreadCount
              });
            }

            default:
              return JSON.stringify({
                success: false,
                error: `Unknown operation: ${operation}`
              });
          }
        } catch (error) {
          logger.error(`Email tool error (${operation}):`, error);
          return JSON.stringify({
            success: false,
            error: error.message
          });
        }
      }
    }));

    // Task Tool
    tools.push(new DynamicStructuredTool({
      name: 'task_operations',
      description: 'Manage tasks - create, view, update, complete tasks',
      schema: z.object({
        operation: z.enum(['create', 'view', 'update', 'complete', 'delete']),
        parameters: z.object({
          title: z.string().optional(),
          description: z.string().optional(),
          dueDate: z.string().optional(),
          priority: z.enum(['low', 'medium', 'high']).optional(),
          taskId: z.string().optional(),
          status: z.string().optional(),
          query: z.string().optional()
        }).optional()
      }),
      func: async ({ operation, parameters = {} }) => {
        try {
          // Check if Airtable integration is available
          const isActive = this.airtableService.isIntegrationActive ? 
            await this.airtableService.isIntegrationActive(userId) : false;
          
          if (!isActive) {
            return 'Task integration is not active. Please connect your Airtable account first.';
          }

          switch (operation) {
            case 'create': {
              if (!parameters.title) {
                return JSON.stringify({
                  success: false,
                  error: 'Task title is required'
                });
              }
              
              const task = await this.airtableService.createTask(userId, {
                title: parameters.title,
                description: parameters.description,
                dueDate: parameters.dueDate,
                priority: parameters.priority || 'medium'
              });
              
              return JSON.stringify({
                success: true,
                taskId: task.id,
                title: task.title,
                message: 'Task created successfully'
              });
            }

            case 'view': {
              const tasks = await this.airtableService.getTasks(userId, {
                query: parameters.query,
                status: parameters.status
              });
              
              return JSON.stringify({
                success: true,
                count: tasks.length,
                tasks: tasks.slice(0, 5).map(t => ({
                  id: t.id,
                  title: t.title,
                  status: t.status,
                  dueDate: t.dueDate,
                  priority: t.priority
                }))
              });
            }

            case 'update': {
              if (!parameters.taskId) {
                return JSON.stringify({
                  success: false,
                  error: 'Task ID is required for update'
                });
              }
              
              const updatedTask = await this.airtableService.updateTask(userId, parameters.taskId, {
                title: parameters.title,
                description: parameters.description,
                dueDate: parameters.dueDate,
                priority: parameters.priority,
                status: parameters.status
              });
              
              return JSON.stringify({
                success: true,
                taskId: updatedTask.id,
                message: 'Task updated successfully'
              });
            }

            case 'complete': {
              if (!parameters.taskId) {
                return JSON.stringify({
                  success: false,
                  error: 'Task ID is required to mark as complete'
                });
              }
              
              const result = await this.airtableService.completeTask(userId, parameters.taskId);
              return JSON.stringify({
                success: true,
                taskId: parameters.taskId,
                message: 'Task marked as complete'
              });
            }

            case 'delete': {
              if (!parameters.taskId) {
                return JSON.stringify({
                  success: false,
                  error: 'Task ID is required for deletion'
                });
              }
              
              const result = await this.airtableService.deleteTask(userId, parameters.taskId);
              return JSON.stringify({
                success: true,
                taskId: parameters.taskId,
                message: 'Task deleted successfully'
              });
            }

            default:
              return JSON.stringify({
                success: false,
                error: `Unknown operation: ${operation}`
              });
          }
        } catch (error) {
          logger.error(`Task tool error (${operation}):`, error);
          return JSON.stringify({
            success: false,
            error: error.message
          });
        }
      }
    }));

    // Weather Tool (mock implementation for now)
    tools.push(new DynamicStructuredTool({
      name: 'weather_info',
      description: 'Get weather information and forecasts',
      schema: z.object({
        location: z.string().optional(),
        days: z.number().optional()
      }),
      func: async ({ location = 'current location', days = 1 }) => {
        try {
          // Mock weather data for now
          const weatherData = {
            location,
            current: {
              temperature: 72,
              condition: 'Partly cloudy',
              humidity: 65,
              windSpeed: 10
            },
            forecast: days > 1 ? 'Sunny with occasional clouds for the next few days' : null
          };
          
          return JSON.stringify({
            success: true,
            ...weatherData
          });
        } catch (error) {
          logger.error('Weather tool error:', error);
          return JSON.stringify({
            success: false,
            error: error.message
          });
        }
      }
    }));

    // General Information Tool
    tools.push(new DynamicStructuredTool({
      name: 'general_assistant',
      description: 'Handle general questions, calculations, and information requests',
      schema: z.object({
        query: z.string(),
        context: z.string().optional()
      }),
      func: async ({ query, context }) => {
        try {
          // This tool can handle general queries that don't fit other categories
          return JSON.stringify({
            success: true,
            response: `I understand you're asking about: "${query}". Let me help you with that.`,
            requiresFollowUp: true
          });
        } catch (error) {
          logger.error('General assistant tool error:', error);
          return JSON.stringify({
            success: false,
            error: error.message
          });
        }
      }
    }));

    return tools;
  }

  /**
   * Create the agent executor for a user
   */
  async createAgentExecutor(userId) {
    try {
      // Get or create user memory
      if (!this.userMemory.has(userId)) {
        this.userMemory.set(userId, new ConversationSummaryMemory({
          llm: this.llm,
          memoryKey: 'chat_history',
          returnMessages: true
        }));
      }

      const memory = this.userMemory.get(userId);

      // Get user profile for personalization
      const userProfile = await this.personalizationManager.getUserProfile(userId);

      // Create the prompt with proper template escaping
      const systemPrompt = `You are a helpful AI voice assistant with access to the user's calendar, email, and task management systems.

User Profile:
${JSON.stringify(userProfile, null, 2).replace(/}/g, '}}').replace(/{/g, '{{')}

Your capabilities:
1. Calendar Management: View, create, update, delete events, find free time
2. Email Management: Read, search, compose, and send emails
3. Task Management: Create, view, update, complete tasks
4. Weather Information: Provide weather updates and forecasts
5. General Assistance: Answer questions and help with various requests

Guidelines:
- Be conversational and natural in your responses
- Keep responses concise for voice interaction (under 50 words when possible)
- Proactively suggest helpful actions based on context
- Ask for clarification when needed
- Maintain context across the conversation
- Be helpful and friendly`;

      const prompt = ChatPromptTemplate.fromMessages([
        ['system', systemPrompt],
        new MessagesPlaceholder('chat_history'),
        ['human', '{input}'],
        new MessagesPlaceholder('agent_scratchpad')
      ]);

      // Create tools
      const tools = this.createTools(userId);

      // Create the agent
      const agent = await createOpenAIFunctionsAgent({
        llm: this.llm,
        tools,
        prompt
      });

      // Create the executor
      const executor = new AgentExecutor({
        agent,
        tools,
        memory,
        verbose: process.env.NODE_ENV === 'development',
        maxIterations: 5,
        earlyStoppingMethod: 'generate',
        handleParsingErrors: true
      });

      return executor;

    } catch (error) {
      logger.error('Failed to create agent executor:', error);
      throw error;
    }
  }

  /**
   * Main entry point for processing requests
   */
  async processRequest(userId, userInput, context = {}) {
    try {
      logger.info(`Processing request for user ${userId}: "${userInput}"`);

      // Create or get the agent executor
      const executor = await this.createAgentExecutor(userId);

      // Update context
      const conversationContext = await this.contextManager.updateContext(userId, userInput, context);

      // Execute the agent
      const startTime = Date.now();
      const result = await executor.invoke({
        input: userInput,
        context: JSON.stringify(conversationContext)
      });
      const executionTime = Date.now() - startTime;

      logger.info(`Request processed in ${executionTime}ms`);

      // Log the interaction using database adapter
      await this.logInteraction(userId, userInput, result.output, {
        executionTime,
        toolsUsed: result.intermediateSteps?.map(step => step.action.tool) || []
      });

      return {
        success: true,
        response: result.output,
        audioData: null, // Will be generated by TTS service
        executionTime,
        toolsUsed: result.intermediateSteps?.map(step => step.action.tool) || [],
        context: conversationContext
      };

    } catch (error) {
      logger.error('Error processing request:', error);
      
      const fallbackResponse = await this.generateFallbackResponse(userInput, error);
      
      return {
        success: false,
        response: fallbackResponse,
        audioData: null,
        error: error.message
      };
    }
  }

  /**
   * Generate fallback response for errors
   */
  async generateFallbackResponse(userInput, error) {
    const errorResponses = [
      "I'm having trouble processing that request. Could you please try again?",
      "I encountered an issue. Let me try to help you differently. What would you like to do?",
      "Something went wrong on my end. Could you rephrase your request?",
      "I'm experiencing a technical issue. Please try again in a moment."
    ];

    // Log the error for debugging
    logger.error('Generating fallback response for error:', {
      userInput,
      error: error.message
    });

    return errorResponses[Math.floor(Math.random() * errorResponses.length)];
  }

  /**
   * Log interaction for analytics
   */
  async logInteraction(userId, input, response, metadata) {
    try {
      await this.db.logConversation({
        userId,
        userInput: input,
        assistantResponse: response,
        intent: metadata.intent || 'general',
        confidence: metadata.confidence || 1.0,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          coordinator: 'enhanced_langchain'
        }
      });
    } catch (error) {
      logger.error('Failed to log interaction:', error);
    }
  }

  /**
   * Clear user memory
   */
  clearUserMemory(userId) {
    if (this.userMemory.has(userId)) {
      this.userMemory.delete(userId);
      logger.info(`Memory cleared for user ${userId}`);
    }
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(userId, limit = 10) {
    return await this.db.getConversationHistory(userId, limit);
  }

  /**
   * Parse date and time helper
   */
  parseDateTime(dateString, timeString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      // Try to parse natural language
      const today = new Date();
      if (dateString.toLowerCase().includes('today')) {
        date.setTime(today.getTime());
      } else if (dateString.toLowerCase().includes('tomorrow')) {
        date.setTime(today.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    if (timeString) {
      const timeParts = timeString.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm)?/i);
      if (timeParts) {
        let hours = parseInt(timeParts[1]);
        const minutes = parseInt(timeParts[2] || '0');
        const period = timeParts[3]?.toLowerCase();

        if (period === 'pm' && hours !== 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;

        date.setHours(hours, minutes, 0, 0);
      }
    }

    return date;
  }

  /**
   * Get coordinator stats
   */
  getStats() {
    return {
      serviceName: this.serviceName,
      isConfigured: !!this.llm,
      provider: 'OpenRouter',
      model: 'openai/gpt-4o',
      activeUsers: this.userMemory.size,
      integrations: {
        calendar: this.calendarService.getStats(),
        email: this.gmailService.getStats(),
        tasks: this.airtableService.getStats ? this.airtableService.getStats() : { serviceName: 'airtable_tasks', isConfigured: false }
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test LLM
      const testResponse = await this.llm.invoke('Respond with OK');
      const llmHealthy = testResponse.content.toLowerCase().includes('ok');

      // Test database
      const dbHealthy = await this.db.isConnected();

      return {
        status: llmHealthy && dbHealthy ? 'healthy' : 'degraded',
        llm: llmHealthy,
        database: dbHealthy,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        llm: false,
        database: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = EnhancedLangChainCoordinator;