const express = require('express');
const router = express.Router();
const { 
  controller: analyticsController,
  insightsValidation,
  feedbackValidation,
  systemAnalyticsValidation
} = require('../controllers/analytics.controller');
const { authenticateJWT } = require('../middleware/jwtAuth');

/**
 * @route   GET /api/analytics/insights
 * @desc    Get user behavior insights
 * @access  Private
 */
router.get('/insights', authenticateJWT, insightsValidation, analyticsController.getUserInsights);

/**
 * @route   GET /api/analytics/recommendations
 * @desc    Get personalized recommendations
 * @access  Private
 */
router.get('/recommendations', authenticateJWT, insightsValidation, analyticsController.getUserRecommendations);

/**
 * @route   GET /api/analytics/engagement
 * @desc    Get user engagement metrics
 * @access  Private
 */
router.get('/engagement', authenticateJWT, insightsValidation, analyticsController.getUserEngagement);

/**
 * @route   POST /api/analytics/feedback
 * @desc    Track user feedback for analytics
 * @access  Private
 */
router.post('/feedback', authenticateJWT, feedbackValidation, analyticsController.trackFeedback);

/**
 * @route   GET /api/analytics/system
 * @desc    Get system-wide analytics (admin only)
 * @access  Admin
 */
router.get('/system', authenticateJWT, systemAnalyticsValidation, analyticsController.getSystemAnalytics);

module.exports = router;