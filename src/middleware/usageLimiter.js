const { prisma } = require('../config/database');
const logger = require('../utils/logger');

// Usage limiting middleware
const checkUsageLimit = async (req, res, next) => {
  try {
    // Skip if user is not authenticated
    if (!req.user) {
      return next();
    }
    
    const user = req.user;
    
    // Check if user has exceeded their monthly limit
    if (user.monthlyUsageCount >= user.monthlyUsageLimit) {
      // Check subscription tier for upgrade message
      let upgradeMessage;
      switch (user.subscriptionTier) {
        case 'free':
          upgradeMessage = 'You\'ve reached your monthly limit of 50 commands. Upgrade to Premium for 500 commands/month or Pro for unlimited usage.';
          break;
        case 'premium':
          upgradeMessage = 'You\'ve reached your monthly limit of 500 commands. Upgrade to Pro for unlimited usage.';
          break;
        default:
          upgradeMessage = 'You\'ve reached your usage limit. Please contact support.';
      }
      
      return res.status(402).json({
        error: 'Usage limit exceeded',
        message: upgradeMessage,
        usageInfo: {
          current: user.monthlyUsageCount,
          limit: user.monthlyUsageLimit,
          tier: user.subscriptionTier,
          nextReset: getNextMonthReset()
        },
        upgradeRequired: true
      });
    }
    
    // Increment usage count
    await prisma.user.update({
      where: { id: user.id },
      data: {
        monthlyUsageCount: user.monthlyUsageCount + 1,
        totalCommandsUsed: { increment: 1 }
      }
    });
    
    // Log usage event
    await prisma.usageEvent.create({
      data: {
        userId: user.id,
        eventType: 'voice_command',
        feature: determineFeature(req),
        monthYear: getMonthYear()
      }
    });
    
    // Update user object for downstream middleware
    req.user.monthlyUsageCount += 1;
    
    logger.info(`Usage incremented for user ${user.id}`, {
      newCount: req.user.monthlyUsageCount,
      limit: user.monthlyUsageLimit,
      tier: user.subscriptionTier
    });
    
    next();
  } catch (error) {
    logger.error('Usage limit check failed:', error);
    // Don't block the request on usage tracking errors
    next();
  }
};

// Check if user has access to specific features based on subscription
const checkFeatureAccess = (requiredTier = 'free') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please sign in to access this feature'
      });
    }
    
    const tierHierarchy = { 'free': 0, 'premium': 1, 'pro': 2 };
    const userTierLevel = tierHierarchy[req.user.subscriptionTier] || 0;
    const requiredTierLevel = tierHierarchy[requiredTier] || 0;
    
    if (userTierLevel < requiredTierLevel) {
      const upgradeMessage = getUpgradeMessage(req.user.subscriptionTier, requiredTier);
      return res.status(402).json({
        error: 'Upgrade required',
        message: upgradeMessage,
        currentTier: req.user.subscriptionTier,
        requiredTier,
        upgradeRequired: true
      });
    }
    
    next();
  };
};

// Helper functions
function determineFeature(req) {
  const path = req.path.toLowerCase();
  if (path.includes('calendar')) return 'calendar';
  if (path.includes('email')) return 'email';
  if (path.includes('task')) return 'tasks';
  if (path.includes('voice')) return 'basic_chat';
  return 'api_call';
}

function getMonthYear() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getNextMonthReset() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString();
}

function getUpgradeMessage(currentTier, requiredTier) {
  if (currentTier === 'free' && requiredTier === 'premium') {
    return 'This feature requires Premium subscription. Upgrade to access Google integrations and 500 commands/month.';
  }
  if (currentTier === 'free' && requiredTier === 'pro') {
    return 'This feature requires Pro subscription. Upgrade to access all integrations and unlimited usage.';
  }
  if (currentTier === 'premium' && requiredTier === 'pro') {
    return 'This feature requires Pro subscription. Upgrade for unlimited usage and advanced integrations.';
  }
  return `This feature requires ${requiredTier} subscription. Please upgrade your account.`;
}

module.exports = {
  checkUsageLimit,
  checkFeatureAccess
};