// Legacy imports (keeping for backward compatibility)  
const intentClassifier = require('../ai/intentClassifier');
const legacyCalendarAgent = require('./calendarAgent');
const legacyEmailAgent = require('./emailAgent');
const legacyTaskAgent = require('./taskAgent');
const weatherAgent = require('./weatherAgent');

// New LangChain coordinator system
const VoiceAssistantCoordinator = require('../ai/coordinator');

const { prisma } = require('../../config/database');
const logger = require('../../utils/logger');

class CoordinatorAgent {
  constructor() {
    this.agentName = 'coordinator';
    this.specializedAgents = new Map();
    this.conversationCache = new Map();
    
    // Initialize new LangChain coordinator
    this.voiceAssistantCoordinator = new VoiceAssistantCoordinator();
    
    this.initializeSpecializedAgents();
    
    logger.info('CoordinatorAgent initialized with new LangChain coordinator');
  }

  initializeSpecializedAgents() {
    // Register legacy specialized agents for fallback
    this.registerSpecializedAgent('calendar', legacyCalendarAgent);
    this.registerSpecializedAgent('email', legacyEmailAgent);
    this.registerSpecializedAgent('task', legacyTaskAgent);
    this.registerSpecializedAgent('weather', weatherAgent);
    
    logger.info('Legacy specialized agents initialized:', Array.from(this.specializedAgents.keys()));
  }

  async registerSpecializedAgent(name, agent) {
    this.specializedAgents.set(name, agent);
    logger.info(`Registered specialized agent: ${name}`);
  }

  async processVoiceCommand(userId, input, context = {}) {
    let voiceCommand;
    try {
      const startTime = Date.now();
      
      // Store the voice command in database
      voiceCommand = await prisma.voiceCommand.create({
        data: {
          userId,
          text: input,
          status: 'processing',
          agentUsed: this.agentName,
          metadata: context
        }
      });

      logger.info(`Processing voice command for user ${userId}:`, {
        commandId: voiceCommand.id,
        input: input.substring(0, 100)
      });

      // Try new LangChain coordinator first
      try {
        const coordinatorResult = await this.voiceAssistantCoordinator.processRequest(userId, input, context);
        
        if (coordinatorResult.success) {
          const executionTime = Date.now() - startTime;

          // Update voice command with response
          await prisma.voiceCommand.update({
            where: { id: voiceCommand.id },
            data: {
              response: coordinatorResult.response,
              status: 'completed',
              executionTime,
              agentUsed: coordinatorResult.intent || 'coordinator',
              intent: coordinatorResult.intent
            }
          });

          logger.info(`Voice command completed with new coordinator for user ${userId}:`, {
            commandId: voiceCommand.id,
            intent: coordinatorResult.intent,
            agentUsed: coordinatorResult.intent || 'coordinator',
            executionTime
          });

          return {
            success: true,
            response: coordinatorResult.response,
            intent: coordinatorResult.intent,
            confidence: coordinatorResult.confidence,
            agentUsed: coordinatorResult.intent || 'coordinator',
            executionTime,
            actions: coordinatorResult.actions || [],
            suggestions: [],
            audioData: coordinatorResult.audioData
          };
        } else {
          logger.warn('New coordinator failed, falling back to legacy system:', coordinatorResult.error);
          throw new Error(`Coordinator failed: ${coordinatorResult.error}`);
        }
      } catch (coordinatorError) {
        logger.warn('New LangChain coordinator failed, falling back to legacy system:', coordinatorError.message);
        
        // Fallback to legacy system
        return await this.processWithLegacySystem(userId, input, context, voiceCommand, startTime);
      }
    } catch (error) {
      logger.error('Coordinator agent processing failed:', error);
      
      // Update command with error
      if (voiceCommand?.id) {
        await prisma.voiceCommand.update({
          where: { id: voiceCommand.id },
          data: {
            status: 'failed',
            error: error.message
          }
        });
      }

      return {
        success: false,
        error: error.message,
        response: "I'm sorry, I'm having trouble processing that right now. Could you please try again?",
        agentUsed: this.agentName
      };
    }
  }

  async processWithLegacySystem(userId, input, context, voiceCommand, startTime) {
    try {
      // Classify intent using legacy system
      const intentResult = await intentClassifier.classifyIntent(input);
      
      // Update command with intent
      await prisma.voiceCommand.update({
        where: { id: voiceCommand.id },
        data: { intent: intentResult.intent }
      });

      let response;
      let agentUsed = this.agentName;

      // Route to specialized agent if confidence is high enough
      if (intentResult.confidence > 0.6 && intentResult.intent !== 'general') {
        const specializedAgent = this.specializedAgents.get(intentResult.intent);
        
        if (specializedAgent) {
          try {
            response = await specializedAgent.processCommand(userId, input, context);
            agentUsed = intentResult.intent;
          } catch (error) {
            logger.error(`Specialized agent ${intentResult.intent} failed:`, error);
            // Fall back to coordinator
            response = await this.handleGeneralCommand(userId, input, context);
          }
        } else {
          // Agent not registered, handle with coordinator
          response = await this.handleGeneralCommand(userId, input, context);
        }
      } else {
        // Handle with coordinator
        response = await this.handleGeneralCommand(userId, input, context);
      }

      const executionTime = Date.now() - startTime;

      // Update voice command with response
      await prisma.voiceCommand.update({
        where: { id: voiceCommand.id },
        data: {
          response: response.text,
          status: 'completed',
          executionTime,
          agentUsed
        }
      });

      // Update conversation history
      await this.updateConversationHistory(userId, input, response.text, {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        agentUsed,
        executionTime
      });

      logger.info(`Voice command completed with legacy system for user ${userId}:`, {
        commandId: voiceCommand.id,
        intent: intentResult.intent,
        agentUsed,
        executionTime
      });

      return {
        success: true,
        response: response.text,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        agentUsed,
        executionTime,
        actions: response.actions || [],
        suggestions: response.suggestions || []
      };
    } catch (error) {
      logger.error('Legacy system processing failed:', error);
      throw error;
    }
  }

