const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');

class PersonalizationManager {
  constructor() {
    this.defaultPreferences = {
      responseLength: 'balanced', // brief, balanced, detailed
      communicationStyle: {
        formality: 'balanced', // formal, balanced, casual
        verbosity: 'balanced', // brief, balanced, detailed
        enthusiasm: 'balanced' // low, balanced, high
      },
      reminderStyle: 'friendly', // formal, friendly, urgent
      defaultMeetingDuration: 30,
      workingHours: {
        start: '09:00',
        end: '17:00'
      },
      priorityCategories: ['work', 'personal', 'health'],
      timezone: 'UTC'
    };
  }

  /**
   * Get comprehensive user profile for personalization
   */
  async getUserProfile(userId) {
    try {
      // Get user basic info
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userPreferences: true,
          integrations: {
            where: { isActive: true }
          }
        }
      });

      if (!user) {
        logger.warn(`User ${userId} not found, using default profile`);
        return this.createDefaultProfile(userId);
      }

      // Build comprehensive profile
      const profile = {
        userId: user.id,
        name: user.name,
        email: user.email,
        preferredName: user.name?.split(' ')[0] || 'there',
        timezone: user.timezone || this.defaultPreferences.timezone,
        
        // Preferences with fallbacks
        preferences: this.mergePreferences(user.userPreferences),
        
        // Communication style
        communicationStyle: this.getCommunicationStyle(user.userPreferences),
        
        // Work schedule
        workSchedule: this.getWorkSchedule(user.userPreferences),
        
        // Integration status
        integrations: this.getIntegrationStatus(user.integrations),
        
        // Learning data
        learningData: await this.getLearningData(userId),
        
        // Context
        lastActiveAt: user.lastActiveAt,
        createdAt: user.createdAt
      };

      logger.debug(`Retrieved user profile for ${userId}`);
      return profile;

    } catch (error) {
      logger.error('Error getting user profile:', error);
      return this.createDefaultProfile(userId);
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId, preferences) {
    try {
      const updatedPreferences = await prisma.userPreferences.upsert({
        where: { userId },
        update: preferences,
        create: {
          userId,
          ...preferences
        }
      });

      logger.info(`Updated preferences for user ${userId}`);
      return updatedPreferences;

    } catch (error) {
      logger.error('Error updating user preferences:', error);
      throw error;
    }
  }

  /**
   * Learn from user interactions to improve personalization
   */
  async learnFromInteraction(userId, interaction) {
    try {
      const learningData = {
        userId,
        interactionType: interaction.type,
        userInput: interaction.input,
        assistantResponse: interaction.response,
        userFeedback: interaction.feedback, // positive, negative, neutral
        intent: interaction.intent,
        confidence: interaction.confidence,
        responseTime: interaction.responseTime,
        wasHelpful: interaction.wasHelpful,
        metadata: {
          timeOfDay: new Date().getHours(),
          dayOfWeek: new Date().getDay(),
          contextLength: interaction.contextLength || 0,
          integrationUsed: interaction.integrationUsed
        }
      };

      await prisma.userLearningData.create({
        data: learningData
      });

      // Update user activity
      await prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() }
      });

      // Analyze patterns and update preferences if needed
      await this.analyzeAndUpdatePreferences(userId);

      logger.debug(`Recorded learning data for user ${userId}`);

    } catch (error) {
      logger.error('Error learning from interaction:', error);
      // Don't throw - learning failures shouldn't break main flow
    }
  }

  /**
   * Get user's communication style preferences
   */
  getCommunicationStyle(userPreferences) {
    if (!userPreferences) {
      return this.defaultPreferences.communicationStyle;
    }

    return {
      formality: userPreferences.communicationFormality || this.defaultPreferences.communicationStyle.formality,
      verbosity: userPreferences.responseVerbosity || this.defaultPreferences.communicationStyle.verbosity,
      enthusiasm: userPreferences.enthusiasmLevel || this.defaultPreferences.communicationStyle.enthusiasm
    };
  }

  /**
   * Get user's work schedule preferences
   */
  getWorkSchedule(userPreferences) {
    if (!userPreferences) {
      return {
        regularHours: this.defaultPreferences.workingHours,
        workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        busyPeriods: []
      };
    }

    return {
      regularHours: {
        start: userPreferences.workStartTime || this.defaultPreferences.workingHours.start,
        end: userPreferences.workEndTime || this.defaultPreferences.workingHours.end
      },
      workDays: userPreferences.workDays ? 
        JSON.parse(userPreferences.workDays) : 
        ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      busyPeriods: userPreferences.busyPeriods ? 
        JSON.parse(userPreferences.busyPeriods) : 
        []
    };
  }

  /**
   * Get integration status summary
   */
  getIntegrationStatus(integrations) {
    const status = {
      calendar: false,
      email: false,
      tasks: false,
      count: 0
    };

    integrations.forEach(integration => {
      if (integration.isActive) {
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
        status.count++;
      }
    });

    return status;
  }

  /**
   * Merge user preferences with defaults
   */
  mergePreferences(userPreferences) {
    if (!userPreferences) {
      return this.defaultPreferences;
    }

    return {
      responseLength: userPreferences.responseLength || this.defaultPreferences.responseLength,
      reminderStyle: userPreferences.reminderStyle || this.defaultPreferences.reminderStyle,
      defaultMeetingDuration: userPreferences.defaultMeetingDuration || this.defaultPreferences.defaultMeetingDuration,
      workingHours: {
        start: userPreferences.workStartTime || this.defaultPreferences.workingHours.start,
        end: userPreferences.workEndTime || this.defaultPreferences.workingHours.end
      },
      priorityCategories: userPreferences.priorityCategories ? 
        JSON.parse(userPreferences.priorityCategories) : 
        this.defaultPreferences.priorityCategories,
      timezone: userPreferences.timezone || this.defaultPreferences.timezone
    };
  }

  /**
   * Get learning data for improved personalization
   */
  async getLearningData(userId) {
    try {
      const recentInteractions = await prisma.userLearningData.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50 // Last 50 interactions
      });

      if (recentInteractions.length === 0) {
        return { patternAnalysis: null, recommendations: [] };
      }

      // Analyze patterns
      const patterns = this.analyzeInteractionPatterns(recentInteractions);
      
      return {
        totalInteractions: recentInteractions.length,
        patternAnalysis: patterns,
        recommendations: this.generatePersonalizationRecommendations(patterns),
        lastLearningUpdate: new Date()
      };

    } catch (error) {
      logger.error('Error getting learning data:', error);
      return { patternAnalysis: null, recommendations: [] };
    }
  }

  /**
   * Analyze interaction patterns for personalization insights
   */
  analyzeInteractionPatterns(interactions) {
    const patterns = {
      preferredTimeOfDay: this.getMostCommonTimeOfDay(interactions),
      mostUsedIntents: this.getMostUsedIntents(interactions),
      averageResponseSatisfaction: this.getAverageResponseSatisfaction(interactions),
      preferredIntegrations: this.getPreferredIntegrations(interactions),
      communicationEffectiveness: this.getCommunicationEffectiveness(interactions)
    };

    return patterns;
  }

  /**
   * Helper method to find most common time of day for interactions
   */
  getMostCommonTimeOfDay(interactions) {
    const hourCounts = {};
    
    interactions.forEach(interaction => {
      const hour = interaction.metadata?.timeOfDay || new Date(interaction.createdAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const mostCommonHour = Object.keys(hourCounts).reduce((a, b) => 
      hourCounts[a] > hourCounts[b] ? a : b
    );

    return {
      hour: parseInt(mostCommonHour),
      count: hourCounts[mostCommonHour],
      period: this.getTimeOfDayPeriod(parseInt(mostCommonHour))
    };
  }

  /**
   * Helper method to get most used intents
   */
  getMostUsedIntents(interactions) {
    const intentCounts = {};
    
    interactions.forEach(interaction => {
      const intent = interaction.intent || 'general';
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
    });

    return Object.entries(intentCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([intent, count]) => ({ intent, count }));
  }

  /**
   * Helper method to calculate average response satisfaction
   */
  getAverageResponseSatisfaction(interactions) {
    const satisfactionScores = interactions
      .filter(i => i.wasHelpful !== null)
      .map(i => i.wasHelpful ? 1 : 0);

    if (satisfactionScores.length === 0) return null;

    return satisfactionScores.reduce((sum, score) => sum + score, 0) / satisfactionScores.length;
  }

  /**
   * Helper method to identify preferred integrations
   */
  getPreferredIntegrations(interactions) {
    const integrationCounts = {};
    
    interactions.forEach(interaction => {
      const integration = interaction.metadata?.integrationUsed;
      if (integration) {
        integrationCounts[integration] = (integrationCounts[integration] || 0) + 1;
      }
    });

    return Object.entries(integrationCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([integration, count]) => ({ integration, count }));
  }

  /**
   * Helper method to assess communication effectiveness
   */
  getCommunicationEffectiveness(interactions) {
    const totalInteractions = interactions.length;
    const successfulInteractions = interactions.filter(i => i.wasHelpful === true).length;
    const needsImprovementInteractions = interactions.filter(i => i.wasHelpful === false).length;

    return {
      successRate: totalInteractions > 0 ? successfulInteractions / totalInteractions : 0,
      improvementNeeded: totalInteractions > 0 ? needsImprovementInteractions / totalInteractions : 0,
      totalInteractions
    };
  }

  /**
   * Generate personalization recommendations based on patterns
   */
  generatePersonalizationRecommendations(patterns) {
    const recommendations = [];

    // Time-based recommendations
    if (patterns.preferredTimeOfDay?.period === 'morning') {
      recommendations.push({
        type: 'communication',
        suggestion: 'User prefers morning interactions - consider more energetic greetings',
        confidence: 0.7
      });
    }

    // Communication effectiveness recommendations
    if (patterns.communicationEffectiveness?.successRate < 0.7) {
      recommendations.push({
        type: 'communication',
        suggestion: 'Consider adjusting response style for better clarity',
        confidence: 0.8
      });
    }

    // Integration usage recommendations
    if (patterns.preferredIntegrations?.length > 0) {
      const topIntegration = patterns.preferredIntegrations[0];
      recommendations.push({
        type: 'feature',
        suggestion: `User frequently uses ${topIntegration.integration} - prioritize this in responses`,
        confidence: 0.6
      });
    }

    return recommendations;
  }

  /**
   * Analyze patterns and update preferences automatically
   */
  async analyzeAndUpdatePreferences(userId) {
    try {
      // Only update preferences based on strong patterns (minimum 20 interactions)
      const interactionCount = await prisma.userLearningData.count({
        where: { userId }
      });

      if (interactionCount < 20) return;

      const learningData = await this.getLearningData(userId);
      const patterns = learningData.patternAnalysis;

      if (!patterns) return;

      // Auto-adjust communication style based on satisfaction rates
      const currentPrefs = await prisma.userPreferences.findUnique({
        where: { userId }
      });

      const updates = {};

      // Adjust verbosity based on effectiveness
      if (patterns.communicationEffectiveness?.successRate < 0.6) {
        if (!currentPrefs?.responseVerbosity || currentPrefs.responseVerbosity === 'balanced') {
          updates.responseVerbosity = 'brief';
        }
      }

      // Update preferred time period based on usage
      if (patterns.preferredTimeOfDay?.count > 5) {
        updates.preferredInteractionTime = patterns.preferredTimeOfDay.period;
      }

      // Only update if we have meaningful changes
      if (Object.keys(updates).length > 0) {
        await this.updateUserPreferences(userId, updates);
        logger.info(`Auto-updated preferences for user ${userId}:`, updates);
      }

    } catch (error) {
      logger.error('Error analyzing and updating preferences:', error);
    }
  }

  /**
   * Create default profile for new or unknown users
   */
  createDefaultProfile(userId) {
    return {
      userId,
      name: null,
      email: null,
      preferredName: 'there',
      timezone: this.defaultPreferences.timezone,
      preferences: this.defaultPreferences,
      communicationStyle: this.defaultPreferences.communicationStyle,
      workSchedule: {
        regularHours: this.defaultPreferences.workingHours,
        workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        busyPeriods: []
      },
      integrations: {
        calendar: false,
        email: false,
        tasks: false,
        count: 0
      },
      learningData: {
        patternAnalysis: null,
        recommendations: []
      },
      lastActiveAt: null,
      createdAt: new Date()
    };
  }

  /**
   * Helper method to categorize time of day
   */
  getTimeOfDayPeriod(hour) {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * Get personalization statistics
   */
  async getPersonalizationStats(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      const interactionCount = await prisma.userLearningData.count({
        where: { userId }
      });

      return {
        hasPersonalization: interactionCount > 0,
        interactionCount,
        integrationsConnected: profile.integrations.count,
        preferencesConfigured: !!profile.preferences,
        personalizationLevel: this.calculatePersonalizationLevel(profile, interactionCount)
      };

    } catch (error) {
      logger.error('Error getting personalization stats:', error);
      return {
        hasPersonalization: false,
        interactionCount: 0,
        integrationsConnected: 0,
        preferencesConfigured: false,
        personalizationLevel: 0
      };
    }
  }

  /**
   * Calculate personalization level (0-100)
   */
  calculatePersonalizationLevel(profile, interactionCount) {
    let level = 0;

    // Base level for having a profile
    level += 20;

    // Add points for integrations
    level += profile.integrations.count * 15;

    // Add points for configured preferences
    if (profile.preferences && profile.preferences !== this.defaultPreferences) {
      level += 20;
    }

    // Add points for interaction history
    level += Math.min(30, Math.floor(interactionCount / 5) * 2);

    return Math.min(100, level);
  }
}

module.exports = PersonalizationManager;