const { prisma } = require('../../config/database');
const logger = require('../../utils/logger');

class UserAnalyticsService {
  // Track user interaction
  static async trackInteraction(userId, data) {
    try {
      const {
        interactionType = 'voice_command',
        userInput,
        assistantResponse,
        intent,
        confidence,
        responseTime,
        wasHelpful,
        integrationUsed,
        platform = 'ios'
      } = data;

      // Get current time context
      const now = new Date();
      const timeOfDay = this.getTimeOfDay(now);
      const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

      await prisma.userLearningData.create({
        data: {
          userId,
          interactionType,
          userInput,
          assistantResponse,
          intent,
          confidence,
          responseTime,
          wasHelpful,
          integrationUsed,
          metadata: {
            platform,
            timeOfDay,
            dayOfWeek,
            timestamp: now.toISOString()
          }
        }
      });

      logger.debug(`User interaction tracked for ${userId}`, {
        intent,
        confidence,
        responseTime
      });
    } catch (error) {
      logger.error('Failed to track user interaction:', error);
      // Don't throw - analytics shouldn't break the main flow
    }
  }

  // Get user behavior insights
  static async getUserInsights(userId, options = {}) {
    try {
      const { days = 30 } = options;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get user learning data
      const interactions = await prisma.userLearningData.findMany({
        where: {
          userId,
          createdAt: {
            gte: startDate
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (interactions.length === 0) {
        return {
          totalInteractions: 0,
          insights: {
            message: 'Not enough data for insights yet. Keep using the assistant!'
          }
        };
      }

      // Analyze patterns
      const insights = {
        totalInteractions: interactions.length,
        averageConfidence: this.calculateAverageConfidence(interactions),
        averageResponseTime: this.calculateAverageResponseTime(interactions),
        mostUsedIntents: this.getMostUsedIntents(interactions),
        mostActiveTimeOfDay: this.getMostActiveTimeOfDay(interactions),
        mostActiveDayOfWeek: this.getMostActiveDayOfWeek(interactions),
        successRate: this.calculateSuccessRate(interactions),
        integrationUsage: this.getIntegrationUsage(interactions),
        helpfulnessScore: this.calculateHelpfulnessScore(interactions),
        trends: this.analyzeTrends(interactions, days)
      };

      return insights;
    } catch (error) {
      logger.error('Failed to get user insights:', error);
      throw error;
    }
  }

  // Get user recommendations based on behavior
  static async getUserRecommendations(userId, options = {}) {
    try {
      const insights = await this.getUserInsights(userId, options);
      const recommendations = [];

      // Low success rate recommendation
      if (insights.successRate < 0.7) {
        recommendations.push({
          type: 'improvement',
          title: 'Improve Voice Recognition',
          description: 'Try speaking more clearly and in quieter environments for better recognition.',
          priority: 'high'
        });
      }

      // Unused features recommendation
      const availableIntegrations = ['google', 'calendar', 'email', 'tasks'];
      const unusedIntegrations = availableIntegrations.filter(
        integration => !insights.integrationUsage[integration]
      );

      if (unusedIntegrations.length > 0) {
        recommendations.push({
          type: 'feature',
          title: 'Try New Features',
          description: `Connect ${unusedIntegrations.join(', ')} to get more from your assistant.`,
          priority: 'medium'
        });
      }

      // Time-based recommendation
      if (insights.mostActiveTimeOfDay) {
        recommendations.push({
          type: 'optimization',
          title: 'Peak Performance Time',
          description: `You're most active during ${insights.mostActiveTimeOfDay}. Consider setting up recurring tasks for this time.`,
          priority: 'low'
        });
      }

      // Subscription upgrade recommendation
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true, monthlyUsageCount: true, monthlyUsageLimit: true }
      });

      if (user && user.monthlyUsageCount > user.monthlyUsageLimit * 0.8) {
        recommendations.push({
          type: 'subscription',
          title: 'Consider Upgrading',
          description: `You're using ${Math.round((user.monthlyUsageCount / user.monthlyUsageLimit) * 100)}% of your monthly limit. Upgrade for unlimited usage.`,
          priority: 'medium'
        });
      }

      return recommendations;
    } catch (error) {
      logger.error('Failed to get user recommendations:', error);
      throw error;
    }
  }

  // Helper methods
  static getTimeOfDay(date) {
    const hour = date.getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  static calculateAverageConfidence(interactions) {
    const withConfidence = interactions.filter(i => i.confidence !== null);
    if (withConfidence.length === 0) return null;
    
    const sum = withConfidence.reduce((acc, i) => acc + i.confidence, 0);
    return Math.round((sum / withConfidence.length) * 100) / 100;
  }

  static calculateAverageResponseTime(interactions) {
    const withResponseTime = interactions.filter(i => i.responseTime !== null);
    if (withResponseTime.length === 0) return null;
    
    const sum = withResponseTime.reduce((acc, i) => acc + i.responseTime, 0);
    return Math.round(sum / withResponseTime.length);
  }

  static getMostUsedIntents(interactions) {
    const intentCounts = {};
    interactions.forEach(i => {
      if (i.intent) {
        intentCounts[i.intent] = (intentCounts[i.intent] || 0) + 1;
      }
    });

    return Object.entries(intentCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([intent, count]) => ({ intent, count }));
  }

  static getMostActiveTimeOfDay(interactions) {
    const timeCounts = {};
    interactions.forEach(i => {
      if (i.metadata && i.metadata.timeOfDay) {
        const timeOfDay = i.metadata.timeOfDay;
        timeCounts[timeOfDay] = (timeCounts[timeOfDay] || 0) + 1;
      }
    });

    const mostActive = Object.entries(timeCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    return mostActive ? mostActive[0] : null;
  }

  static getMostActiveDayOfWeek(interactions) {
    const dayCounts = {};
    interactions.forEach(i => {
      if (i.metadata && i.metadata.dayOfWeek) {
        const dayOfWeek = i.metadata.dayOfWeek;
        dayCounts[dayOfWeek] = (dayCounts[dayOfWeek] || 0) + 1;
      }
    });

    const mostActive = Object.entries(dayCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    return mostActive ? mostActive[0] : null;
  }

  static calculateSuccessRate(interactions) {
    const withFeedback = interactions.filter(i => i.wasHelpful !== null);
    if (withFeedback.length === 0) return null;
    
    const helpful = withFeedback.filter(i => i.wasHelpful === true).length;
    return Math.round((helpful / withFeedback.length) * 100) / 100;
  }

  static getIntegrationUsage(interactions) {
    const integrationCounts = {};
    interactions.forEach(i => {
      if (i.integrationUsed) {
        integrationCounts[i.integrationUsed] = (integrationCounts[i.integrationUsed] || 0) + 1;
      }
    });

    return integrationCounts;
  }

  static calculateHelpfulnessScore(interactions) {
    const withFeedback = interactions.filter(i => i.wasHelpful !== null);
    if (withFeedback.length === 0) return null;
    
    const positiveRatio = withFeedback.filter(i => i.wasHelpful === true).length / withFeedback.length;
    return Math.round(positiveRatio * 100);
  }

  static analyzeTrends(interactions, days) {
    // Split interactions into periods
    const periodsCount = Math.min(days / 7, 4); // Max 4 periods
    const periodLength = days / periodsCount;
    const periods = [];

    for (let i = 0; i < periodsCount; i++) {
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - (days - (i * periodLength)));
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() - (days - ((i + 1) * periodLength)));

      const periodInteractions = interactions.filter(interaction => {
        const interactionDate = new Date(interaction.createdAt);
        return interactionDate >= periodStart && interactionDate < periodEnd;
      });

      periods.push({
        period: i + 1,
        count: periodInteractions.length,
        averageConfidence: this.calculateAverageConfidence(periodInteractions),
        successRate: this.calculateSuccessRate(periodInteractions)
      });
    }

    // Calculate trends
    const usageTrend = periods.length > 1 
      ? periods[periods.length - 1].count > periods[0].count ? 'increasing' : 'decreasing'
      : 'stable';

    return {
      periods,
      usageTrend,
      totalGrowth: periods.length > 1 
        ? ((periods[periods.length - 1].count - periods[0].count) / Math.max(periods[0].count, 1)) * 100
        : 0
    };
  }

  // Get aggregated analytics for admin dashboard
  static async getSystemAnalytics(options = {}) {
    try {
      const { days = 30 } = options;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [
        totalInteractions,
        uniqueUsers,
        averageInteractionsPerUser,
        topIntents,
        platformDistribution,
        timeDistribution
      ] = await Promise.all([
        // Total interactions
        prisma.userLearningData.count({
          where: {
            createdAt: { gte: startDate }
          }
        }),

        // Unique users
        prisma.userLearningData.findMany({
          where: {
            createdAt: { gte: startDate }
          },
          select: { userId: true },
          distinct: ['userId']
        }),

        // Average interactions per user
        prisma.userLearningData.groupBy({
          by: ['userId'],
          where: {
            createdAt: { gte: startDate }
          },
          _count: {
            id: true
          }
        }),

        // Top intents
        prisma.userLearningData.groupBy({
          by: ['intent'],
          where: {
            createdAt: { gte: startDate },
            intent: { not: null }
          },
          _count: {
            id: true
          },
          orderBy: {
            _count: {
              id: 'desc'
            }
          },
          take: 10
        }),

        // Platform distribution
        prisma.userLearningData.groupBy({
          by: ['metadata'],
          where: {
            createdAt: { gte: startDate }
          },
          _count: {
            id: true
          }
        }),

        // Time distribution
        prisma.userLearningData.findMany({
          where: {
            createdAt: { gte: startDate }
          },
          select: {
            metadata: true
          }
        })
      ]);

      // Process platform distribution
      const platforms = {};
      platformDistribution.forEach(item => {
        if (item.metadata && item.metadata.platform) {
          const platform = item.metadata.platform;
          platforms[platform] = (platforms[platform] || 0) + item._count.id;
        }
      });

      // Process time distribution
      const timeOfDayCount = {};
      timeDistribution.forEach(item => {
        if (item.metadata && item.metadata.timeOfDay) {
          const timeOfDay = item.metadata.timeOfDay;
          timeOfDayCount[timeOfDay] = (timeOfDayCount[timeOfDay] || 0) + 1;
        }
      });

      const avgInteractionsPerUser = averageInteractionsPerUser.length > 0
        ? Math.round(averageInteractionsPerUser.reduce((sum, user) => sum + user._count.id, 0) / averageInteractionsPerUser.length)
        : 0;

      return {
        overview: {
          totalInteractions,
          uniqueUsers: uniqueUsers.length,
          averageInteractionsPerUser: avgInteractionsPerUser
        },
        topIntents: topIntents.map(item => ({
          intent: item.intent,
          count: item._count.id
        })),
        platforms,
        timeOfDayDistribution: timeOfDayCount,
        period: `${days} days`
      };
    } catch (error) {
      logger.error('Failed to get system analytics:', error);
      throw error;
    }
  }
}

module.exports = UserAnalyticsService;