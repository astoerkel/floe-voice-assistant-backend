const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { body, validationResult, query } = require('express-validator');
const bcrypt = require('bcryptjs');

class UserController {
  // Get current user's detailed profile
  async getProfile(req, res) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          preferredName: true,
          profilePictureUrl: true,
          timezone: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          subscriptionExpiry: true,
          monthlyUsageCount: true,
          monthlyUsageLimit: true,
          totalCommandsUsed: true,
          lastUsageReset: true,
          provider: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastActive: true,
          integrations: {
            select: {
              id: true,
              type: true,
              isActive: true,
              lastSyncAt: true,
              createdAt: true
            }
          },
          devices: {
            select: {
              id: true,
              name: true,
              type: true,
              active: true,
              lastUpdated: true
            },
            where: { active: true }
          },
          userPreferences: {
            select: {
              responseLength: true,
              communicationFormality: true,
              responseVerbosity: true,
              enthusiasmLevel: true,
              reminderStyle: true,
              defaultMeetingDuration: true,
              workStartTime: true,
              workEndTime: true,
              workDays: true,
              timezone: true,
              preferredInteractionTime: true
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Calculate usage percentage
      const usagePercentage = user.monthlyUsageLimit > 0 
        ? Math.round((user.monthlyUsageCount / user.monthlyUsageLimit) * 100)
        : 0;

      res.json({
        success: true,
        user: {
          ...user,
          usagePercentage,
          subscriptionActive: user.subscriptionStatus === 'active',
          isPremium: ['premium', 'pro'].includes(user.subscriptionTier)
        }
      });
    } catch (error) {
      logger.error('Get profile failed:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }

  // Update user profile
  async updateProfile(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { 
        name, 
        preferredName, 
        timezone, 
        profilePictureUrl 
      } = req.body;

      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          ...(name && { name }),
          ...(preferredName && { preferredName }),
          ...(timezone && { timezone }),
          ...(profilePictureUrl && { profilePictureUrl }),
          lastActive: new Date()
        },
        select: {
          id: true,
          email: true,
          name: true,
          preferredName: true,
          profilePictureUrl: true,
          timezone: true,
          lastActive: true
        }
      });

      res.json({
        success: true,
        user,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      logger.error('Update profile failed:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }

  // Get user preferences
  async getPreferences(req, res) {
    try {
      let preferences = await prisma.userPreferences.findUnique({
        where: { userId: req.user.id }
      });

      // Create default preferences if none exist
      if (!preferences) {
        preferences = await prisma.userPreferences.create({
          data: {
            userId: req.user.id,
            responseLength: 'balanced',
            communicationFormality: 'balanced',
            responseVerbosity: 'balanced',
            enthusiasmLevel: 'balanced',
            reminderStyle: 'friendly',
            defaultMeetingDuration: 60,
            workStartTime: '09:00',
            workEndTime: '17:00',
            workDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
            timezone: 'America/New_York',
            preferredInteractionTime: 'morning'
          }
        });
      }

      res.json({
        success: true,
        preferences: {
          ...preferences,
          workDays: preferences.workDays ? JSON.parse(preferences.workDays) : []
        }
      });
    } catch (error) {
      logger.error('Get preferences failed:', error);
      res.status(500).json({ error: 'Failed to get preferences' });
    }
  }

  // Update user preferences
  async updatePreferences(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const {
        responseLength,
        communicationFormality,
        responseVerbosity,
        enthusiasmLevel,
        reminderStyle,
        defaultMeetingDuration,
        workStartTime,
        workEndTime,
        workDays,
        timezone,
        preferredInteractionTime
      } = req.body;

      const preferences = await prisma.userPreferences.upsert({
        where: { userId: req.user.id },
        create: {
          userId: req.user.id,
          responseLength,
          communicationFormality,
          responseVerbosity,
          enthusiasmLevel,
          reminderStyle,
          defaultMeetingDuration,
          workStartTime,
          workEndTime,
          workDays: workDays ? JSON.stringify(workDays) : null,
          timezone,
          preferredInteractionTime
        },
        update: {
          ...(responseLength && { responseLength }),
          ...(communicationFormality && { communicationFormality }),
          ...(responseVerbosity && { responseVerbosity }),
          ...(enthusiasmLevel && { enthusiasmLevel }),
          ...(reminderStyle && { reminderStyle }),
          ...(defaultMeetingDuration && { defaultMeetingDuration }),
          ...(workStartTime && { workStartTime }),
          ...(workEndTime && { workEndTime }),
          ...(workDays && { workDays: JSON.stringify(workDays) }),
          ...(timezone && { timezone }),
          ...(preferredInteractionTime && { preferredInteractionTime })
        }
      });

      res.json({
        success: true,
        preferences: {
          ...preferences,
          workDays: preferences.workDays ? JSON.parse(preferences.workDays) : []
        },
        message: 'Preferences updated successfully'
      });
    } catch (error) {
      logger.error('Update preferences failed:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  }

  // Get user usage statistics
  async getUsageStats(req, res) {
    try {
      const { period = 'month' } = req.query;
      
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          monthlyUsageCount: true,
          monthlyUsageLimit: true,
          totalCommandsUsed: true,
          lastUsageReset: true,
          subscriptionTier: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get usage events for the specified period
      const now = new Date();
      let startDate;
      
      switch (period) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const usageEvents = await prisma.usageEvent.findMany({
        where: {
          userId: req.user.id,
          createdAt: {
            gte: startDate
          }
        },
        select: {
          eventType: true,
          feature: true,
          createdAt: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Group by feature
      const usageByFeature = {};
      const dailyUsage = {};

      usageEvents.forEach(event => {
        // By feature
        if (!usageByFeature[event.feature]) {
          usageByFeature[event.feature] = 0;
        }
        usageByFeature[event.feature]++;

        // By day
        const day = event.createdAt.toISOString().split('T')[0];
        if (!dailyUsage[day]) {
          dailyUsage[day] = 0;
        }
        dailyUsage[day]++;
      });

      res.json({
        success: true,
        stats: {
          currentPeriod: {
            used: user.monthlyUsageCount,
            limit: user.monthlyUsageLimit,
            percentage: user.monthlyUsageLimit > 0 
              ? Math.round((user.monthlyUsageCount / user.monthlyUsageLimit) * 100)
              : 0
          },
          lifetime: {
            totalCommands: user.totalCommandsUsed,
            memberSince: user.createdAt
          },
          breakdown: {
            byFeature: usageByFeature,
            byDay: dailyUsage
          },
          subscription: {
            tier: user.subscriptionTier,
            nextReset: new Date(now.getFullYear(), now.getMonth() + 1, 1)
          }
        }
      });
    } catch (error) {
      logger.error('Get usage stats failed:', error);
      res.status(500).json({ error: 'Failed to get usage statistics' });
    }
  }

  // Get user devices
  async getDevices(req, res) {
    try {
      const devices = await prisma.device.findMany({
        where: { userId: req.user.id },
        select: {
          id: true,
          name: true,
          type: true,
          osVersion: true,
          appVersion: true,
          active: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      res.json({
        success: true,
        devices
      });
    } catch (error) {
      logger.error('Get devices failed:', error);
      res.status(500).json({ error: 'Failed to get devices' });
    }
  }

  // Update device information
  async updateDevice(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { deviceId } = req.params;
      const { name, osVersion, appVersion, active } = req.body;

      const device = await prisma.device.update({
        where: { 
          id: deviceId,
          userId: req.user.id // Ensure user owns the device
        },
        data: {
          ...(name && { name }),
          ...(osVersion && { osVersion }),
          ...(appVersion && { appVersion }),
          ...(active !== undefined && { active })
        }
      });

      res.json({
        success: true,
        device,
        message: 'Device updated successfully'
      });
    } catch (error) {
      logger.error('Update device failed:', error);
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Device not found' });
      }
      res.status(500).json({ error: 'Failed to update device' });
    }
  }

  // Register or update device
  async registerDevice(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { name, type, osVersion, appVersion, pushToken } = req.body;

      const device = await prisma.device.upsert({
        where: {
          pushToken: pushToken || `${req.user.id}-${type}-${Date.now()}`
        },
        create: {
          userId: req.user.id,
          name,
          type,
          osVersion,
          appVersion,
          pushToken: pushToken || null,
          active: true
        },
        update: {
          name,
          osVersion,
          appVersion,
          active: true,
          updatedAt: new Date()
        }
      });

      res.json({
        success: true,
        device,
        message: 'Device registered successfully'
      });
    } catch (error) {
      logger.error('Register device failed:', error);
      res.status(500).json({ error: 'Failed to register device' });
    }
  }

  // Delete user account
  async deleteAccount(req, res) {
    try {
      const { confirmation } = req.body;
      
      if (confirmation !== 'DELETE_ACCOUNT') {
        return res.status(400).json({ 
          error: 'Account deletion requires confirmation', 
          required: 'Send { "confirmation": "DELETE_ACCOUNT" }' 
        });
      }

      // Start transaction to ensure atomicity
      await prisma.$transaction(async (tx) => {
        // Delete related data first
        await tx.usageEvent.deleteMany({ where: { userId: req.user.id } });
        await tx.subscriptionEvent.deleteMany({ where: { userId: req.user.id } });
        await tx.userLearningData.deleteMany({ where: { userId: req.user.id } });
        await tx.userPreferences.deleteMany({ where: { userId: req.user.id } });
        await tx.refreshToken.deleteMany({ where: { userId: req.user.id } });
        await tx.device.deleteMany({ where: { userId: req.user.id } });
        await tx.notification.deleteMany({ where: { userId: req.user.id } });
        await tx.voiceCommand.deleteMany({ where: { userId: req.user.id } });
        await tx.integration.deleteMany({ where: { userId: req.user.id } });
        await tx.conversation.deleteMany({ where: { userId: req.user.id } });
        
        // Finally delete the user
        await tx.user.delete({ where: { id: req.user.id } });
      });

      logger.info(`User account deleted: ${req.user.id}`);

      res.json({
        success: true,
        message: 'Account deleted permanently'
      });
    } catch (error) {
      logger.error('Delete account failed:', error);
      res.status(500).json({ error: 'Failed to delete account' });
    }
  }

  // Export user data (GDPR compliance)
  async exportData(req, res) {
    try {
      const userData = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          integrations: true,
          voiceCommands: {
            select: {
              id: true,
              transcription: true,
              intent: true,
              agentUsed: true,
              status: true,
              platform: true,
              createdAt: true
            }
          },
          conversations: {
            include: {
              messages: true
            }
          },
          devices: true,
          notifications: true,
          userPreferences: true,
          usageEvents: true,
          subscriptionEvents: true,
          userLearningData: true
        }
      });

      if (!userData) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Remove sensitive data
      delete userData.passwordHash;
      delete userData.refreshTokens;

      res.json({
        success: true,
        data: userData,
        exportedAt: new Date().toISOString(),
        message: 'Personal data exported successfully'
      });
    } catch (error) {
      logger.error('Export data failed:', error);
      res.status(500).json({ error: 'Failed to export data' });
    }
  }
}

// Validation middleware
const updateProfileValidation = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('preferredName').optional().isString().trim().isLength({ min: 1, max: 50 }).withMessage('Preferred name must be 1-50 characters'),
  body('timezone').optional().isString().withMessage('Timezone must be a string'),
  body('profilePictureUrl').optional().isURL().withMessage('Profile picture must be a valid URL')
];

const updatePreferencesValidation = [
  body('responseLength').optional().isIn(['brief', 'balanced', 'detailed']).withMessage('Invalid response length'),
  body('communicationFormality').optional().isIn(['formal', 'balanced', 'casual']).withMessage('Invalid communication formality'),
  body('responseVerbosity').optional().isIn(['brief', 'balanced', 'detailed']).withMessage('Invalid response verbosity'),
  body('enthusiasmLevel').optional().isIn(['low', 'balanced', 'high']).withMessage('Invalid enthusiasm level'),
  body('reminderStyle').optional().isIn(['formal', 'friendly', 'urgent']).withMessage('Invalid reminder style'),
  body('defaultMeetingDuration').optional().isInt({ min: 15, max: 480 }).withMessage('Meeting duration must be 15-480 minutes'),
  body('workStartTime').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid work start time format (HH:MM)'),
  body('workEndTime').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid work end time format (HH:MM)'),
  body('workDays').optional().isArray().withMessage('Work days must be an array'),
  body('timezone').optional().isString().withMessage('Timezone must be a string'),
  body('preferredInteractionTime').optional().isIn(['morning', 'afternoon', 'evening', 'night']).withMessage('Invalid preferred interaction time')
];

const deviceValidation = [
  body('name').notEmpty().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Device name is required (1-100 characters)'),
  body('type').notEmpty().isIn(['ios', 'watchos', 'android', 'web']).withMessage('Device type must be ios, watchos, android, or web'),
  body('osVersion').optional().isString().trim().isLength({ max: 50 }).withMessage('OS version must be under 50 characters'),
  body('appVersion').optional().isString().trim().isLength({ max: 50 }).withMessage('App version must be under 50 characters'),
  body('pushToken').optional().isString().trim().withMessage('Push token must be a string')
];

const updateDeviceValidation = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Device name must be 1-100 characters'),
  body('osVersion').optional().isString().trim().isLength({ max: 50 }).withMessage('OS version must be under 50 characters'),
  body('appVersion').optional().isString().trim().isLength({ max: 50 }).withMessage('App version must be under 50 characters'),
  body('active').optional().isBoolean().withMessage('Active must be a boolean')
];

const usageStatsValidation = [
  query('period').optional().isIn(['week', 'month', 'year']).withMessage('Period must be week, month, or year')
];

const controller = new UserController();

module.exports = {
  controller,
  updateProfileValidation,
  updatePreferencesValidation,
  deviceValidation,
  updateDeviceValidation,
  usageStatsValidation
};