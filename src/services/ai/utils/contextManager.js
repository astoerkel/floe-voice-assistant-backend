const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');

class ContextManager {
  constructor() {
    this.maxHistoryLength = 10; // Keep last 10 exchanges in active context
    this.contextExpirationHours = 24; // Context expires after 24 hours of inactivity
  }

  /**
   * Update conversation context with new user input
   */
  async updateContext(userId, userInput, additionalContext = {}) {
    try {
      // Get existing context
      const existingContext = await this.getActiveContext(userId);
      
      // Build new context
      const updatedContext = {
        userId,
        currentTime: new Date().toISOString(),
        userInput,
        conversationHistory: await this.getRecentConversationHistory(userId),
        lastAction: existingContext?.lastAction || null,
        sessionData: this.mergeSessionData(existingContext?.sessionData, additionalContext),
        integrationStatus: await this.getIntegrationStatus(userId),
        upcomingEvents: await this.getUpcomingEvents(userId),
        pendingTasks: await this.getPendingTasks(userId),
        environmentContext: this.getEnvironmentContext(),
        conversationState: this.determineConversationState(existingContext, userInput),
        metadata: {
          ...existingContext?.metadata,
          lastUpdated: new Date(),
          inputLength: userInput.length,
          contextVersion: '1.0'
        }
      };

      // Store updated context
      await this.storeContext(userId, updatedContext);

      logger.debug(`Updated context for user ${userId}`);
      return updatedContext;

    } catch (error) {
      logger.error('Error updating context:', error);
      return this.createMinimalContext(userId, userInput, additionalContext);
    }
  }

  /**
   * Add assistant response to context
   */
  async addResponse(userId, response) {
    try {
      const context = await this.getActiveContext(userId);
      
      if (context) {
        context.lastAction = response.action || 'response';
        context.lastResponse = {
          text: response.text,
          timestamp: new Date(),
          intent: response.intent,
          actions: response.actions || []
        };
        
        await this.storeContext(userId, context);
      }

      logger.debug(`Added response to context for user ${userId}`);

    } catch (error) {
      logger.error('Error adding response to context:', error);
    }
  }

