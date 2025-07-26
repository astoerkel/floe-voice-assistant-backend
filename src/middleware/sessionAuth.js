// Middleware to handle JWT authentication from Authorization header
const jwtService = require('../services/auth/jwt');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const jwtAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    
    // Check if we have a Bearer token (JWT)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      try {
        // Verify JWT token
        const decoded = jwtService.verifyAccessToken(token);
        
        // Get real user from database
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
          
          req.user = user;
          logger.info(`JWT authentication successful for user ${user.id}`, {
            email: user.email,
            tier: user.subscriptionTier
          });
        } else {
          logger.warn('JWT token valid but user not found or inactive');
          req.user = null;
        }
      } catch (jwtError) {
        logger.warn('JWT token verification failed:', jwtError.message);
        req.user = null;
      }
    } else {
      // No JWT token provided
      req.user = null;
    }
    
    next();
  } catch (error) {
    logger.error('JWT auth middleware error:', error);
    req.user = null;
    next();
  }
};

module.exports = jwtAuth;