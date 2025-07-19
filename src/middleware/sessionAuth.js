// Middleware to handle session-based authentication for API key requests
const logger = require('../utils/logger');

const sessionAuth = (req, res, next) => {
  // For API key authenticated requests, create a session-based user context
  if (req.headers['x-api-key'] || req.headers['authorization']?.startsWith('Bearer ')) {
    // Extract session ID from request body or generate one
    const sessionId = req.body.sessionId || req.query.sessionId || `session_${Date.now()}`;
    
    // Create a pseudo-user object for API key requests
    req.user = {
      id: sessionId,
      sessionId: sessionId,
      type: 'api_key',
      platform: req.body.platform || 'ios'
    };
    
    logger.info('Session auth created for API key request', {
      sessionId,
      platform: req.user.platform
    });
  }
  
  next();
};

module.exports = sessionAuth;