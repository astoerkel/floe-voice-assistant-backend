const logger = require('../utils/logger');

// Simple API key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  // SECURITY FIX: Remove hardcoded API key fallback
  const validApiKey = process.env.API_KEY || process.env.API_KEY_ENV;
  
  if (!validApiKey) {
    logger.error('SECURITY: API key not configured in environment variables');
    return res.status(500).json({ 
      error: 'Server configuration error', 
      message: 'Authentication service unavailable' 
    });
  }
  
  if (!apiKey) {
    logger.warn('API request without API key', { 
      path: req.path, 
      method: req.method,
      ip: req.ip 
    });
    return res.status(401).json({ 
      error: 'API key required', 
      message: 'Please provide an API key in the x-api-key header or Authorization header' 
    });
  }
  
  if (apiKey !== validApiKey) {
    logger.warn('API request with invalid API key', { 
      path: req.path, 
      method: req.method,
      ip: req.ip,
      providedKey: apiKey?.substring(0, 10) + '...' 
    });
    return res.status(401).json({ 
      error: 'Invalid API key', 
      message: 'The provided API key is not valid' 
    });
  }
  
  logger.info('API request authenticated', { 
    path: req.path, 
    method: req.method,
    ip: req.ip 
  });
  
  next();
};

module.exports = authenticateApiKey;