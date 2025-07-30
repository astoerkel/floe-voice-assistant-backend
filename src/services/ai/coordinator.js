const { ChatOpenAI } = require('@langchain/openai');
const { SystemMessage, HumanMessage } = require('langchain/schema');
const { LLMChain } = require('langchain/chains');
const { PromptTemplate } = require('langchain/prompts');
const logger = require('../../utils/logger');
const { prisma } = require('../../config/database');

// Import existing service integrations
const GoogleIntegrationFactory = require('../integrations/google/factory');
const AirtableTasksIntegration = require('../integrations/airtable/tasks');

// Import agent utilities
const SystemPromptGenerator = require('./utils/systemPromptGenerator');
const PersonalizationManager = require('./utils/personalizationManager');
const ContextManager = require('./utils/contextManager');

// Import specialized agents
const CalendarAgent = require('./agents/calendarAgent');
const TaskAgent = require('./agents/taskAgent');
const EmailAgent = require('./agents/emailAgent');
const GeneralAgent = require('./agents/generalAgent');

class VoiceAssistantCoordinator {
  constructor() {
    this.serviceName = 'voice_assistant_coordinator';
    
    // Initialize primary LLM (OpenRouter) with OpenAI fallback for production
    this.initializeLLMs();

    // Initialize service integrations using factories
    this.calendarService = GoogleIntegrationFactory.createCalendarService();
    this.gmailService = GoogleIntegrationFactory.createGmailService();
    this.airtableService = AirtableTasksIntegration;

    // Initialize utilities
    this.systemPromptGenerator = new SystemPromptGenerator();
    this.personalizationManager = new PersonalizationManager();
    this.contextManager = new ContextManager();

    // Initialize specialized agents
    this.agents = {
      calendar: new CalendarAgent(this.calendarService),
      task: new TaskAgent(this.airtableService),
      email: new EmailAgent(this.gmailService),
      general: new GeneralAgent()
    };

    logger.info('VoiceAssistantCoordinator initialized successfully');
  }

