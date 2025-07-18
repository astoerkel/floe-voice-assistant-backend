const { prisma } = require('../../config/database');
const logger = require('../../utils/logger');

class SpeechAnalyticsService {
  async trackTranscriptionMethod(userId, method, success, processingTime, platform, audioLength = null) {
    try {
      await prisma.transcriptionEvent.create({
        data: {
          userId,
          method, // 'apple_speech' or 'whisper'
          success,
          processingTime,
          platform,
          audioLength,
          createdAt: new Date()
        }
      });
      
      logger.info(`Transcription method tracked: ${method} for user ${userId}, platform: ${platform}`);
    } catch (error) {
      logger.error('Analytics tracking failed:', error);
      // Don't throw - analytics failure shouldn't break the main flow
    }
  }
  
  async getTranscriptionStats(userId, timeframe = '30d') {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeframe));
      
      const stats = await prisma.transcriptionEvent.groupBy({
        by: ['method'],
        where: {
          userId,
          createdAt: { gte: startDate }
        },
        _count: { method: true },
        _avg: { processingTime: true }
      });
      
      return stats.reduce((acc, stat) => {
        acc[stat.method] = {
          count: stat._count.method,
          avgProcessingTime: stat._avg.processingTime
        };
        return acc;
      }, {});
    } catch (error) {
      logger.error('Failed to get transcription stats:', error);
      return {};
    }
  }
  
  async getPlatformUsage(timeframe = '7d') {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeframe));
      
      const usage = await prisma.transcriptionEvent.groupBy({
        by: ['platform', 'method'],
        where: {
          createdAt: { gte: startDate }
        },
        _count: { method: true },
        _avg: { processingTime: true }
      });
      
      return usage.map(item => ({
        platform: item.platform,
        method: item.method,
        count: item._count.method,
        avgProcessingTime: item._avg.processingTime
      }));
    } catch (error) {
      logger.error('Failed to get platform usage:', error);
      return [];
    }
  }
  
  async getMethodPerformance(method, timeframe = '7d') {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeframe));
      
      const performance = await prisma.transcriptionEvent.aggregate({
        where: {
          method,
          createdAt: { gte: startDate }
        },
        _count: { method: true },
        _avg: { processingTime: true },
        _min: { processingTime: true },
        _max: { processingTime: true }
      });
      
      const successRate = await prisma.transcriptionEvent.aggregate({
        where: {
          method,
          success: true,
          createdAt: { gte: startDate }
        },
        _count: { method: true }
      });
      
      return {
        method,
        totalRequests: performance._count.method,
        successfulRequests: successRate._count.method,
        successRate: performance._count.method > 0 ? (successRate._count.method / performance._count.method) * 100 : 0,
        avgProcessingTime: performance._avg.processingTime,
        minProcessingTime: performance._min.processingTime,
        maxProcessingTime: performance._max.processingTime
      };
    } catch (error) {
      logger.error('Failed to get method performance:', error);
      return null;
    }
  }
  
  async getErrorAnalytics(timeframe = '7d') {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeframe));
      
      const errors = await prisma.transcriptionEvent.groupBy({
        by: ['method', 'platform'],
        where: {
          success: false,
          createdAt: { gte: startDate }
        },
        _count: { method: true }
      });
      
      return errors.map(error => ({
        method: error.method,
        platform: error.platform,
        errorCount: error._count.method
      }));
    } catch (error) {
      logger.error('Failed to get error analytics:', error);
      return [];
    }
  }
  
  async getFallbackUsage(timeframe = '7d') {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeframe));
      
      const total = await prisma.transcriptionEvent.count({
        where: {
          createdAt: { gte: startDate }
        }
      });
      
      const whisperUsage = await prisma.transcriptionEvent.count({
        where: {
          method: 'whisper',
          createdAt: { gte: startDate }
        }
      });
      
      const appleUsage = await prisma.transcriptionEvent.count({
        where: {
          method: 'apple_speech',
          createdAt: { gte: startDate }
        }
      });
      
      return {
        total,
        whisperUsage,
        appleUsage,
        fallbackRate: total > 0 ? (whisperUsage / total) * 100 : 0,
        primaryRate: total > 0 ? (appleUsage / total) * 100 : 0
      };
    } catch (error) {
      logger.error('Failed to get fallback usage:', error);
      return {
        total: 0,
        whisperUsage: 0,
        appleUsage: 0,
        fallbackRate: 0,
        primaryRate: 0
      };
    }
  }
}

module.exports = new SpeechAnalyticsService();