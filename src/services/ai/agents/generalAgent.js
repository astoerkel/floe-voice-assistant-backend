const { ChatOpenAI } = require('@langchain/openai');
const { LLMChain } = require('langchain/chains');
const { PromptTemplate } = require('langchain/prompts');
const logger = require('../../../utils/logger');

class GeneralAgent {
  constructor() {
    this.agentName = 'GeneralAgent';
    
    // Initialize LLM with production configuration (OpenRouter primary, OpenAI fallback)
    this.initializeLLMs();

    logger.info('GeneralAgent initialized');
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
          maxTokens: 1500,
          openAIApiKey: process.env.OPENROUTER_API_KEY,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://floe.cognetica.de',
              'X-Title': 'Voice Assistant General'
            }
          }
        });
        logger.debug('GeneralAgent: OpenRouter LLM initialized as primary');
      }

      // Fallback LLM: Direct OpenAI GPT-4o
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-proj-')) {
        this.fallbackLLM = new ChatOpenAI({
          modelName: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 1500,
          openAIApiKey: process.env.OPENAI_API_KEY
          // No custom baseURL - direct OpenAI API
        });
        logger.debug('GeneralAgent: OpenAI LLM initialized as fallback');
      }

      // Set the active LLM (prefer primary, fallback to fallback)
      this.llm = this.primaryLLM || this.fallbackLLM;
      
      if (!this.llm) {
        throw new Error('GeneralAgent: No valid LLM configuration found');
      }

    } catch (error) {
      logger.error('GeneralAgent: Failed to initialize LLMs:', error);
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
        return result;
      }
    } catch (primaryError) {
      // Try fallback LLM
      if (this.fallbackLLM) {
        try {
          const fallbackChain = new LLMChain({
            llm: this.fallbackLLM,
            prompt: chain.prompt
          });
          const result = await fallbackChain.call(params);
          logger.debug('GeneralAgent: Fallback LLM success');
          return result;
        } catch (fallbackError) {
          logger.error('GeneralAgent: Both LLMs failed:', fallbackError.message);
          throw fallbackError;
        }
      }
      
      throw primaryError;
    }
  }

  /**
   * Handle general queries and conversations
   */
  async handleRequest(userId, userInput, context, systemPrompt) {
    try {
      logger.info(`GeneralAgent handling request for user ${userId}: "${userInput}"`);

      // Classify the type of general request
      const requestType = await this.classifyGeneralRequest(userInput, context);
      
      logger.debug(`General request type:`, requestType);

      // Handle based on request type
      let result;
      switch (requestType.category) {
        case 'information':
          result = await this.handleInformationRequest(userId, userInput, context, systemPrompt);
          break;
        case 'conversation':
          result = await this.handleConversationalRequest(userId, userInput, context, systemPrompt);
          break;
        case 'assistance':
          result = await this.handleAssistanceRequest(userId, userInput, context, systemPrompt);
          break;
        case 'planning':
          result = await this.handlePlanningRequest(userId, userInput, context, systemPrompt);
          break;
        case 'weather':
          result = await this.handleWeatherRequest(userId, userInput, context, systemPrompt);
          break;
        case 'time':
          result = await this.handleTimeRequest(userId, userInput, context, systemPrompt);
          break;
        case 'calculation':
          result = await this.handleCalculationRequest(userId, userInput, context, systemPrompt);
          break;
        case 'help':
          result = await this.handleHelpRequest(userId, userInput, context, systemPrompt);
          break;
        default:
          result = await this.handleDefaultRequest(userId, userInput, context, systemPrompt);
      }

      return {
        text: result.text,
        agentUsed: this.agentName,
        action: requestType.category,
        actions: result.actions || [],
        context: {
          requestType: requestType.category,
          confidence: requestType.confidence,
          processedSuccessfully: true
        }
      };

    } catch (error) {
      logger.error('Error in GeneralAgent:', error);
      return this.handleError(userInput, error);
    }
  }

  /**
   * Classify the type of general request
   */
  async classifyGeneralRequest(userInput, context) {
    try {
      // Use LLM for natural language classification
      const classificationPrompt = PromptTemplate.fromTemplate(`
        Classify this user request into the most appropriate category based on their intent:

        User Input: "{input}"
        Context: {context}

        Categories:
        - information: Questions seeking factual information, explanations, definitions
        - conversation: Greetings, small talk, casual conversation  
        - assistance: Requests for help with general tasks or decision-making
        - planning: Help with planning activities, trips, schedules
        - weather: Weather-related questions
        - time: Time, date, timezone-related questions
        - calculation: Math calculations, unit conversions
        - help: Questions about the assistant's capabilities or how to use features

        Analyze the user's intent and respond with JSON:
        {{
          "category": "one of the above categories",
          "confidence": 0.0-1.0,
          "reasoning": "brief explanation of why this category fits"
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
          category: parsed.category || 'conversation',
          confidence: parsed.confidence || 0.5,
          reasoning: parsed.reasoning || 'Default classification'
        };
      } catch (parseError) {
        logger.warn('Failed to parse general request classification');
        return {
          category: 'conversation',
          confidence: 0.3,
          reasoning: 'Fallback classification'
        };
      }

    } catch (error) {
      logger.error('Error classifying general request:', error);
      return {
        category: 'conversation',
        confidence: 0.1,
        reasoning: 'Error in classification'
      };
    }
  }

  /**
   * Handle information requests
   */
  async handleInformationRequest(userId, userInput, context, systemPrompt) {
    try {
      const informationPrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        USER QUESTION: "{input}"

        Provide a helpful, accurate response to this information request.
        
        Guidelines:
        1. Be factual and reliable
        2. If you're not certain, say so
        3. Provide context when helpful
        4. Keep response under 50 words for voice
        5. Use clear, simple language
        6. If the question requires real-time data you don't have, explain the limitation

        Response:
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: informationPrompt
      });

      const result = await chain.call({
        input: userInput
      });

      return {
        text: result.text.trim(),
        actions: ['provide_information']
      };

    } catch (error) {
      logger.error('Error handling information request:', error);
      return {
        text: "I'd be happy to help with information, but I'm having trouble processing that right now. Could you try rephrasing your question?",
        actions: []
      };
    }
  }

  /**
   * Handle conversational requests
   */
  async handleConversationalRequest(userId, userInput, context, systemPrompt) {
    try {
      const conversationPrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        USER MESSAGE: "{input}"
        
        CONVERSATION CONTEXT: {context}

        Respond in a natural, friendly way that:
        1. Acknowledges their message appropriately
        2. Maintains a warm, professional tone
        3. Keeps the conversation engaging
        4. Offers to help with productivity tasks when appropriate
        5. Stays under 30 words for voice interaction
        6. Shows personality while remaining helpful

        Response:
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: conversationPrompt
      });

      const result = await chain.call({
        input: userInput,
        context: JSON.stringify(context?.conversationHistory?.slice(-3) || [], null, 2)
      });

      return {
        text: result.text.trim(),
        actions: ['engage_conversation']
      };

    } catch (error) {
      logger.error('Error handling conversation:', error);
      return {
        text: "Hello! I'm here to help you stay organized and productive. What can I assist you with today?",
        actions: []
      };
    }
  }

  /**
   * Handle assistance requests
   */
  async handleAssistanceRequest(userId, userInput, context, systemPrompt) {
    try {
      const assistancePrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        USER REQUEST: "{input}"

        Provide helpful assistance for this request.
        
        Available capabilities: Calendar management, task tracking, email handling, general information

        Guidelines:
        1. Offer specific, actionable help
        2. If it relates to calendar/tasks/email, suggest those features
        3. Provide step-by-step guidance when appropriate
        4. Ask clarifying questions if needed
        5. Keep response under 50 words
        6. Be encouraging and supportive

        Response:
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: assistancePrompt
      });

      const result = await chain.call({
        input: userInput
      });

      return {
        text: result.text.trim(),
        actions: ['provide_assistance']
      };

    } catch (error) {
      logger.error('Error handling assistance request:', error);
      return {
        text: "I'm here to help! I can assist with your calendar, tasks, emails, and general questions. What would you like to work on?",
        actions: []
      };
    }
  }

  /**
   * Handle planning requests
   */
  async handlePlanningRequest(userId, userInput, context, systemPrompt) {
    try {
      const planningPrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        PLANNING REQUEST: "{input}"

        Help the user with planning and organization.
        
        Consider:
        1. Break down complex plans into steps
        2. Suggest timeframes and priorities
        3. Mention calendar/task features that could help
        4. Ask about constraints or preferences
        5. Provide practical, actionable advice
        6. Keep response under 50 words

        Response:
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: planningPrompt
      });

      const result = await chain.call({
        input: userInput
      });

      return {
        text: result.text.trim(),
        actions: ['help_planning', 'suggest_calendar', 'suggest_tasks']
      };

    } catch (error) {
      logger.error('Error handling planning request:', error);
      return {
        text: "I'd love to help you plan! I can assist with scheduling events in your calendar and organizing tasks. What are you planning?",
        actions: []
      };
    }
  }

  /**
   * Handle weather requests
   */
  async handleWeatherRequest(userId, userInput, context, systemPrompt) {
    try {
      return {
        text: "I don't have access to real-time weather data right now, but I'd recommend checking your weather app or asking Siri for current conditions.",
        actions: ['suggest_weather_app']
      };

    } catch (error) {
      logger.error('Error handling weather request:', error);
      return {
        text: "I can't check the weather right now, but your device's weather app should have current conditions.",
        actions: []
      };
    }
  }

  /**
   * Handle time-related requests
   */
  async handleTimeRequest(userId, userInput, context, systemPrompt) {
    try {
      const now = new Date();
      const timeInfo = {
        current: now.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        }),
        date: now.toLocaleDateString('en-GB'),
        day: now.toLocaleDateString('en-GB', { weekday: 'long' }),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      // Always use LLM for natural language responses
      const timePrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        USER REQUEST: "{input}"
        
        Current time information (use this to answer their question):
        Time: {time}
        Date: {date}
        Day: {day}
        Timezone: {timezone}

        Respond naturally and conversationally to their time-related question.
        Use the current time information to give them exactly what they asked for.
        Be helpful and friendly. Keep it concise but natural (under 30 words).
        
        Examples of good responses:
        - "It's currently 16:30 on Tuesday, 22nd July."
        - "Right now it's 4:30 PM on a Tuesday afternoon."
        - "The time is 16:30, and today is Tuesday the 22nd."
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: timePrompt
      });

      const result = await this.callLLMWithFallback(chain, {
        input: userInput,
        time: timeInfo.current,
        date: timeInfo.date,
        day: timeInfo.day,
        timezone: timeInfo.timezone
      });

      return {
        text: result.text.trim(),
        actions: ['provide_time_info']
      };

    } catch (error) {
      logger.error('Error handling time request:', error);
      // Only use fallback if LLM completely fails
      const now = new Date();
      return {
        text: `It's currently ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })} on ${now.toLocaleDateString('en-GB', { weekday: 'long' })}.`,
        actions: ['provide_time_info']
      };
    }
  }

  /**
   * Handle calculation requests
   */
  async handleCalculationRequest(userId, userInput, context, systemPrompt) {
    try {
      const calculationPrompt = PromptTemplate.fromTemplate(`
        USER REQUEST: "{input}"

        This appears to be a calculation or math request.
        
        If it's a simple calculation, provide the answer.
        If it's complex, explain what would be needed.
        If you can't calculate it accurately, say so.
        
        Keep response under 30 words and be precise.
        
        Response:
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: calculationPrompt
      });

      const result = await chain.call({
        input: userInput
      });

      return {
        text: result.text.trim(),
        actions: ['perform_calculation']
      };

    } catch (error) {
      logger.error('Error handling calculation request:', error);
      return {
        text: "I can help with basic calculations, but for complex math you might want to use a calculator app.",
        actions: []
      };
    }
  }

  /**
   * Handle help requests
   */
  async handleHelpRequest(userId, userInput, context, systemPrompt) {
    try {
      const helpText = `I can help you with:

Calendar: Schedule meetings, find free time, view events
Tasks: Create to-dos, track progress, set priorities  
Email: Read messages, send replies, manage inbox
General: Answer questions, have conversations, assist with planning

What would you like to try first?`;

      return {
        text: helpText,
        actions: ['provide_help', 'list_capabilities']
      };

    } catch (error) {
      logger.error('Error handling help request:', error);
      return {
        text: "I'm your voice assistant for calendar, tasks, and email management. I can also answer questions and help with planning. What can I help you with?",
        actions: []
      };
    }
  }

  /**
   * Handle default/fallback requests
   */
  async handleDefaultRequest(userId, userInput, context, systemPrompt) {
    try {
      const defaultPrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        USER INPUT: "{input}"

        This request doesn't fit specific categories. Provide a helpful response that:
        1. Acknowledges their input
        2. Offers assistance
        3. Suggests relevant features if applicable
        4. Keeps it under 40 words
        5. Maintains a helpful tone

        Response:
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: defaultPrompt
      });

      const result = await chain.call({
        input: userInput
      });

      return {
        text: result.text.trim(),
        actions: ['general_response']
      };

    } catch (error) {
      logger.error('Error handling default request:', error);
      return {
        text: "I'm here to help! I can assist with your calendar, tasks, emails, and general questions. What would you like to work on?",
        actions: []
      };
    }
  }

  /**
   * Handle errors
   */
  handleError(userInput, error) {
    return {
      text: "I'm having a small technical issue, but I'm still here to help. Could you try asking me something else?",
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
   * Generate suggestions for follow-up actions
   */
  generateFollowUpSuggestions(requestType, context) {
    const suggestions = {
      information: [
        "Would you like me to help schedule something related to this?",
        "Should I create a reminder about this information?"
      ],
      conversation: [
        "Is there anything I can help you organize today?",
        "Would you like to check your calendar or tasks?"
      ],
      assistance: [
        "Would you like me to walk you through setting up any integrations?",
        "Should I help you get started with calendar or task management?"
      ],
      planning: [
        "Should I help you schedule this in your calendar?",
        "Would you like me to create tasks for these steps?"
      ]
    };

    return suggestions[requestType] || [
      "What else can I help you with today?",
      "Would you like to try any of my other features?"
    ];
  }

  /**
   * Check if the request might be better handled by a specific agent
   */
  shouldRedirectToSpecificAgent(userInput) {
    const calendarKeywords = ['schedule', 'meeting', 'calendar', 'event', 'appointment', 'book', 'free time'];
    const taskKeywords = ['task', 'todo', 'reminder', 'complete', 'finish', 'deadline', 'project'];
    const emailKeywords = ['email', 'message', 'send', 'reply', 'inbox', 'unread', 'mail'];

    const inputLower = userInput.toLowerCase();

    if (calendarKeywords.some(keyword => inputLower.includes(keyword))) {
      return { agent: 'calendar', confidence: 0.7 };
    }
    
    if (taskKeywords.some(keyword => inputLower.includes(keyword))) {
      return { agent: 'task', confidence: 0.7 };
    }
    
    if (emailKeywords.some(keyword => inputLower.includes(keyword))) {
      return { agent: 'email', confidence: 0.7 };
    }

    return null;
  }

  /**
   * Format response for voice output
   */
  formatForVoice(text) {
    // Clean up text for better voice synthesis
    return text
      .replace(/\n+/g, '. ') // Replace newlines with periods
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s.,!?-]/g, '') // Remove special characters
      .trim();
  }
}

module.exports = GeneralAgent;