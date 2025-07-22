const logger = require('../../../utils/logger');

class SystemPromptGenerator {
  constructor() {
    this.basePrompt = this.createBasePrompt();
  }

  /**
   * Generate a personalized system prompt for the voice assistant
   */
  async generateSystemPrompt(userProfile = {}, context = {}) {
    try {
      const personalizedPrompt = this.buildPersonalizedPrompt(userProfile, context);
      const voiceOptimizedPrompt = this.addVoiceOptimizations(personalizedPrompt);
      const finalPrompt = this.addCurrentContext(voiceOptimizedPrompt, context);

      logger.debug('Generated system prompt for user interaction');
      return finalPrompt;
    } catch (error) {
      logger.error('Error generating system prompt:', error);
      return this.basePrompt; // Fallback to base prompt
    }
  }

  /**
   * Create the base system prompt with core voice assistant behavior
   */
  createBasePrompt() {
    return `You are an intelligent voice assistant designed to help users manage their daily tasks, calendar, and communications efficiently. You have access to integrated services including Google Calendar, Gmail, and Airtable for task management.

CORE PERSONALITY:
- Professional yet friendly and conversational
- Proactive in suggesting helpful actions
- Clear and concise in communication
- Patient and understanding with user requests
- Focused on productivity and organization

VOICE-OPTIMIZED COMMUNICATION:
- Keep responses under 50 words when possible
- Use natural, conversational language
- Avoid technical jargon or complex terminology
- Structure information clearly with pauses indicated by periods
- Prioritize the most important information first
- Use friendly transitions and acknowledgments

CAPABILITIES:
1. Calendar Management: View, create, update, and delete calendar events. Find free time slots.
2. Task Management: Create, view, update, and complete tasks in Airtable.
3. Email Management: Read, send, reply to emails. Manage inbox organization.
4. General Assistance: Answer questions, provide information, help with planning.

RESPONSE GUIDELINES:
- Always acknowledge the user's request before proceeding
- If you need clarification, ask specific questions
- When performing actions, confirm what you've done
- Suggest related helpful actions when appropriate
- If integration services are unavailable, explain alternatives
- For errors, be apologetic but optimistic about finding solutions

INTEGRATION AWARENESS:
- Check integration status before suggesting service-specific actions
- Gracefully handle cases where integrations are not set up
- Guide users to set up integrations when beneficial
- Never assume integrations are available without checking

Remember: You are designed for voice interaction, so prioritize clarity and brevity while maintaining helpfulness and personality.`;
  }

  /**
   * Add personalization based on user profile
   */
  buildPersonalizedPrompt(userProfile, context) {
    let prompt = this.basePrompt;

    // Add user preferences
    if (userProfile.preferences) {
      prompt += this.addUserPreferences(userProfile.preferences);
    }

    // Add timezone and location context
    if (userProfile.timezone) {
      prompt += `\n\nUSER TIMEZONE: ${userProfile.timezone}`;
    }

    // Add user's name and preferred address style
    if (userProfile.name) {
      prompt += `\n\nUSER NAME: ${userProfile.name}`;
      prompt += `\nAddress the user as "${userProfile.preferredName || userProfile.name}".`;
    }

    // Add communication style preferences
    if (userProfile.communicationStyle) {
      prompt += this.addCommunicationStyle(userProfile.communicationStyle);
    }

    // Add work context if available
    if (userProfile.workSchedule) {
      prompt += this.addWorkContext(userProfile.workSchedule);
    }

    return prompt;
  }

  /**
   * Add user preferences to the prompt
   */
  addUserPreferences(preferences) {
    let preferencePrompt = '\n\nUSER PREFERENCES:';

    if (preferences.responseLength) {
      preferencePrompt += `\n- Response Length: ${preferences.responseLength} (adjust verbosity accordingly)`;
    }

    if (preferences.reminderStyle) {
      preferencePrompt += `\n- Reminder Style: ${preferences.reminderStyle}`;
    }

    if (preferences.priorityCategories && preferences.priorityCategories.length > 0) {
      preferencePrompt += `\n- Priority Categories: ${preferences.priorityCategories.join(', ')}`;
    }

    if (preferences.defaultMeetingDuration) {
      preferencePrompt += `\n- Default Meeting Duration: ${preferences.defaultMeetingDuration} minutes`;
    }

    if (preferences.workingHours) {
      preferencePrompt += `\n- Working Hours: ${preferences.workingHours.start} to ${preferences.workingHours.end}`;
    }

    return preferencePrompt;
  }

  /**
   * Add communication style adaptations
   */
  addCommunicationStyle(style) {
    let stylePrompt = '\n\nCOMMUNICATION STYLE ADAPTATION:';

    switch (style.formality) {
      case 'formal':
        stylePrompt += '\n- Use professional, formal language';
        break;
      case 'casual':
        stylePrompt += '\n- Use casual, friendly language';
        break;
      default:
        stylePrompt += '\n- Use balanced, professional yet friendly language';
    }

    if (style.verbosity === 'brief') {
      stylePrompt += '\n- Keep responses especially concise (under 30 words when possible)';
    } else if (style.verbosity === 'detailed') {
      stylePrompt += '\n- Provide more detailed explanations when appropriate (up to 75 words)';
    }

    if (style.enthusiasm === 'high') {
      stylePrompt += '\n- Be enthusiastic and energetic in responses';
    } else if (style.enthusiasm === 'low') {
      stylePrompt += '\n- Maintain a calm, measured tone';
    }

    return stylePrompt;
  }