  async handleGeneralCommand(userId, input, context) {
    try {
      // Use the new VoiceAssistantCoordinator for general processing
      const result = await this.voiceAssistantCoordinator.processRequest(userId, input, context);
      
      if (result.success) {
        return {
          text: result.response,
          actions: result.actions || [],
          suggestions: this.generateSuggestions(input)
        };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      logger.error('General command handling failed:', error);
      
      // Fallback response
      return {
        text: this.generateFallbackResponse(input),
        actions: [],
        suggestions: []
      };
    }
  }

  generateFallbackResponse(input) {
    const fallbackResponses = [
      "I'm not sure I understand that completely. Could you rephrase your question?",
      "I'm having trouble with that request. Could you try asking in a different way?",
      "I didn't quite catch that. Could you please repeat your request?",
      "I'm not sure how to help with that. Can you provide more details?",
      "That's not something I can help with right now. Is there anything else I can assist you with?"
    ];
    
    return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
  }

  generateSuggestions(input) {
    const suggestions = [
      "Try asking about your calendar",
      "Ask me to check your emails",
      "Create a task or reminder",
      "Check the weather forecast",
      "Schedule a meeting"
    ];
    
    return suggestions.slice(0, 3);
  }

  async updateConversationHistory(userId, input, response, metadata) {
    try {
      // Get or create active conversation
      let conversation = await prisma.conversation.findFirst({
        where: {
          userId,
          isActive: true
        },
        orderBy: { updatedAt: 'desc' }
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            userId,
            title: this.generateConversationTitle(input),
            messages: [],
            context: {}
          }
        });
      }

      // Add new messages
      const newMessages = [
        {
          id: `user_${Date.now()}`,
          type: 'user',
          content: input,
          timestamp: new Date().toISOString(),
          metadata: { source: 'voice' }
        },
        {
          id: `assistant_${Date.now()}`,
          type: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
          metadata
        }
      ];

      const updatedMessages = [...conversation.messages, ...newMessages];

      // Keep only last 50 messages to prevent database bloat
      const trimmedMessages = updatedMessages.slice(-50);

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          messages: trimmedMessages,
          context: {
            ...conversation.context,
            lastIntent: metadata.intent,
            lastAgentUsed: metadata.agentUsed
          }
        }
      });

      // Cache conversation for quick access
      this.conversationCache.set(userId, conversation);
    } catch (error) {
      logger.error('Failed to update conversation history:', error);
    }
  }

  generateConversationTitle(input) {
    const words = input.split(' ').slice(0, 5).join(' ');
    return words.length > 30 ? words.substring(0, 30) + '...' : words;
  }

  async getConversationHistory(userId, limit = 20) {
    try {
      const conversations = await prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          messages: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return conversations;
    } catch (error) {
      logger.error('Failed to get conversation history:', error);
      return [];
    }
  }

  async clearConversationHistory(userId) {
    try {
      await prisma.conversation.updateMany({
        where: { userId },
        data: { isActive: false }
      });

      // Clear memory from VoiceAssistantCoordinator if needed
      // The new coordinator manages its own conversation context
      
      // Clear cache
      this.conversationCache.delete(userId);

      logger.info(`Cleared conversation history for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear conversation history:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserContext(userId) {
    try {
      // Get recent conversation
      const conversation = await prisma.conversation.findFirst({
        where: { userId, isActive: true },
        orderBy: { updatedAt: 'desc' }
      });

      // Get user integrations
      const integrations = await prisma.integration.findMany({
        where: { userId, isActive: true },
        select: { type: true, createdAt: true }
      });

      // Get recent voice commands for pattern analysis
      const recentCommands = await prisma.voiceCommand.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { text: true, intent: true, agentUsed: true }
      });

      return {
        hasActiveConversation: !!conversation,
        availableIntegrations: integrations.map(i => i.type),
        recentIntents: recentCommands.map(c => c.intent),
        preferredAgents: this.getPreferredAgents(recentCommands),
        conversationContext: conversation?.context || {}
      };
    } catch (error) {
      logger.error('Failed to get user context:', error);
      return {};
    }
  }

  getPreferredAgents(recentCommands) {
    const agentCounts = {};
    recentCommands.forEach(cmd => {
      if (cmd.agentUsed) {
        agentCounts[cmd.agentUsed] = (agentCounts[cmd.agentUsed] || 0) + 1;
      }
    });

    return Object.entries(agentCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([agent]) => agent);
  }

  getStats() {
    return {
      agentName: this.agentName,
      registeredAgents: Array.from(this.specializedAgents.keys()),
      cachedConversations: this.conversationCache.size,
      lastProcessedAt: new Date().toISOString()
    };
  }
}

module.exports = new CoordinatorAgent();