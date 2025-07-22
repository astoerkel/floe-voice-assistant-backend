const { ChatOpenAI } = require('@langchain/openai');
const logger = require('../../utils/logger');

class IntentClassifier {
  constructor() {
    // Use OpenRouter API key with proper configuration
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      logger.error('OPENROUTER_API_KEY is required for IntentClassifier');
      throw new Error('OPENROUTER_API_KEY not found');
    }

    this.llm = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: 'gpt-3.5-turbo',
      temperature: 0,
      maxTokens: 50,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://floe.cognetica.de',
          'X-Title': process.env.OPENROUTER_SITE_NAME || 'Voice Assistant'
        }
      }
    });

    logger.info('IntentClassifier initialized with OpenRouter');

    this.intentPatterns = {
      calendar: [
        'schedule', 'meeting', 'appointment', 'calendar', 'book', 'available',
        'busy', 'free', 'time', 'when', 'event', 'reminder', 'call'
      ],
      task: [
        'task', 'todo', 'reminder', 'note', 'list', 'add', 'create',
        'complete', 'finish', 'done', 'check', 'item', 'project'
      ],
      email: [
        'email', 'mail', 'send', 'reply', 'forward', 'draft', 'compose',
        'inbox', 'message', 'letter', 'correspondence', 'gmail'
      ],
      weather: [
        'weather', 'forecast', 'temperature', 'rain', 'sunny', 'cloudy',
        'storm', 'wind', 'humidity', 'climate', 'degrees', 'hot', 'cold'
      ],
      general: [
        'what', 'how', 'when', 'where', 'why', 'tell', 'explain',
        'define', 'calculate', 'convert', 'translate', 'find'
      ]
    };
  }

  async classifyIntent(input) {
    try {
      logger.info('Classifying intent for: "' + input.substring(0, 50) + '..."');
      
      // First try pattern matching (fast)
      const patternResult = this.patternMatchIntent(input);
      if (patternResult.confidence > 0.7) {
        logger.info('Pattern match: ' + input.substring(0, 50) + ' -> ' + patternResult.intent);
        return patternResult;
      }

      // Fall back to LLM classification
      const llmResult = await this.llmClassifyIntent(input);
      logger.info('LLM classification: ' + input.substring(0, 50) + ' -> ' + llmResult.intent);
      return llmResult;
    } catch (error) {
      logger.error('Intent classification failed:', error);
      return {
        intent: 'general',
        confidence: 0.5,
        method: 'fallback'
      };
    }
  }

  patternMatchIntent(input) {
    const inputLower = input.toLowerCase();
    const scores = {};

    // Initialize scores
    Object.keys(this.intentPatterns).forEach(intent => {
      scores[intent] = 0;
    });

    // Score based on pattern matches
    Object.entries(this.intentPatterns).forEach(([intent, patterns]) => {
      patterns.forEach(pattern => {
        if (inputLower.includes(pattern.toLowerCase())) {
          scores[intent] += 1;
        }
      });
    });

    // Find highest scoring intent
    const intents = Object.entries(scores);
    const maxScore = Math.max(...intents.map(([_, score]) => score));
    
    if (maxScore === 0) {
      return {
        intent: 'general',
        confidence: 0.3,
        method: 'pattern_match'
      };
    }

    const bestIntent = intents.find(([_, score]) => score === maxScore)[0];
    const totalPatterns = this.intentPatterns[bestIntent].length;
    const confidence = Math.min(maxScore / totalPatterns, 1.0);

    return {
      intent: bestIntent,
      confidence: confidence * 0.8, // Pattern matching gets max 0.8 confidence
      method: 'pattern_match'
    };
  }

  async llmClassifyIntent(input) {
    try {
      const prompt = 'Classify this user request into one of these categories: calendar, task, email, weather, general.\n\nUser request: "' + input + '"\n\nRespond with only the category name (one word).';

      const response = await this.llm.invoke([{ role: 'user', content: prompt }]);
      const intent = response.content.toLowerCase().trim();
      
      // Validate intent
      const validIntents = ['calendar', 'task', 'email', 'weather', 'general'];
      const finalIntent = validIntents.includes(intent) ? intent : 'general';
      
      return {
        intent: finalIntent,
        confidence: 0.9,
        method: 'llm'
      };
    } catch (error) {
      logger.error('LLM intent classification failed:', error);
      return {
        intent: 'general',
        confidence: 0.5,
        method: 'llm_fallback'
      };
    }
  }
}

// Export singleton instance
module.exports = new IntentClassifier();