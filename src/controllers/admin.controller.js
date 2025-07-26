const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { body, query, validationResult } = require('express-validator');

class AdminController {
  // Middleware to check admin role
  static requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Admin access required',
        userRole: req.user?.role || 'none'
      });
    }
    next();
  }

  // Get all users with pagination and filtering
  async getUsers(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { 
        page = 1, 
        limit = 20, 
        search, 
        subscriptionTier, 
        subscriptionStatus,
        isActive,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      // Build where clause
      const where = {};
      
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      if (subscriptionTier) {
        where.subscriptionTier = subscriptionTier;
      }
      
      if (subscriptionStatus) {
        where.subscriptionStatus = subscriptionStatus;
      }
      
      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      // Get users with pagination
      const [users, totalCount] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            name: true,
            subscriptionTier: true,
            subscriptionStatus: true,
            subscriptionExpiry: true,
            monthlyUsageCount: true,
            monthlyUsageLimit: true,
            totalCommandsUsed: true,
            provider: true,
            role: true,
            isActive: true,
            createdAt: true,
            lastActive: true,
            _count: {
              select: {
                integrations: true,
                devices: true,
                voiceCommands: true
              }
            }
          },
          skip,
          take,
          orderBy: {
            [sortBy]: sortOrder
          }
        }),
        prisma.user.count({ where })
      ]);

      const totalPages = Math.ceil(totalCount / take);

      res.json({
        success: true,
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      });
    } catch (error) {
      logger.error('Admin get users failed:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  }

  // Get user details by ID
  async getUserById(req, res) {
    try {
      const { userId } = req.params;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
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
              osVersion: true,
              appVersion: true,
              createdAt: true,
              updatedAt: true
            }
          },
          userPreferences: true,
          subscriptionEvents: {
            select: {
              id: true,
              eventType: true,
              fromTier: true,
              toTier: true,
              price: true,
              currency: true,
              createdAt: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 10
          },
          _count: {
            select: {
              voiceCommands: true,
              conversations: true,
              usageEvents: true,
              notifications: true,
              refreshTokens: true
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Remove sensitive data
      delete user.passwordHash;

      res.json({
        success: true,
        user
      });
    } catch (error) {
      logger.error('Admin get user by ID failed:', error);
      res.status(500).json({ error: 'Failed to get user details' });
    }
  }

  // Update user details (admin only)
  async updateUser(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { userId } = req.params;
      const { 
        subscriptionTier, 
        subscriptionStatus, 
        monthlyUsageLimit, 
        isActive, 
        role 
      } = req.body;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(subscriptionTier && { subscriptionTier }),
          ...(subscriptionStatus && { subscriptionStatus }),
          ...(monthlyUsageLimit !== undefined && { monthlyUsageLimit }),
          ...(isActive !== undefined && { isActive }),
          ...(role && { role })
        },
        select: {
          id: true,
          email: true,
          name: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          monthlyUsageLimit: true,
          isActive: true,
          role: true,
          updatedAt: true
        }
      });

      // Log the admin action
      logger.info(`Admin ${req.user.email} updated user ${userId}`, {
        adminId: req.user.id,
        targetUserId: userId,
        changes: req.body
      });

      res.json({
        success: true,
        user,
        message: 'User updated successfully'
      });
    } catch (error) {
      logger.error('Admin update user failed:', error);
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }
      res.status(500).json({ error: 'Failed to update user' });
    }
  }

  // Reset user usage count
  async resetUserUsage(req, res) {
    try {
      const { userId } = req.params;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          monthlyUsageCount: 0,
          lastUsageReset: new Date()
        },
        select: {
          id: true,
          email: true,
          monthlyUsageCount: true,
          monthlyUsageLimit: true,
          lastUsageReset: true
        }
      });

      // Log the admin action
      logger.info(`Admin ${req.user.email} reset usage for user ${userId}`, {
        adminId: req.user.id,
        targetUserId: userId
      });

      res.json({
        success: true,
        user,
        message: 'User usage reset successfully'
      });
    } catch (error) {
      logger.error('Admin reset user usage failed:', error);
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }
      res.status(500).json({ error: 'Failed to reset user usage' });
    }
  }

  // Get system statistics
  async getSystemStats(req, res) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        activeUsers,
        newUsersThisMonth,
        subscriptionStats,
        usageStats,
        systemHealth
      ] = await Promise.all([
        // Total users
        prisma.user.count(),
        
        // Active users (used in last 7 days)
        prisma.user.count({
          where: {
            lastActive: {
              gte: startOfWeek
            }
          }
        }),
        
        // New users this month
        prisma.user.count({
          where: {
            createdAt: {
              gte: startOfMonth
            }
          }
        }),
        
        // Subscription tier distribution
        prisma.user.groupBy({
          by: ['subscriptionTier'],
          _count: {
            id: true
          }
        }),
        
        // Usage statistics
        prisma.usageEvent.groupBy({
          by: ['eventType'],
          _count: {
            id: true
          },
          where: {
            createdAt: {
              gte: startOfMonth
            }
          }
        }),
        
        // System health indicators
        Promise.all([
          prisma.user.count({ where: { isActive: false } }),
          prisma.integration.count({ where: { isActive: false } }),
          prisma.voiceCommand.count({ 
            where: { 
              status: 'failed',
              createdAt: { gte: startOfWeek }
            }
          })
        ])
      ]);

      const [inactiveUsers, inactiveIntegrations, failedCommands] = systemHealth;

      res.json({
        success: true,
        stats: {
          users: {
            total: totalUsers,
            active: activeUsers,
            newThisMonth: newUsersThisMonth,
            inactive: inactiveUsers,
            activePercentage: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0
          },
          subscriptions: subscriptionStats.reduce((acc, stat) => {
            acc[stat.subscriptionTier] = stat._count.id;
            return acc;
          }, {}),
          usage: {
            thisMonth: usageStats.reduce((acc, stat) => {
              acc[stat.eventType] = stat._count.id;
              return acc;
            }, {}),
            totalThisMonth: usageStats.reduce((sum, stat) => sum + stat._count.id, 0)
          },
          health: {
            inactiveUsers,
            inactiveIntegrations,
            failedCommandsThisWeek: failedCommands,
            overallHealth: failedCommands < 100 && inactiveIntegrations < totalUsers * 0.1 ? 'good' : 'warning'
          }
        },
        generatedAt: now.toISOString()
      });
    } catch (error) {
      logger.error('Admin get system stats failed:', error);
      res.status(500).json({ error: 'Failed to get system statistics' });
    }
  }

  // Get recent user activity
  async getRecentActivity(req, res) {
    try {
      const { limit = 20 } = req.query;

      const recentActivity = await prisma.voiceCommand.findMany({
        select: {
          id: true,
          transcription: true,
          intent: true,
          agentUsed: true,
          status: true,
          platform: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              subscriptionTier: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: parseInt(limit)
      });

      res.json({
        success: true,
        activity: recentActivity
      });
    } catch (error) {
      logger.error('Admin get recent activity failed:', error);
      res.status(500).json({ error: 'Failed to get recent activity' });
    }
  }

  // Deactivate user account
  async deactivateUser(req, res) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false
        },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true
        }
      });

      // Revoke all user tokens
      await prisma.refreshToken.updateMany({
        where: { userId },
        data: { isRevoked: true }
      });

      // Log the admin action
      logger.warn(`Admin ${req.user.email} deactivated user ${userId}`, {
        adminId: req.user.id,
        targetUserId: userId,
        reason: reason || 'No reason provided'
      });

      res.json({
        success: true,
        user,
        message: 'User deactivated successfully'
      });
    } catch (error) {
      logger.error('Admin deactivate user failed:', error);
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }
      res.status(500).json({ error: 'Failed to deactivate user' });
    }
  }

  // Reactivate user account
  async reactivateUser(req, res) {
    try {
      const { userId } = req.params;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: true
        },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true
        }
      });

      // Log the admin action
      logger.info(`Admin ${req.user.email} reactivated user ${userId}`, {
        adminId: req.user.id,
        targetUserId: userId
      });

      res.json({
        success: true,
        user,
        message: 'User reactivated successfully'
      });
    } catch (error) {
      logger.error('Admin reactivate user failed:', error);
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }
      res.status(500).json({ error: 'Failed to reactivate user' });
    }
  }
}

// Validation middleware
const getUsersValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('subscriptionTier').optional().isIn(['free', 'premium', 'pro']).withMessage('Invalid subscription tier'),
  query('subscriptionStatus').optional().isIn(['active', 'cancelled', 'expired']).withMessage('Invalid subscription status'),
  query('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  query('sortBy').optional().isIn(['createdAt', 'lastActive', 'email', 'subscriptionTier']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc')
];

const updateUserValidation = [
  body('subscriptionTier').optional().isIn(['free', 'premium', 'pro']).withMessage('Invalid subscription tier'),
  body('subscriptionStatus').optional().isIn(['active', 'cancelled', 'expired']).withMessage('Invalid subscription status'),
  body('monthlyUsageLimit').optional().isInt({ min: 0 }).withMessage('Monthly usage limit must be non-negative'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('role').optional().isIn(['user', 'admin']).withMessage('Role must be user or admin')
];

const deactivateUserValidation = [
  body('reason').optional().isString().trim().isLength({ max: 500 }).withMessage('Reason must be under 500 characters')
];

const controller = new AdminController();

module.exports = {
  controller,
  requireAdmin: AdminController.requireAdmin,
  getUsersValidation,
  updateUserValidation,
  deactivateUserValidation
};