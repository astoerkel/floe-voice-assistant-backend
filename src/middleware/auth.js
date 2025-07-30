const authService = require('../services/auth/auth.production');
const logger = require('../utils/logger');

// JWT Authentication Middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        details: 'Please provide a valid access token in the Authorization header'
      });
    }

    // Verify the access token
    const decoded = authService.verifyAccessToken(token);
    
    // Get user details
    const user = await authService.getUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        details: 'The user associated with this token no longer exists'
      });
    }

    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      authProvider: user.auth_provider
    };

    next();
  } catch (error) {
    logger.error('Authentication failed:', error);
    
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        details: 'Access token has expired. Please refresh your token.'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        details: 'The provided access token is invalid'
      });
    }

    return res.status(401).json({
      error: 'Authentication failed',
      details: error.message
    });
  }
};

// Optional Authentication Middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = authService.verifyAccessToken(token);
    const user = await authService.getUserById(decoded.userId);
    
    req.user = user ? {
      id: user.id,
      email: user.email,
      name: user.name,
      authProvider: user.auth_provider
    } : null;

    next();
  } catch (error) {
    // For optional auth, we don't fail on token errors
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  optionalAuth
};