const jwtService = require('../services/auth/jwt');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

// JWT Authentication middleware for authenticated users
const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication required', 
        message: 'JWT token required in Authorization header' 
      });
    }
    
    // Verify the JWT token
    const decoded = jwtService.verifyAccessToken(token);
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        monthlyUsageCount: true,
        monthlyUsageLimit: true,
        lastUsageReset: true,
        isActive: true
      }
    });
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        error: 'User not found or inactive', 
        message: 'Please re-authenticate' 
      });
    }
    
    // Reset monthly usage if needed (new month)
    const now = new Date();
    const resetDate = new Date(user.lastUsageReset);
    if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          monthlyUsageCount: 0,
          lastUsageReset: now
        }
      });
      user.monthlyUsageCount = 0;
    }
    
    // Attach user to request
    req.user = user;
    
    logger.info(`JWT authentication successful for user ${user.id}`, {
      email: user.email,
      tier: user.subscriptionTier,
      usage: `${user.monthlyUsageCount}/${user.monthlyUsageLimit}`
    });
    
    next();
  } catch (error) {
    logger.error('JWT authentication failed:', error);
    return res.status(401).json({ 
      error: 'Invalid token', 
      message: error.message 
    });
  }
};

// Optional JWT authentication (for endpoints that work with or without auth)
const optionalJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      // No token provided, continue without authentication
      req.user = null;
      return next();
    }
    
    // Try to authenticate
    const decoded = jwtService.verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        monthlyUsageCount: true,
        monthlyUsageLimit: true,
        lastUsageReset: true,
        isActive: true
      }
    });
    
    if (user && user.isActive) {
      // Reset monthly usage if needed
      const now = new Date();
      const resetDate = new Date(user.lastUsageReset);
      if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            monthlyUsageCount: 0,
            lastUsageReset: now
          }
        });
        user.monthlyUsageCount = 0;
      }
      
      req.user = user;
      logger.info(`Optional JWT authentication successful for user ${user.id}`);
    } else {
      req.user = null;
      logger.warn('Optional JWT authentication failed - user not found or inactive');
    }
    
    next();
  } catch (error) {
    // On error, continue without authentication
    logger.warn('Optional JWT authentication failed:', error.message);
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateJWT,
  optionalJWT
};