const UserAnalyticsService = require('../services/analytics/userAnalytics');
const logger = require('../utils/logger');
const { query, body, validationResult } = require('express-validator');

class AnalyticsController {
  // Get user insights
  async getUserInsights(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { days = 30 } = req.query;

      const insights = await UserAnalyticsService.getUserInsights(req.user.id, { days: parseInt(days) });

      res.json({
        success: true,
        insights
      });
    } catch (error) {
      logger.error('Get user insights failed:', error);
      res.status(500).json({ error: 'Failed to get user insights' });
    }
  }

  // Get user recommendations
  async getUserRecommendations(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { days = 30 } = req.query;

      const recommendations = await UserAnalyticsService.getUserRecommendations(req.user.id, { days: parseInt(days) });

      res.json({
        success: true,
        recommendations
      });
    } catch (error) {
      logger.error('Get user recommendations failed:', error);
      res.status(500).json({ error: 'Failed to get user recommendations' });
    }
  }

  // Track user feedback (for improving recommendations)
  async trackFeedback(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { 
        interactionId, 
        wasHelpful, 
        feedback, 
        responseTime,
        intent,
        userInput,
        assistantResponse
      } = req.body;

      // Track the interaction
      await UserAnalyticsService.trackInteraction(req.user.id, {
        interactionType: 'feedback',
        userInput,
        assistantResponse,
        intent,
        responseTime,
        wasHelpful,
        metadata: {
          interactionId,
          feedback,
          timestamp: new Date().toISOString()
        }
      });

      res.json({
        success: true,
        message: 'Feedback tracked successfully'
      });
    } catch (error) {
      logger.error('Track feedback failed:', error);
      res.status(500).json({ error: 'Failed to track feedback' });
    }
  }

  // Get system analytics (admin only)
  async getSystemAnalytics(req, res) {
    try {
      // Check admin role
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { days = 30 } = req.query;

      const analytics = await UserAnalyticsService.getSystemAnalytics({ days: parseInt(days) });

      res.json({
        success: true,
        analytics
      });
    } catch (error) {
      logger.error('Get system analytics failed:', error);
      res.status(500).json({ error: 'Failed to get system analytics' });
    }
  }

  // Get user engagement metrics
  async getUserEngagement(req, res) {
    try {
      const { prisma } = require('../config/database');
      const { days = 30 } = req.query;
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      // Get user's engagement data
      const [
        totalCommands,
        uniqueDaysActive,
        avgSessionLength,
        featureUsage,
        engagementTrend
      ] = await Promise.all([
        // Total voice commands
        prisma.voiceCommand.count({
          where: {
            userId: req.user.id,
            createdAt: { gte: startDate }
          }
        }),

        // Unique days active
        prisma.voiceCommand.findMany({
          where: {
            userId: req.user.id,
            createdAt: { gte: startDate }
          },
          select: {
            createdAt: true
          }
        }).then(commands => {
          const uniqueDays = new Set();
          commands.forEach(cmd => {
            const day = cmd.createdAt.toDateString();
            uniqueDays.add(day);
          });
          return uniqueDays.size;
        }),

        // Average session length (estimate based on command clusters)
        prisma.voiceCommand.findMany({
          where: {
            userId: req.user.id,
            createdAt: { gte: startDate }
          },
          select: {
            createdAt: true
          },
          orderBy: {
            createdAt: 'asc'
          }
        }).then(commands => {
          if (commands.length < 2) return 0;
          
          const sessions = [];
          let currentSession = [commands[0]];
          
          for (let i = 1; i < commands.length; i++) {
            const timeDiff = commands[i].createdAt - commands[i-1].createdAt;
            
            // If more than 5 minutes apart, start new session
            if (timeDiff > 5 * 60 * 1000) {
              sessions.push(currentSession);
              currentSession = [commands[i]];
            } else {
              currentSession.push(commands[i]);
            }
          }
          sessions.push(currentSession);
          
          // Calculate average session length
          const avgLength = sessions.reduce((sum, session) => {
            if (session.length < 2) return sum;
            const sessionStart = session[0].createdAt;
            const sessionEnd = session[session.length - 1].createdAt;
            return sum + (sessionEnd - sessionStart);
          }, 0) / Math.max(sessions.length, 1);
          
          return Math.round(avgLength / 1000 / 60); // Convert to minutes
        }),

        // Feature usage breakdown
        prisma.voiceCommand.groupBy({
          by: ['agentUsed'],
          where: {
            userId: req.user.id,
            createdAt: { gte: startDate },
            agentUsed: { not: null }
          },
          _count: {
            id: true
          }
        }),

        // Engagement trend (weekly)
        Promise.all(Array.from({ length: Math.min(4, Math.ceil(parseInt(days) / 7)) }, (_, i) => {
          const weekStart = new Date();
          weekStart.setDate(weekStart.getDate() - ((i + 1) * 7));
          const weekEnd = new Date();
          weekEnd.setDate(weekEnd.getDate() - (i * 7));
          
          return prisma.voiceCommand.count({
            where: {
              userId: req.user.id,
              createdAt: {
                gte: weekStart,
                lt: weekEnd
              }
            }
          }).then(count => ({
            week: i + 1,
            count
          }));
        }))
      ]);

      // Calculate engagement score (0-100)
      const maxPossibleDays = Math.min(parseInt(days), 30);
      const engagementScore = Math.round(
        ((uniqueDaysActive / maxPossibleDays) * 0.4 + 
         (Math.min(totalCommands / 50, 1)) * 0.3 + 
         (Math.min(avgSessionLength / 10, 1)) * 0.3) * 100
      );

      res.json({
        success: true,
        engagement: {
          score: engagementScore,
          scoreDescription: this.getEngagementDescription(engagementScore),
          metrics: {
            totalCommands,
            uniqueDaysActive,
            averageSessionLength: avgSessionLength,
            daysActive: `${uniqueDaysActive}/${maxPossibleDays}`,
            consistency: Math.round((uniqueDaysActive / maxPossibleDays) * 100)
          },
          features: featureUsage.reduce((acc, feature) => {
            acc[feature.agentUsed] = feature._count.id;
            return acc;
          }, {}),
          trend: engagementTrend.reverse() // Most recent first
        }
      });
    } catch (error) {
      logger.error('Get user engagement failed:', error);
      res.status(500).json({ error: 'Failed to get user engagement metrics' });
    }
  }

  // Helper method for engagement description
  getEngagementDescription(score) {
    if (score >= 80) return 'Highly Engaged - You\'re making great use of your assistant!';
    if (score >= 60) return 'Well Engaged - Good usage patterns, try exploring more features.';
    if (score >= 40) return 'Moderately Engaged - Consider using your assistant more regularly.';
    if (score >= 20) return 'Lightly Engaged - There\'s lots more your assistant can help with!';
    return 'Getting Started - Try using your assistant daily to get the most value.';
  }
}

// Validation middleware
const insightsValidation = [
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365')
];

const feedbackValidation = [
  body('wasHelpful').isBoolean().withMessage('wasHelpful must be a boolean'),
  body('interactionId').optional().isString().withMessage('interactionId must be a string'),
  body('feedback').optional().isString().trim().isLength({ max: 1000 }).withMessage('Feedback must be under 1000 characters'),
  body('responseTime').optional().isInt({ min: 0 }).withMessage('Response time must be non-negative'),
  body('intent').optional().isString().withMessage('Intent must be a string'),
  body('userInput').optional().isString().withMessage('User input must be a string'),
  body('assistantResponse').optional().isString().withMessage('Assistant response must be a string')
];

const systemAnalyticsValidation = [
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365')
];

const controller = new AnalyticsController();

module.exports = {
  controller,
  insightsValidation,
  feedbackValidation,  
  systemAnalyticsValidation
};