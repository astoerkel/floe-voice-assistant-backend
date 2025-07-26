const express = require('express');
const router = express.Router();
const { 
  controller: subscriptionsController,
  purchaseValidation,
  restoreValidation,
  reactivateValidation,
  analyticsValidation
} = require('../controllers/subscriptions.controller');
const { authenticateJWT } = require('../middleware/jwtAuth');

/**
 * @route   POST /api/subscriptions/purchase
 * @desc    Process new subscription purchase
 * @access  Private
 * @body    { receiptData: string, transactionId: string }
 */
router.post('/purchase', authenticateJWT, purchaseValidation, subscriptionsController.processPurchase.bind(subscriptionsController));

/**
 * @route   POST /api/subscriptions/restore
 * @desc    Restore user purchases
 * @access  Private
 * @body    { receiptData: string }
 */
router.post('/restore', authenticateJWT, restoreValidation, subscriptionsController.restorePurchases.bind(subscriptionsController));

/**
 * @route   GET /api/subscriptions/status
 * @desc    Get user's current subscription status
 * @access  Private
 */
router.get('/status', authenticateJWT, subscriptionsController.getSubscriptionStatus.bind(subscriptionsController));

/**
 * @route   GET /api/subscriptions/plans
 * @desc    Get available subscription plans
 * @access  Private
 */
router.get('/plans', authenticateJWT, subscriptionsController.getSubscriptionPlans.bind(subscriptionsController));

/**
 * @route   POST /api/subscriptions/cancel
 * @desc    Cancel subscription (user retains access until expiry)
 * @access  Private
 * @body    { reason?: string }
 */
router.post('/cancel', authenticateJWT, subscriptionsController.cancelSubscription.bind(subscriptionsController));

/**
 * @route   POST /api/subscriptions/reactivate
 * @desc    Reactivate cancelled subscription
 * @access  Private
 * @body    { receiptData: string }
 */
router.post('/reactivate', authenticateJWT, reactivateValidation, subscriptionsController.reactivateSubscription.bind(subscriptionsController));

/**
 * @route   GET /api/subscriptions/analytics
 * @desc    Get subscription analytics (admin only)
 * @access  Admin
 * @query   { days?: number }
 */
router.get('/analytics', authenticateJWT, analyticsValidation, subscriptionsController.getSubscriptionAnalytics.bind(subscriptionsController));

/**
 * @route   POST /api/subscriptions/webhook
 * @desc    Handle Apple App Store Server-to-Server notifications
 * @access  Public (Apple webhook)
 */
router.post('/webhook', subscriptionsController.handleWebhook.bind(subscriptionsController));

module.exports = router;