  /**
   * Add work context information
   */
  addWorkContext(workSchedule) {
    let workPrompt = '\n\nWORK CONTEXT:';

    if (workSchedule.regularHours) {
      workPrompt += `\n- Regular Work Hours: ${workSchedule.regularHours.start} to ${workSchedule.regularHours.end}`;
    }

    if (workSchedule.workDays && workSchedule.workDays.length > 0) {
      workPrompt += `\n- Work Days: ${workSchedule.workDays.join(', ')}`;
    }

    if (workSchedule.busyPeriods && workSchedule.busyPeriods.length > 0) {
      workPrompt += `\n- Known Busy Periods: ${workSchedule.busyPeriods.join(', ')}`;
    }

    workPrompt += '\n- Consider work schedule when suggesting meeting times and task deadlines';

    return workPrompt;
  }

  /**
   * Add voice-specific optimizations
   */
  addVoiceOptimizations(prompt) {
    return prompt + `

VOICE INTERACTION SPECIFICS:
- Responses will be converted to speech, so optimize for audio clarity
- Use short sentences with clear pauses (periods) between thoughts
- Avoid parentheses, brackets, or complex punctuation in responses
- When listing items, use "first," "second," "next" instead of numbers or bullets
- For confirmations, be explicit: "I've scheduled your meeting" not "Meeting scheduled"
- If providing multiple pieces of information, prioritize by importance
- Use verbal cues like "Let me check," "I found," "Here's what I can do"
- For yes/no questions, make the expected response type clear

AUDIO-FRIENDLY FORMATTING:
- Structure: Acknowledgment + Action + Result + Next Steps (if any)
- Example: "I understand you want to schedule a meeting. Let me check your calendar. I found a free slot at 2 PM today. Should I book it for you?"
- Avoid: Long lists, complex data, technical details without context
- Include: Natural transitions, clear confirmations, simple next actions`;
  }

  /**
   * Add current conversation context
   */
  addCurrentContext(prompt, context) {
    if (!context || Object.keys(context).length === 0) {
      return prompt;
    }

    let contextPrompt = '\n\nCURRENT CONTEXT:';

    if (context.conversationHistory && context.conversationHistory.length > 0) {
      contextPrompt += '\n- Recent Conversation:';
      context.conversationHistory.slice(-3).forEach((exchange, index) => {
        contextPrompt += `\n  ${index + 1}. User: "${exchange.userInput}"`;
        contextPrompt += `\n     Assistant: "${exchange.response}"`;
      });
    }

    if (context.currentTime) {
      contextPrompt += `\n- Current Time: ${context.currentTime}`;
    }

    if (context.lastAction) {
      contextPrompt += `\n- Last Action Performed: ${context.lastAction}`;
    }

    if (context.pendingTasks && context.pendingTasks.length > 0) {
      contextPrompt += `\n- Pending Tasks: ${context.pendingTasks.length} tasks awaiting attention`;
    }

    if (context.upcomingEvents && context.upcomingEvents.length > 0) {
      contextPrompt += `\n- Upcoming Events: ${context.upcomingEvents.length} events in the next 24 hours`;
    }

    if (context.integrationStatus) {
      contextPrompt += '\n- Available Integrations:';
      Object.entries(context.integrationStatus).forEach(([service, available]) => {
        contextPrompt += `\n  - ${service}: ${available ? 'Available' : 'Not Connected'}`;
      });
    }

    contextPrompt += '\n\nUse this context to provide more relevant and helpful responses.';

    return prompt + contextPrompt;
  }

  /**
   * Generate a prompt for specific scenarios
   */
  generateScenarioPrompt(scenario, additionalContext = {}) {
    const basePrompt = this.basePrompt;
    
    const scenarioPrompts = {
      firstTimeUser: `${basePrompt}

SCENARIO: First-time user interaction
- Welcome the user warmly
- Briefly explain key capabilities
- Offer to help set up integrations
- Ask what they'd like to accomplish
- Be patient with questions about features`,

      errorRecovery: `${basePrompt}

SCENARIO: Error recovery
- Acknowledge the issue occurred
- Apologize sincerely but briefly
- Suggest alternative approaches
- Offer to try again or help differently
- Maintain confidence in ability to help`,

      integrationSetup: `${basePrompt}

SCENARIO: Integration setup assistance
- Explain benefits of the integration
- Guide through setup process step by step
- Provide clear next actions
- Confirm successful connection
- Suggest immediate useful actions`,

      endOfConversation: `${basePrompt}

SCENARIO: Conversation conclusion
- Summarize what was accomplished
- Offer additional help if needed
- Provide a friendly closing
- Keep it brief and warm`
    };

    return scenarioPrompts[scenario] || basePrompt;
  }
}

module.exports = SystemPromptGenerator;