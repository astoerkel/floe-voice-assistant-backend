const logger = require('../../../utils/logger');

class PersonalizationManager {
  constructor(dbAdapter) {
    this.db = dbAdapter;
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
      // If no database, return default profile
      if (!this.db || !this.db.db) {
        logger.warn('No database available, using default profile');
        return this.getDefaultProfile(userId);
      }

      // Get user from database adapter
      const user = await this.db.getUserById(userId);
      
      if (!user) {
        logger.warn(`User ${userId} not found, using default profile`);
        return this.getDefaultProfile(userId);
      }

      // Build profile
      const profile = {
        userId: user.id,
        name: user.name || 'User',
        email: user.email,
        timezone: user.timezone || this.defaultPreferences.timezone,
        preferences: user.preferences || this.defaultPreferences,
        communicationStyle: this.determineCommunicationStyle(user),
        activeIntegrations: this.getActiveIntegrations(user),
        usage: {
          totalCommands: user.totalCommandsUsed || 0,
          monthlyUsage: user.monthlyUsageCount || 0,
          subscriptionTier: user.subscriptionTier || 'free'
        },
        context: {
          lastSeen: user.lastSeenAt || new Date(),
          createdAt: user.createdAt
        }
      };

      return profile;

    } catch (error) {
      logger.error('Error getting user profile:', error);
      return this.getDefaultProfile(userId);
    }
  }

  /**
   * Get default profile when database is not available
   */
  getDefaultProfile(userId) {
    return {
      userId,
      name: 'User',
      email: null,
      timezone: this.defaultPreferences.timezone,
      preferences: this.defaultPreferences,
      communicationStyle: this.defaultPreferences.communicationStyle,
      activeIntegrations: [],
      usage: {
        totalCommands: 0,
        monthlyUsage: 0,
        subscriptionTier: 'free'
      },
      context: {
        lastSeen: new Date(),
        createdAt: new Date()
      }
    };
  }

  /**
   * Determine communication style based on user data
   */
  determineCommunicationStyle(user) {
    // If user has preferences, use them
    if (user.preferences && user.preferences.communicationStyle) {
      return user.preferences.communicationStyle;
    }

    // Otherwise, use defaults
    return this.defaultPreferences.communicationStyle;
  }

  /**
   * Get active integrations from user data
   */
  getActiveIntegrations(user) {
    const integrations = [];

    // Check for integrations in user data
    if (user.integrations) {
      user.integrations.forEach(integration => {
        if (integration.isActive) {
          integrations.push({
            type: integration.type,
            provider: integration.provider,
            connectedAt: integration.createdAt
          });
        }
      });
    }

    return integrations;
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId, preferences) {
    try {
      if (!this.db || !this.db.db) {
        logger.warn('Cannot update preferences - no database connection');
        return null;
      }

      // Update user preferences
      const updatedUser = await this.db.updateUserUsage(userId, 0);
      
      logger.info(`Updated preferences for user ${userId}`);
      return updatedUser;

    } catch (error) {
      logger.error('Error updating user preferences:', error);
      return null;
    }
  }

  /**
   * Get personalized system prompt based on user profile
   */
  getPersonalizedSystemPrompt(profile) {
    const style = profile.communicationStyle;
    let toneAdjustment = '';

    // Adjust tone based on communication style
    if (style.formality === 'formal') {
      toneAdjustment += 'Maintain a professional and formal tone. ';
    } else if (style.formality === 'casual') {
      toneAdjustment += 'Use a friendly and casual conversational tone. ';
    }

    if (style.verbosity === 'brief') {
      toneAdjustment += 'Keep responses very concise and to the point. ';
    } else if (style.verbosity === 'detailed') {
      toneAdjustment += 'Provide comprehensive and detailed responses. ';
    }

    if (style.enthusiasm === 'high') {
      toneAdjustment += 'Be enthusiastic and encouraging. ';
    } else if (style.enthusiasm === 'low') {
      toneAdjustment += 'Maintain a calm and measured tone. ';
    }

    return toneAdjustment;
  }

  /**
   * Get user context for better responses
   */
  getUserContext(profile) {
    const context = {
      name: profile.name,
      timezone: profile.timezone,
      workingHours: profile.preferences.workingHours,
      activeIntegrations: profile.activeIntegrations.map(i => i.type),
      subscriptionTier: profile.usage.subscriptionTier
    };

    return context;
  }
}

module.exports = PersonalizationManager;