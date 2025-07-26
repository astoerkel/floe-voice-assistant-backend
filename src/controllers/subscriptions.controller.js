const AppleIAPService = require('../services/subscriptions/appleIAP');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { body, query, validationResult } = require('express-validator');

class SubscriptionsController {
  constructor() {
    this.appleIAP = new AppleIAPService();
  }

  // Process new subscription purchase
  async processPurchase(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { receiptData, transactionId } = req.body;
      const userId = req.user.id;

      logger.info('Processing subscription purchase', { userId, transactionId });

      const result = await this.appleIAP.processPurchase(userId, receiptData, transactionId);

      if (result.alreadyProcessed) {
        return res.json({
          success: true,
          message: 'Purchase already processed',
          subscription: await this.getUserSubscription(userId)
        });
      }

      res.json({
        success: true,
        message: 'Purchase processed successfully',
        subscription: result.subscription
      });
    } catch (error) {
      logger.error('Purchase processing failed:', error);
      res.status(400).json({ 
        error: 'Purchase processing failed', 
        message: error.message 
      });
    }
  }

  // Restore user purchases
  async restorePurchases(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { receiptData } = req.body;
      const userId = req.user.id;

      logger.info('Restoring purchases', { userId });

      const result = await this.appleIAP.restorePurchases(userId, receiptData);

      res.json({
        success: true,
        message: result.activeSubscriptions.length > 0 
          ? 'Purchases restored successfully' 
          : 'No active purchases found',
        activeSubscriptions: result.activeSubscriptions,
        currentSubscription: await this.getUserSubscription(userId)
      });
    } catch (error) {
      logger.error('Restore purchases failed:', error);
      res.status(400).json({ 
        error: 'Restore purchases failed', 
        message: error.message 
      });
    }
  }

  // Get user's current subscription status
  async getSubscriptionStatus(req, res) {
    try {
      const userId = req.user.id;
      
      const subscription = await this.getUserSubscription(userId);
      
      // Get subscription history
      const history = await prisma.subscriptionEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          eventType: true,
          subscriptionTier: true,
          amount: true,
          currency: true,
          createdAt: true,
          expiryDate: true
        }
      });

      // Get usage stats
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const monthlyUsage = await prisma.voiceCommand.count({
        where: {
          userId,
          createdAt: { gte: monthStart }
        }
      });

      res.json({
        success: true,
        subscription: {
          ...subscription,
          monthlyUsage,
          usagePercentage: subscription.monthlyUsageLimit > 0 
            ? Math.round((monthlyUsage / subscription.monthlyUsageLimit) * 100)
            : 0
        },
        history
      });
    } catch (error) {
      logger.error('Get subscription status failed:', error);
      res.status(500).json({ error: 'Failed to get subscription status' });
    }
  }

  // Handle Apple webhook notifications
  async handleWebhook(req, res) {
    try {
      const signature = req.headers['x-apple-signature'];
      const payload = JSON.stringify(req.body);

      // Validate webhook signature
      if (!this.appleIAP.validateWebhookSignature(payload, signature)) {
        logger.warn('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      logger.info('Processing Apple webhook', { 
        notificationType: req.body.notification_type 
      });

      const result = await this.appleIAP.processWebhook(req.body);

      if (result.success) {
        res.status(200).json({ status: 'ok' });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      logger.error('Webhook processing failed:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  // Get available subscription plans
  async getSubscriptionPlans(req, res) {
    try {
      const plans = [
        {
          id: 'premium_monthly',
          productId: 'com.floe.voiceassistant.premium.monthly',
          name: 'Premium Monthly',
          tier: 'premium',
          duration: 'monthly',
          price: '$4.99',
          features: [
            '500 voice commands per month',
            'Calendar integration',
            'Email integration',
            'Task management',
            'Priority support'
          ],
          usageLimit: 500
        },
        {
          id: 'premium_yearly',
          productId: 'com.floe.voiceassistant.premium.yearly',
          name: 'Premium Yearly',
          tier: 'premium',
          duration: 'yearly',
          price: '$49.99',
          savings: '17% off monthly',
          features: [
            '500 voice commands per month',
            'Calendar integration',
            'Email integration',
            'Task management',
            'Priority support'
          ],
          usageLimit: 500
        },
        {
          id: 'pro_monthly',
          productId: 'com.floe.voiceassistant.pro.monthly',
          name: 'Pro Monthly',
          tier: 'pro',
          duration: 'monthly',
          price: '$9.99',
          features: [
            'Unlimited voice commands',
            'All integrations',
            'Advanced analytics',
            'Custom workflows',
            'Priority support',
            'Beta features'
          ],
          usageLimit: -1
        },
        {
          id: 'pro_yearly',
          productId: 'com.floe.voiceassistant.pro.yearly',
          name: 'Pro Yearly',
          tier: 'pro',
          duration: 'yearly',
          price: '$99.99',
          savings: '17% off monthly',
          features: [
            'Unlimited voice commands',
            'All integrations',
            'Advanced analytics',
            'Custom workflows',
            'Priority support',
            'Beta features'
          ],
          usageLimit: -1
        }
      ];

      res.json({
        success: true,
        plans,
        currentPlan: await this.getUserSubscription(req.user.id)
      });
    } catch (error) {
      logger.error('Get subscription plans failed:', error);
      res.status(500).json({ error: 'Failed to get subscription plans' });
    }
  }

  // Cancel subscription
  async cancelSubscription(req, res) {
    try {
      const userId = req.user.id;
      
      // Update subscription status to cancelled
      // User retains access until expiry date
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: 'cancelled'
        }
      });

      // Record cancellation event
      await prisma.subscriptionEvent.create({
        data: {
          userId,
          eventType: 'manual_cancellation',
          metadata: {
            cancelledAt: new Date().toISOString(),
            reason: req.body.reason || 'user_requested'
          }
        }
      });

      logger.info('Subscription cancelled', { userId });

      res.json({
        success: true,
        message: 'Subscription cancelled. You retain access until your current period ends.',
        subscription: await this.getUserSubscription(userId)
      });
    } catch (error) {
      logger.error('Cancel subscription failed:', error);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  }

  // Reactivate cancelled subscription
  async reactivateSubscription(req, res) {
    try {
      const { receiptData } = req.body;
      const userId = req.user.id;

      // Verify current subscription status with Apple
      const verification = await this.appleIAP.verifyReceipt(receiptData);
      
      if (!verification.success || !verification.latestReceiptInfo) {
        return res.status(400).json({ error: 'Invalid receipt or no active subscription' });
      }

      // Check for active subscription
      const activeTransaction = verification.latestReceiptInfo.find(transaction => {
        const expiryDate = new Date(parseInt(transaction.expires_date_ms));
        return expiryDate > new Date();
      });

      if (!activeTransaction) {
        return res.status(400).json({ error: 'No active subscription found' });
      }

      // Reactivate subscription
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: 'active'
        }
      });

      // Record reactivation event
      await prisma.subscriptionEvent.create({
        data: {
          userId,
          eventType: 'reactivation',
          metadata: {
            reactivatedAt: new Date().toISOString(),
            transactionId: activeTransaction.transaction_id
          }
        }
      });

      logger.info('Subscription reactivated', { userId });

      res.json({
        success: true,
        message: 'Subscription reactivated successfully',
        subscription: await this.getUserSubscription(userId)
      });
    } catch (error) {
      logger.error('Reactivate subscription failed:', error);
      res.status(400).json({ 
        error: 'Failed to reactivate subscription', 
        message: error.message 
      });
    }
  }

  // Get subscription analytics (admin only)
  async getSubscriptionAnalytics(req, res) {
    try {
      // Check admin role
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { days = 30 } = req.query;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      const [
        totalRevenue,
        subscriptionCounts,
        newSubscriptions,
        churnRate,
        topPlans
      ] = await Promise.all([
        // Total revenue
        prisma.subscriptionEvent.aggregate({
          where: {
            eventType: { in: ['purchase', 'renewal'] },
            createdAt: { gte: startDate }
          },
          _sum: { amount: true }
        }),

        // Current subscription distribution
        prisma.user.groupBy({
          by: ['subscriptionTier'],
          _count: { id: true }
        }),

        // New subscriptions
        prisma.subscriptionEvent.count({
          where: {
            eventType: 'purchase',
            createdAt: { gte: startDate }
          }
        }),

        // Churn rate (cancellations vs active)
        Promise.all([
          prisma.subscriptionEvent.count({
            where: {
              eventType: { in: ['cancellation', 'expiration'] },
              createdAt: { gte: startDate }
            }
          }),
          prisma.user.count({
            where: {
              subscriptionStatus: 'active',
              subscriptionTier: { not: 'free' }
            }
          })
        ]),

        // Most popular plans
        prisma.subscriptionEvent.groupBy({
          by: ['subscriptionTier'],
          where: {
            eventType: 'purchase',
            createdAt: { gte: startDate },
            subscriptionTier: { not: null }
          },
          _count: { id: true }
        })
      ]);

      const [cancellations, activeSubscriptions] = churnRate;
      const churnPercentage = activeSubscriptions > 0 
        ? Math.round((cancellations / activeSubscriptions) * 100)
        : 0;

      res.json({
        success: true,
        analytics: {
          revenue: {
            total: totalRevenue._sum.amount || 0,
            period: `${days} days`
          },
          subscriptions: {
            total: subscriptionCounts.reduce((sum, tier) => sum + tier._count.id, 0),
            byTier: subscriptionCounts.reduce((acc, tier) => {
              acc[tier.subscriptionTier] = tier._count.id;
              return acc;
            }, {}),
            new: newSubscriptions,
            churnRate: churnPercentage
          },
          popularPlans: topPlans
            .sort((a, b) => b._count.id - a._count.id)
            .map(plan => ({
              tier: plan.subscriptionTier,
              purchases: plan._count.id
            }))
        }
      });
    } catch (error) {
      logger.error('Get subscription analytics failed:', error);
      res.status(500).json({ error: 'Failed to get subscription analytics' });
    }
  }

  // Helper method to get user subscription info
  async getUserSubscription(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionExpiry: true,
        monthlyUsageLimit: true,
        monthlyUsageCount: true
      }
    });

    if (!user) return null;

    const now = new Date();
    const isExpired = user.subscriptionExpiry && user.subscriptionExpiry < now;
    const daysUntilExpiry = user.subscriptionExpiry 
      ? Math.ceil((user.subscriptionExpiry - now) / (1000 * 60 * 60 * 24))
      : null;

    return {
      tier: user.subscriptionTier,
      status: isExpired ? 'expired' : user.subscriptionStatus,
      expiryDate: user.subscriptionExpiry,
      daysUntilExpiry,
      usageLimit: user.monthlyUsageLimit,
      usageCount: user.monthlyUsageCount,
      isPremium: ['premium', 'pro'].includes(user.subscriptionTier),
      isActive: user.subscriptionStatus === 'active' && !isExpired
    };
  }
}

// Validation middleware
const purchaseValidation = [
  body('receiptData').isString().notEmpty().withMessage('Receipt data is required'),
  body('transactionId').isString().notEmpty().withMessage('Transaction ID is required')
];

const restoreValidation = [
  body('receiptData').isString().notEmpty().withMessage('Receipt data is required')
];

const reactivateValidation = [
  body('receiptData').isString().notEmpty().withMessage('Receipt data is required')
];

const analyticsValidation = [
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365')
];

const controller = new SubscriptionsController();

module.exports = {
  controller,
  purchaseValidation,
  restoreValidation,
  reactivateValidation,
  analyticsValidation
};