  /**
   * Initialize LLMs with OpenRouter primary and OpenAI fallback for production
   */
  initializeLLMs() {
    try {
      // Primary LLM: OpenRouter GPT-4o
      if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.startsWith('sk-or-')) {
        this.primaryLLM = new ChatOpenAI({
          modelName: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 2000,
          openAIApiKey: process.env.OPENROUTER_API_KEY,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://floe.cognetica.de',
              'X-Title': process.env.OPENROUTER_SITE_NAME || 'VoiceAssistant'
            }
          }
        });
        logger.info('OpenRouter LLM initialized as primary');
      }

      // Fallback LLM: Direct OpenAI GPT-4o
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-proj-')) {
        this.fallbackLLM = new ChatOpenAI({
          modelName: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 2000,
          openAIApiKey: process.env.OPENAI_API_KEY
          // No custom baseURL - direct OpenAI API
        });
        logger.info('OpenAI LLM initialized as fallback');
      }

      // Set the active LLM (prefer primary, fallback to fallback, error if none)
      this.llm = this.primaryLLM || this.fallbackLLM;
      
      if (!this.llm) {
        throw new Error('No valid LLM configuration found. Please set OPENROUTER_API_KEY or OPENAI_API_KEY');
      }

      const usingProvider = this.primaryLLM ? 'OpenRouter' : 'OpenAI Direct';
      logger.info(`LLM initialized using: ${usingProvider}`);

    } catch (error) {
      logger.error('Failed to initialize LLMs:', error);
      throw error;
    }
  }

  /**
   * Execute LLM call with automatic fallback to secondary provider
   */
  async callLLMWithFallback(chain, params) {
    try {
      // Try primary LLM first
      if (this.primaryLLM) {
        const primaryChain = chain.llm === this.llm ? chain : new LLMChain({
          llm: this.primaryLLM,
          prompt: chain.prompt
        });
        const result = await primaryChain.call(params);
        logger.debug('Primary LLM (OpenRouter) success');
        return result;
      }
    } catch (primaryError) {
      logger.warn('Primary LLM failed, trying fallback:', primaryError.message);
      
      // Try fallback LLM
      if (this.fallbackLLM) {
        try {
          const fallbackChain = new LLMChain({
            llm: this.fallbackLLM,
            prompt: chain.prompt
          });
          const result = await fallbackChain.call(params);
          logger.info('Fallback LLM (OpenAI Direct) success');
          return result;
        } catch (fallbackError) {
          logger.error('Both primary and fallback LLMs failed:', fallbackError.message);
          throw fallbackError;
        }
      }
      
      throw primaryError;
    }
  }

  /**
   * Main entry point for processing voice assistant requests
   */
  async processRequest(userId, userInput, context = {}) {
    try {
      logger.info(`Processing request for user ${userId}: "${userInput}"`);

      // Get user personalization data
      const userProfile = await this.personalizationManager.getUserProfile(userId);
      
      // Update context with current conversation
      const conversationContext = await this.contextManager.updateContext(userId, userInput, context);

      // Generate system prompt with personalization
      const systemPrompt = await this.systemPromptGenerator.generateSystemPrompt(userProfile, conversationContext);

      // Classify intent and determine which agent should handle the request
      const intentAnalysis = await this.classifyIntent(userInput, conversationContext);
      
      logger.info(`Intent classified as: ${intentAnalysis.intent} (confidence: ${intentAnalysis.confidence})`);

      // Route to appropriate agent
      let response;
      switch (intentAnalysis.intent) {
        case 'calendar':
          response = await this.agents.calendar.handleRequest(userId, userInput, conversationContext, systemPrompt);
          break;
        case 'task':
          response = await this.agents.task.handleRequest(userId, userInput, conversationContext, systemPrompt);
          break;
        case 'email':
          response = await this.agents.email.handleRequest(userId, userInput, conversationContext, systemPrompt);
          break;
        default:
          response = await this.agents.general.handleRequest(userId, userInput, conversationContext, systemPrompt);
      }

      // Update conversation context with response
      await this.contextManager.addResponse(userId, response);

      // Log successful processing
      await this.logInteraction(userId, userInput, response, intentAnalysis);

      return {
        success: true,
        response: response.text,
        audioData: response.audioData,
        intent: intentAnalysis.intent,
        confidence: intentAnalysis.confidence,
        actions: response.actions || [],
        context: response.context || {}
      };

    } catch (error) {
      logger.error('Error processing voice assistant request:', error);
      
      // Generate fallback response
      const fallbackResponse = await this.generateFallbackResponse(userInput, error);
      
      return {
        success: false,
        response: fallbackResponse.text,
        audioData: fallbackResponse.audioData,
        error: error.message,
        intent: 'error',
        confidence: 0
      };
    }
  }

  /**
   * Classify user intent using LLM with keyword-based fallback
   */
  async classifyIntent(userInput, context) {
    try {
      const classificationPrompt = PromptTemplate.fromTemplate(`
        Analyze the following user input and classify the intent. Consider the conversation context.

        User Input: "{input}"
        
        Conversation Context: {context}

        Available Intents:
        - calendar: Scheduling, viewing, modifying calendar events, finding free time
        - task: Creating, viewing, updating, completing tasks and to-dos
        - email: Reading, sending, replying to emails, managing inbox
        - general: General questions, small talk, information requests, other actions

        Respond with a JSON object containing:
        {{
          "intent": "one of the above intents",
          "confidence": 0.0-1.0,
          "reasoning": "brief explanation of why this intent was chosen",
          "entities": ["any specific entities or keywords detected"]
        }}
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: classificationPrompt
      });

      const result = await this.callLLMWithFallback(chain, {
        input: userInput,
        context: JSON.stringify(context, null, 2)
      });

      try {
        const parsed = JSON.parse(result.text);
        return {
          intent: parsed.intent || 'general',
          confidence: parsed.confidence || 0.5,
          reasoning: parsed.reasoning || 'Default classification',
          entities: parsed.entities || []
        };
      } catch (parseError) {
        logger.warn('Failed to parse intent classification response, using keyword fallback');
        return this.keywordBasedClassification(userInput);
      }

    } catch (error) {
      logger.error('Error classifying intent, using keyword fallback:', error);
      return this.keywordBasedClassification(userInput);
    }
  }

  /**
   * Simple keyword-based intent classification fallback
   */
  keywordBasedClassification(userInput) {
    const inputLower = userInput.toLowerCase();
    
    // Calendar keywords
    const calendarKeywords = ['schedule', 'meeting', 'calendar', 'event', 'appointment', 'book', 'free time'];
    if (calendarKeywords.some(keyword => inputLower.includes(keyword))) {
      return {
        intent: 'calendar',
        confidence: 0.7,
        reasoning: 'Keyword-based classification for calendar',
        entities: []
      };
    }
    
    // Task keywords
    const taskKeywords = ['task', 'todo', 'reminder', 'complete', 'finish', 'deadline', 'project'];
    if (taskKeywords.some(keyword => inputLower.includes(keyword))) {
      return {
        intent: 'task',
        confidence: 0.7,
        reasoning: 'Keyword-based classification for tasks',
        entities: []
      };
    }
    
    // Email keywords
    const emailKeywords = ['email', 'message', 'send', 'reply', 'inbox', 'unread', 'mail'];
    if (emailKeywords.some(keyword => inputLower.includes(keyword))) {
      return {
        intent: 'email',
        confidence: 0.7,
        reasoning: 'Keyword-based classification for email',
        entities: []
      };
    }

    // Default to general with higher confidence for keyword fallback
    return {
      intent: 'general',
      confidence: 0.8,
      reasoning: 'Keyword-based fallback to general',
      entities: []
    };
  }

  /**
   * Generate fallback response for errors
   */
  async generateFallbackResponse(userInput, error) {
    try {
      const fallbackPrompt = PromptTemplate.fromTemplate(`
        The user said: "{input}"
        
        There was an error processing their request: {error}
        
        Generate a helpful, voice-optimized response that:
        1. Acknowledges their request
        2. Politely explains there was an issue
        3. Suggests they try again or rephrase
        4. Maintains a friendly, conversational tone
        5. Keeps the response concise (under 50 words)
        
        Response:
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: fallbackPrompt
      });

      const result = await this.callLLMWithFallback(chain, {
        input: userInput,
        error: error.message
      });

      return {
        text: result.text.trim(),
        audioData: null // Will be generated by TTS service
      };

    } catch (fallbackError) {
      logger.error('Error generating fallback response:', fallbackError);
      return {
        text: "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.",
        audioData: null
      };
    }
  }

  /**
   * Log interaction for analytics and learning
   */
  async logInteraction(userId, input, response, intentAnalysis) {
    try {
      await prisma.conversationLog.create({
        data: {
          userId: userId,
          userInput: input,
          assistantResponse: response.text,
          intent: intentAnalysis.intent,
          confidence: intentAnalysis.confidence,
          reasoning: intentAnalysis.reasoning,
          entities: intentAnalysis.entities,
          actions: response.actions || [],
          metadata: {
            responseTime: Date.now(),
            hasAudio: !!response.audioData,
            agentUsed: response.agentUsed || 'unknown'
          }
        }
      });
    } catch (error) {
      logger.error('Failed to log interaction:', error);
      // Don't throw - logging failure shouldn't break the main flow
    }
  }

  /**
   * Get conversation history for a user
   */
  async getConversationHistory(userId, limit = 10) {
    try {
      const history = await prisma.conversationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          userInput: true,
          assistantResponse: true,
          intent: true,
          confidence: true,
          createdAt: true,
          actions: true
        }
      });

      return history.reverse(); // Return in chronological order
    } catch (error) {
      logger.error('Failed to get conversation history:', error);
      return [];
    }
  }

  /**
   * Check if required integrations are available for a user
   */
  async checkIntegrationStatus(userId) {
    try {
      const [calendarActive, emailActive, tasksActive] = await Promise.all([
        this.calendarService.isIntegrationActive(userId),
        this.gmailService.isIntegrationActive(userId),
        this.airtableService.isIntegrationActive ? this.airtableService.isIntegrationActive(userId) : false
      ]);

      return {
        calendar: calendarActive,
        email: emailActive,
        tasks: tasksActive,
        hasAnyIntegration: calendarActive || emailActive || tasksActive
      };
    } catch (error) {
      logger.error('Failed to check integration status:', error);
      return {
        calendar: false,
        email: false,
        tasks: false,
        hasAnyIntegration: false
      };
    }
  }

  /**
   * Get coordinator statistics and health status
   */
  getStats() {
    return {
      serviceName: this.serviceName,
      isConfigured: !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY),
      model: 'gpt-4o',
      provider: process.env.OPENROUTER_API_KEY ? 'OpenRouter' : 'OpenAI',
      availableAgents: Object.keys(this.agents),
      integrations: {
        calendar: this.calendarService.getStats(),
        email: this.gmailService.getStats(),
        tasks: this.airtableService.getStats ? this.airtableService.getStats() : { serviceName: 'airtable_tasks', isConfigured: false }
      }
    };
  }

  /**
   * Health check for the coordinator and all dependencies
   */
  async healthCheck() {
    try {
      // Test LLM connection
      const testPrompt = PromptTemplate.fromTemplate("Respond with 'OK' if you can process this message.");
      const chain = new LLMChain({ llm: this.llm, prompt: testPrompt });
      const testResult = await chain.call({ text: "test" });
      
      const llmHealthy = testResult.text.toLowerCase().includes('ok');

      return {
        status: llmHealthy ? 'healthy' : 'degraded',
        llm: llmHealthy,
        agents: Object.keys(this.agents).length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        llm: false,
        agents: 0,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = VoiceAssistantCoordinator;