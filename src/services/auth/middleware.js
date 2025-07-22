const jwtService = require('./jwt');
const { prisma } = require('../../config/database');
const logger = require('../../utils/logger');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    // SECURITY FIX: Only allow mock tokens in development environment
    if (process.env.NODE_ENV === 'development' && (token === 'mock_access_token_for_development' || token.startsWith('mock_'))) {
      logger.info('Development authentication: Using mock authentication token (DEV MODE ONLY)');
      
      // Create a mock user for development
      req.user = {
        id: 'dev-user-123',
        email: 'dev@example.com',
        name: 'Development User',
        isActive: true,
        lastActive: new Date()
      };
      
      return next();
    }
    
    // In production, reject all mock tokens
    if (token === 'mock_access_token_for_development' || token.startsWith('mock_')) {
      logger.warn('SECURITY: Mock token rejected in production environment', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return res.status(401).json({ error: 'Invalid authentication method' });
    }
    
    const decoded = jwtService.verifyAccessToken(token);
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        lastActive: true
      }
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account deactivated' });
    }
    
    // Update last active time
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });
    
    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      req.user = null;
      return next();
    }
    
    // SECURITY FIX: Only allow mock tokens in development environment
    if (process.env.NODE_ENV === 'development' && (token === 'mock_access_token_for_development' || token.startsWith('mock_'))) {
      logger.info('Development authentication: Using mock authentication token (optional, DEV MODE ONLY)');
      
      req.user = {
        id: 'dev-user-123',
        email: 'dev@example.com',
        name: 'Development User',
        isActive: true,
        lastActive: new Date()
      };
      
      return next();
    }
    
    // In production, silently reject mock tokens and continue without user
    if (token === 'mock_access_token_for_development' || token.startsWith('mock_')) {
      logger.warn('SECURITY: Mock token rejected in production environment (optional auth)', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      req.user = null;
      return next();
    }
    
    const decoded = jwtService.verifyAccessToken(token);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        lastActive: true
      }
    });
    
    if (user && user.isActive) {
      req.user = user;
      
      // Update last active time
      await prisma.user.update({
        where: { id: user.id },
        data: { lastActive: new Date() }
      });
    } else {
      req.user = null;
    }
    
    next();
  } catch (error) {
    logger.warn('Optional authentication failed:', error);
    req.user = null;
    next();
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // For now, we don't have roles in the schema
    // This is a placeholder for future role-based access control
    next();
  };
};

const rateLimitByUser = (maxRequests, windowMs) => {
  const userRequests = new Map();
  
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();
    
    if (!userRequests.has(userId)) {
      userRequests.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const userLimit = userRequests.get(userId);
    
    if (now > userLimit.resetTime) {
      userLimit.count = 1;
      userLimit.resetTime = now + windowMs;
      return next();
    }
    
    if (userLimit.count >= maxRequests) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        resetTime: userLimit.resetTime
      });
    }
    
    userLimit.count++;
    next();
  };
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole,
  rateLimitByUser
};