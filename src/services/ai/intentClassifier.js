const { ChatOpenAI } = require('@langchain/openai');
const logger = require('../../utils/logger');

class IntentClassifier {
  constructor() {
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-3.5-turbo',
      temperature: 0,
      maxTokens: 50
    });

    this.intentPatterns = {
      calendar: [
        'schedule', 'meeting', 'appointment', 'calendar', 'book', 'available',
        'free time', 'busy', 'event', 'tomorrow', 'today', 'next week',
        'reschedule', 'cancel', 'move', 'when is', 'what time'
      ],
      email: [
        'email', 'mail', 'message', 'send', 'compose', 'reply', 'forward',
        'inbox', 'unread', 'read', 'important', 'draft', 'delete'
      ],
      task: [
        'task', 'todo', 'reminder', 'note', 'complete', 'done', 'finish',
        'deadline', 'due', 'priority', 'urgent', 'list', 'add to list'
      ],
      weather: [
        'weather', 'temperature', 'rain', 'sunny', 'cloudy', 'forecast',
        'hot', 'cold', 'humid', 'snow', 'storm', 'umbrella'
      ]
    };

    this.confidenceThreshold = 0.7;
  }

  async classifyIntent(input) {
    try {
      // First, try simple pattern matching for speed
      const patternResult = this.patternMatchIntent(input);
      if (patternResult.confidence > this.confidenceThreshold) {
        logger.info(`Pattern match classification: ${input.substring(0, 50)} -> ${patternResult.intent}`);
        return patternResult;
      }

      // Fall back to LLM classification
      const llmResult = await this.llmClassifyIntent(input);
      logger.info(`LLM classification: ${input.substring(0, 50)} -> ${llmResult.intent}`);
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
      confidence,
      method: 'pattern_match',
      score: maxScore
    };
  }

  async llmClassifyIntent(input) {
    try {
      const prompt = `
        Classify the following user input into one of these intents and provide a confidence score:
        
        Intents:
        - calendar: scheduling, meetings, appointments, events, availability, time-related queries
        - email: reading, composing, sending, organizing emails, messages
        - task: creating, managing, tracking tasks, todos, reminders, notes
        - weather: weather information, forecasts, conditions, climate
        - general: general questions, conversation, unrelated topics
        
        Input: "${input}"
        
        Respond in this exact format:
        Intent: [intent_name]
        Confidence: [0.0-1.0]
        Reasoning: [brief explanation]
      `;

      const response = await this.llm.invoke(prompt);
      const content = response.content.trim();

      // Parse the response
      const intentMatch = content.match(/Intent:\s*(\w+)/i);
      const confidenceMatch = content.match(/Confidence:\s*([\d.]+)/i);
      const reasoningMatch = content.match(/Reasoning:\s*(.+)/i);

      const intent = intentMatch ? intentMatch[1].toLowerCase() : 'general';
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : '';

      // Validate intent
      const validIntents = ['calendar', 'email', 'task', 'weather', 'general'];
      const finalIntent = validIntents.includes(intent) ? intent : 'general';

      return {
        intent: finalIntent,
        confidence: Math.max(0, Math.min(1, confidence)),
        method: 'llm',
        reasoning
      };
    } catch (error) {
      logger.error('LLM intent classification failed:', error);
      return {
        intent: 'general',
        confidence: 0.5,
        method: 'llm_fallback',
        error: error.message
      };
    }
  }

  async batchClassifyIntents(inputs) {
    const results = await Promise.allSettled(
      inputs.map(input => this.classifyIntent(input))
    );

    return results.map((result, index) => ({
      input: inputs[index],
      classification: result.status === 'fulfilled' ? result.value : {
        intent: 'general',
        confidence: 0.3,
        method: 'batch_fallback',
        error: result.reason?.message
      }
    }));
  }

  getIntentKeywords(intent) {
    return this.intentPatterns[intent] || [];
  }

  addIntentPattern(intent, patterns) {
    if (!this.intentPatterns[intent]) {
      this.intentPatterns[intent] = [];
    }
    this.intentPatterns[intent].push(...patterns);
    logger.info(`Added patterns for intent ${intent}:`, patterns);
  }

  updateConfidenceThreshold(threshold) {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
    logger.info(`Updated confidence threshold to ${this.confidenceThreshold}`);
  }

  getStats() {
    return {
      availableIntents: Object.keys(this.intentPatterns),
      patternCounts: Object.fromEntries(
        Object.entries(this.intentPatterns).map(([intent, patterns]) => [
          intent,
          patterns.length
        ])
      ),
      confidenceThreshold: this.confidenceThreshold
    };
  }
}

module.exports = new IntentClassifier();