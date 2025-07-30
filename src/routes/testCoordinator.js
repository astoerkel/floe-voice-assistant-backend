const express = require('express');
const router = express.Router();
const EnhancedLangChainCoordinator = require('../services/ai/enhancedCoordinator');
const { jwtAuth } = require('../middleware/jwtAuth');
const logger = require('../utils/logger');

// Initialize the enhanced coordinator
let coordinator;
try {
  coordinator = new EnhancedLangChainCoordinator();
  logger.info('Test route: Enhanced LangChain Coordinator initialized');
} catch (error) {
  logger.error('Test route: Failed to initialize coordinator:', error);
}

/**
 * Test the enhanced coordinator
 * POST /api/test-coordinator
 */
router.post('/', jwtAuth, async (req, res) => {
  try {
    if (!coordinator) {
      return res.status(503).json({
        success: false,
        error: 'Enhanced coordinator not available'
      });
    }

    const { text, context = {} } = req.body;
    const userId = req.user.id;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text input is required'
      });
    }

    logger.info(`Testing enhanced coordinator for user ${userId}: "${text}"`);

    // Process the request
    const startTime = Date.now();
    const result = await coordinator.processRequest(userId, text, context);
    const executionTime = Date.now() - startTime;

    res.json({
      success: true,
      input: text,
      response: result.response,
      executionTime,
      toolsUsed: result.toolsUsed || [],
      coordinatorStats: coordinator.getStats()
    });

  } catch (error) {
    logger.error('Test coordinator error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get coordinator stats
 * GET /api/test-coordinator/stats
 */
router.get('/stats', jwtAuth, async (req, res) => {
  try {
    if (!coordinator) {
      return res.status(503).json({
        success: false,
        error: 'Enhanced coordinator not available'
      });
    }

    const stats = coordinator.getStats();
    const health = await coordinator.healthCheck();

    res.json({
      success: true,
      stats,
      health
    });

  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Clear user memory
 * POST /api/test-coordinator/clear-memory
 */
router.post('/clear-memory', jwtAuth, async (req, res) => {
  try {
    if (!coordinator) {
      return res.status(503).json({
        success: false,
        error: 'Enhanced coordinator not available'
      });
    }

    const userId = req.user.id;
    coordinator.clearUserMemory(userId);

    res.json({
      success: true,
      message: 'User memory cleared'
    });

  } catch (error) {
    logger.error('Clear memory error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get conversation history
 * GET /api/test-coordinator/history
 */
router.get('/history', jwtAuth, async (req, res) => {
  try {
    if (!coordinator) {
      return res.status(503).json({
        success: false,
        error: 'Enhanced coordinator not available'
      });
    }

    const userId = req.user.id;
    const { limit = 10 } = req.query;
    
    const history = await coordinator.getConversationHistory(userId, parseInt(limit));

    res.json({
      success: true,
      history,
      count: history.length
    });

  } catch (error) {
    logger.error('Get history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;