  /**
   * Get active context for a user
   */
  async getActiveContext(userId) {
    try {
      const context = await prisma.conversationContext.findFirst({
        where: {
          userId,
          expiresAt: {
            gt: new Date()
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      if (!context) {
        return null;
      }

      return {
        ...context.data,
        id: context.id,
        createdAt: context.createdAt,
        updatedAt: context.updatedAt
      };

    } catch (error) {
      logger.error('Error getting active context:', error);
      return null;
    }
  }

  /**
   * Get recent conversation history
   */
  async getRecentConversationHistory(userId) {
    try {
      const history = await prisma.conversationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: this.maxHistoryLength,
        select: {
          userInput: true,
          assistantResponse: true,
          intent: true,
          confidence: true,
          createdAt: true,
          actions: true
        }
      });

      return history.reverse().map(exchange => ({
        userInput: exchange.userInput,
        response: exchange.assistantResponse,
        intent: exchange.intent,
        confidence: exchange.confidence,
        timestamp: exchange.createdAt,
        actions: exchange.actions || []
      }));

    } catch (error) {
      logger.error('Error getting conversation history:', error);
      return [];
    }
  }

  /**
   * Get integration status for context
   */
  async getIntegrationStatus(userId) {
    try {
      const integrations = await prisma.integration.findMany({
        where: {
          userId,
          isActive: true
        },
        select: {
          type: true,
          isActive: true,
          lastSyncAt: true
        }
      });

      const status = {
        calendar: false,
        email: false,
        tasks: false
      };

      integrations.forEach(integration => {
        switch (integration.type) {
          case 'google_calendar':
            status.calendar = true;
            break;
          case 'gmail':
            status.email = true;
            break;
          case 'airtable_tasks':
            status.tasks = true;
            break;
        }
      });

      return status;

    } catch (error) {
      logger.error('Error getting integration status:', error);
      return { calendar: false, email: false, tasks: false };
    }
  }

  /**
   * Get upcoming events for context awareness
   */
  async getUpcomingEvents(userId) {
    try {
      // Check if calendar integration is active
      const calendarIntegration = await prisma.integration.findUnique({
        where: {
          userId_type: {
            userId,
            type: 'google_calendar'
          }
        }
      });

      if (!calendarIntegration || !calendarIntegration.isActive) {
        return [];
      }

      // Get events from the next 24 hours
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // This would integrate with Google Calendar service
      // For now, return empty array to avoid circular dependencies
      return [];

    } catch (error) {
      logger.error('Error getting upcoming events:', error);
      return [];
    }
  }

  /**
   * Get pending tasks for context awareness
   */
  async getPendingTasks(userId) {
    try {
      // Check if tasks integration is active
      const taskIntegration = await prisma.integration.findUnique({
        where: {
          userId_type: {
            userId,
            type: 'airtable_tasks'
          }
        }
      });

      if (!taskIntegration || !taskIntegration.isActive) {
        return [];
      }

      // This would integrate with Airtable service
      // For now, return empty array to avoid circular dependencies
      return [];

    } catch (error) {
      logger.error('Error getting pending tasks:', error);
      return [];
    }
  }

  /**
   * Get environment context (time, date, etc.)
   */
  getEnvironmentContext() {
    const now = new Date();
    
    return {
      currentTime: now.toISOString(),
      timeOfDay: this.getTimeOfDay(now.getHours()),
      dayOfWeek: this.getDayOfWeek(now.getDay()),
      isWeekend: now.getDay() === 0 || now.getDay() === 6,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: Intl.DateTimeFormat().resolvedOptions().locale
    };
  }

  /**
   * Determine conversation state based on context and input
   */
  determineConversationState(existingContext, userInput) {
    if (!existingContext) {
      return 'new_conversation';
    }

    const timeSinceLastUpdate = new Date() - new Date(existingContext.metadata?.lastUpdated || existingContext.updatedAt);
    const minutesSinceLastUpdate = timeSinceLastUpdate / (1000 * 60);

    // If more than 30 minutes, consider it a new conversation
    if (minutesSinceLastUpdate > 30) {
      return 'resumed_conversation';
    }

    // Check if user is following up on a previous action
    if (existingContext.lastAction && this.isFollowUpInput(userInput, existingContext.lastAction)) {
      return 'follow_up';
    }

    // Check if user is asking for clarification
    if (this.isClarificationInput(userInput)) {
      return 'clarification';
    }

    return 'continuing_conversation';
  }

  /**
   * Merge session data from existing context and new input
   */
  mergeSessionData(existingData = {}, newData = {}) {
    return {
      ...existingData,
      ...newData,
      lastMerged: new Date()
    };
  }

  /**
   * Store context in database
   */
  async storeContext(userId, context) {
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.contextExpirationHours);

      await prisma.conversationContext.upsert({
        where: {
          userId
        },
        update: {
          data: context,
          expiresAt,
          updatedAt: new Date()
        },
        create: {
          userId,
          data: context,
          expiresAt,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

    } catch (error) {
      logger.error('Error storing context:', error);
      throw error;
    }
  }

  /**
   * Create minimal context for error cases
   */
  createMinimalContext(userId, userInput, additionalContext) {
    return {
      userId,
      currentTime: new Date().toISOString(),
      userInput,
      conversationHistory: [],
      lastAction: null,
      sessionData: additionalContext || {},
      integrationStatus: { calendar: false, email: false, tasks: false },
      upcomingEvents: [],
      pendingTasks: [],
      environmentContext: this.getEnvironmentContext(),
      conversationState: 'new_conversation',
      metadata: {
        lastUpdated: new Date(),
        inputLength: userInput.length,
        contextVersion: '1.0',
        isMinimal: true
      }
    };
  }

  /**
   * Clear expired contexts
   */
  async clearExpiredContexts() {
    try {
      const result = await prisma.conversationContext.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      logger.info(`Cleared ${result.count} expired conversation contexts`);
      return result.count;

    } catch (error) {
      logger.error('Error clearing expired contexts:', error);
      return 0;
    }
  }

  /**
   * Get context summary for a user
   */
  async getContextSummary(userId) {
    try {
      const context = await this.getActiveContext(userId);
      
      if (!context) {
        return {
          hasActiveContext: false,
          conversationState: 'new_conversation',
          historyLength: 0,
          integrationsConnected: 0
        };
      }

      return {
        hasActiveContext: true,
        conversationState: context.conversationState,
        historyLength: context.conversationHistory?.length || 0,
        integrationsConnected: Object.values(context.integrationStatus || {}).filter(Boolean).length,
        lastAction: context.lastAction,
        timeOfDay: context.environmentContext?.timeOfDay,
        sessionAge: this.getSessionAge(context.createdAt)
      };

    } catch (error) {
      logger.error('Error getting context summary:', error);
      return {
        hasActiveContext: false,
        conversationState: 'error',
        historyLength: 0,
        integrationsConnected: 0
      };
    }
  }

  /**
   * Helper methods
   */
  getTimeOfDay(hour) {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  getDayOfWeek(dayIndex) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayIndex];
  }

  isFollowUpInput(input, lastAction) {
    const followUpKeywords = ['yes', 'no', 'ok', 'sure', 'confirm', 'cancel', 'proceed', 'continue'];
    const inputLower = input.toLowerCase();
    return followUpKeywords.some(keyword => inputLower.includes(keyword)) && 
           input.length < 20; // Likely a short follow-up response
  }

  isClarificationInput(input) {
    const clarificationKeywords = ['what', 'how', 'when', 'where', 'why', 'explain', 'clarify', 'meaning'];
    const inputLower = input.toLowerCase();
    return clarificationKeywords.some(keyword => inputLower.startsWith(keyword)) ||
           inputLower.includes('what do you mean') ||
           inputLower.includes('can you explain');
  }

  getSessionAge(createdAt) {
    const ageMs = new Date() - new Date(createdAt);
    const ageMinutes = Math.floor(ageMs / (1000 * 60));
    
    if (ageMinutes < 60) {
      return `${ageMinutes} minutes`;
    } else {
      const ageHours = Math.floor(ageMinutes / 60);
      return `${ageHours} hours`;
    }
  }

  /**
   * Reset context for a user (useful for testing or user request)
   */
  async resetContext(userId) {
    try {
      await prisma.conversationContext.deleteMany({
        where: { userId }
      });

      logger.info(`Reset conversation context for user ${userId}`);
      return { success: true };

    } catch (error) {
      logger.error('Error resetting context:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get context statistics
   */
  async getContextStats() {
    try {
      const [totalContexts, activeContexts, expiredCount] = await Promise.all([
        prisma.conversationContext.count(),
        prisma.conversationContext.count({
          where: {
            expiresAt: {
              gt: new Date()
            }
          }
        }),
        prisma.conversationContext.count({
          where: {
            expiresAt: {
              lt: new Date()
            }
          }
        })
      ]);

      return {
        total: totalContexts,
        active: activeContexts,
        expired: expiredCount,
        expirationHours: this.contextExpirationHours,
        maxHistoryLength: this.maxHistoryLength
      };

    } catch (error) {
      logger.error('Error getting context stats:', error);
      return {
        total: 0,
        active: 0,
        expired: 0,
        expirationHours: this.contextExpirationHours,
        maxHistoryLength: this.maxHistoryLength
      };
    }
  }
}

module.exports = ContextManager;