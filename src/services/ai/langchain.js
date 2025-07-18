const { ChatOpenAI } = require('@langchain/openai');
const { AgentExecutor, createOpenAIFunctionsAgent } = require('langchain/agents');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { ConversationBufferMemory } = require('langchain/memory');
const { BufferMemory } = require('langchain/memory');
const { DynamicTool } = require('langchain/tools');
const logger = require('../../utils/logger');

class LangChainService {
  constructor() {
    this.openaiLLM = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-4',
      temperature: 0.1,
      maxTokens: 1000
    });

    this.defaultLLM = this.openaiLLM;
    this.memory = new Map(); // User-specific memory storage
  }

  createCoordinatorPrompt() {
    return ChatPromptTemplate.fromMessages([
      ["system", `You are a helpful voice assistant coordinator. Your job is to:
      1. Understand user voice commands and classify their intent
      2. Route commands to appropriate specialized agents
      3. Maintain conversation context and memory
      4. Provide natural, conversational responses
      5. Handle multi-step tasks and follow-up questions
      
      Available agents:
      - Calendar Agent: Handles meeting scheduling, calendar queries, event management
      - Email Agent: Manages email reading, composing, sending, and organization
      - Task Agent: Handles task creation, management, and tracking
      - Weather Agent: Provides weather information and forecasts
      
      Always respond in a helpful, natural tone. If you're unsure about something, ask for clarification.
      Keep responses concise but informative.`],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad")
    ]);
  }

  createCalendarTool() {
    return new DynamicTool({
      name: "calendar_agent",
      description: "Handle calendar-related queries like scheduling meetings, checking availability, viewing events",
      func: async (input) => {
        try {
          // This will be implemented when we create the calendar agent
          logger.info('Calendar tool called with:', input);
          return `Calendar agent processing: ${input}`;
        } catch (error) {
          logger.error('Calendar tool error:', error);
          return `Calendar agent error: ${error.message}`;
        }
      }
    });
  }

  createEmailTool() {
    return new DynamicTool({
      name: "email_agent",
      description: "Handle email-related queries like reading emails, composing messages, searching inbox",
      func: async (input) => {
        try {
          // This will be implemented when we create the email agent
          logger.info('Email tool called with:', input);
          return `Email agent processing: ${input}`;
        } catch (error) {
          logger.error('Email tool error:', error);
          return `Email agent error: ${error.message}`;
        }
      }
    });
  }

  createTaskTool() {
    return new DynamicTool({
      name: "task_agent",
      description: "Handle task-related queries like creating tasks, updating status, managing deadlines",
      func: async (input) => {
        try {
          // This will be implemented when we create the task agent
          logger.info('Task tool called with:', input);
          return `Task agent processing: ${input}`;
        } catch (error) {
          logger.error('Task tool error:', error);
          return `Task agent error: ${error.message}`;
        }
      }
    });
  }

  createWeatherTool() {
    return new DynamicTool({
      name: "weather_agent",
      description: "Provide weather information, forecasts, and weather-related suggestions",
      func: async (input) => {
        try {
          // This will be implemented when we create the weather agent
          logger.info('Weather tool called with:', input);
          return `Weather agent processing: ${input}`;
        } catch (error) {
          logger.error('Weather tool error:', error);
          return `Weather agent error: ${error.message}`;
        }
      }
    });
  }

  async createCoordinatorAgent(userId, llmProvider = 'openai') {
    try {
      const llm = this.openaiLLM;
      
      const tools = [
        this.createCalendarTool(),
        this.createEmailTool(),
        this.createTaskTool(),
        this.createWeatherTool()
      ];

      const prompt = this.createCoordinatorPrompt();
      
      const agent = await createOpenAIFunctionsAgent({
        llm,
        tools,
        prompt
      });

      // Get or create user memory
      if (!this.memory.has(userId)) {
        this.memory.set(userId, new ConversationBufferMemory({
          memoryKey: "chat_history",
          returnMessages: true,
          outputKey: "output",
          inputKey: "input"
        }));
      }

      const memory = this.memory.get(userId);

      const executor = new AgentExecutor({
        agent,
        tools,
        memory,
        verbose: process.env.NODE_ENV === 'development',
        maxIterations: 3,
        earlyStoppingMethod: "generate"
      });

      return executor;
    } catch (error) {
      logger.error('Failed to create coordinator agent:', error);
      throw error;
    }
  }

  async processVoiceCommand(userId, input, context = {}) {
    try {
      const agent = await this.createCoordinatorAgent(userId, context.llmProvider);
      
      const result = await agent.invoke({
        input,
        context: JSON.stringify(context)
      });

      logger.info(`Voice command processed for user ${userId}:`, {
        input: input.substring(0, 100),
        output: result.output.substring(0, 100)
      });

      return {
        success: true,
        response: result.output,
        agent: 'coordinator',
        executionTime: Date.now(),
        context: context
      };
    } catch (error) {
      logger.error('Voice command processing failed:', error);
      return {
        success: false,
        error: error.message,
        agent: 'coordinator',
        executionTime: Date.now(),
        context: context
      };
    }
  }

  async classifyIntent(input) {
    try {
      const classificationPrompt = `
        Classify the following user input into one of these intents:
        - calendar: scheduling, meetings, appointments, events, availability
        - email: reading, composing, sending, organizing emails
        - task: creating, managing, tracking tasks and todos
        - weather: weather information, forecasts, conditions
        - general: general questions or conversation
        
        Input: "${input}"
        
        Respond with just the intent name (calendar, email, task, weather, or general).
      `;

      const response = await this.defaultLLM.invoke(classificationPrompt);
      const intent = response.content.trim().toLowerCase();

      logger.info(`Intent classified: ${input.substring(0, 50)} -> ${intent}`);
      return intent;
    } catch (error) {
      logger.error('Intent classification failed:', error);
      return 'general';
    }
  }

  async generateResponse(input, intent = 'general', context = {}) {
    try {
      const responsePrompt = `
        You are a helpful voice assistant. The user said: "${input}"
        
        The intent has been classified as: ${intent}
        
        Context: ${JSON.stringify(context)}
        
        Generate a natural, conversational response. Keep it concise but helpful.
        If you need more information, ask clarifying questions.
      `;

      const response = await this.defaultLLM.invoke(responsePrompt);
      return response.content;
    } catch (error) {
      logger.error('Response generation failed:', error);
      return "I'm sorry, I'm having trouble processing that right now. Could you please try again?";
    }
  }

  clearUserMemory(userId) {
    if (this.memory.has(userId)) {
      this.memory.delete(userId);
      logger.info(`Memory cleared for user ${userId}`);
    }
  }

  getUserMemory(userId) {
    return this.memory.get(userId);
  }

  async exportUserMemory(userId) {
    const memory = this.memory.get(userId);
    if (!memory) return null;

    try {
      const history = await memory.chatHistory.getMessages();
      return history.map(msg => ({
        type: msg.constructor.name,
        content: msg.content,
        timestamp: msg.additional_kwargs?.timestamp || new Date()
      }));
    } catch (error) {
      logger.error('Failed to export user memory:', error);
      return null;
    }
  }
}

module.exports = new LangChainService();