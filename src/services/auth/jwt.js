const jwt = require('jsonwebtoken');
const { prisma } = require('../../config/database');
const { redis, isRedisAvailable } = require('../../config/redis');
const logger = require('../../utils/logger');

class JWTService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    this.jwtExpiration = process.env.JWT_EXPIRATION || '15m';
    this.refreshTokenExpiration = process.env.REFRESH_TOKEN_EXPIRATION || '7d';
    
    if (!this.jwtSecret || !this.jwtRefreshSecret) {
      throw new Error('JWT secrets are required');
    }
  }

  generateTokens(userId) {
    const payload = { userId, type: 'access' };
    const refreshPayload = { userId, type: 'refresh' };
    
    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiration,
      issuer: 'voice-assistant-backend',
      subject: userId
    });
    
    const refreshToken = jwt.sign(refreshPayload, this.jwtRefreshSecret, {
      expiresIn: this.refreshTokenExpiration,
      issuer: 'voice-assistant-backend',
      subject: userId
    });
    
    return { accessToken, refreshToken };
  }

  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      logger.error('Access token verification failed:', error);
      throw error;
    }
  }

  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtRefreshSecret);
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      logger.error('Refresh token verification failed:', error);
      throw error;
    }
  }

  async storeRefreshToken(userId, refreshToken) {
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId,
          expiresAt
        }
      });
      
      // Also store in Redis for faster lookups (if available)
      if (isRedisAvailable()) {
        try {
          await redis.setex(`refresh_token:${refreshToken}`, 7 * 24 * 60 * 60, userId);
          logger.debug('Refresh token cached in Redis');
        } catch (redisError) {
          logger.warn('Failed to cache refresh token in Redis:', redisError);
          // Continue without Redis caching
        }
      }
      
      logger.info(`Refresh token stored for user ${userId}`);
    } catch (error) {
      logger.error('Failed to store refresh token:', error);
      throw error;
    }
  }

  async revokeRefreshToken(refreshToken) {
    try {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { isRevoked: true }
      });
      
      // Remove from Redis cache (if available)
      if (isRedisAvailable()) {
        try {
          await redis.del(`refresh_token:${refreshToken}`);
          logger.debug('Refresh token removed from Redis cache');
        } catch (redisError) {
          logger.warn('Failed to remove refresh token from Redis:', redisError);
          // Continue without Redis cleanup
        }
      }
      
      logger.info('Refresh token revoked');
    } catch (error) {
      logger.error('Failed to revoke refresh token:', error);
      throw error;
    }
  }

  async isRefreshTokenValid(refreshToken) {
    try {
      // Check Redis first (faster) if available
      if (isRedisAvailable()) {
        try {
          const cachedUserId = await redis.get(`refresh_token:${refreshToken}`);
          if (cachedUserId) {
            logger.debug('Refresh token found in Redis cache');
            return true;
          }
        } catch (redisError) {
          logger.warn('Failed to check Redis cache for refresh token:', redisError);
          // Continue to database check
        }
      }
      
      // Check database
      const dbToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken }
      });
      
      if (!dbToken || dbToken.isRevoked || dbToken.expiresAt < new Date()) {
        return false;
      }
      
      // Restore to Redis cache if available
      if (isRedisAvailable()) {
        try {
          const ttl = Math.floor((dbToken.expiresAt - new Date()) / 1000);
          await redis.setex(`refresh_token:${refreshToken}`, ttl, dbToken.userId);
          logger.debug('Refresh token restored to Redis cache');
        } catch (redisError) {
          logger.warn('Failed to restore refresh token to Redis:', redisError);
          // Continue without Redis caching
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to validate refresh token:', error);
      return false;
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      const decoded = this.verifyRefreshToken(refreshToken);
      const isValid = await this.isRefreshTokenValid(refreshToken);
      
      if (!isValid) {
        throw new Error('Invalid or expired refresh token');
      }
      
      const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(decoded.userId);
      
      // Revoke old refresh token
      await this.revokeRefreshToken(refreshToken);
      
      // Store new refresh token
      await this.storeRefreshToken(decoded.userId, newRefreshToken);
      
      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      logger.error('Failed to refresh access token:', error);
      throw error;
    }
  }

  async revokeAllUserTokens(userId) {
    try {
      await prisma.refreshToken.updateMany({
        where: { userId },
        data: { isRevoked: true }
      });
      
      // Note: We can't easily remove from Redis without knowing all tokens
      // This is a trade-off for performance vs. immediate revocation
      
      logger.info(`All tokens revoked for user ${userId}`);
    } catch (error) {
      logger.error('Failed to revoke all user tokens:', error);
      throw error;
    }
  }

  async cleanupExpiredTokens() {
    try {
      const result = await prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isRevoked: true }
          ]
        }
      });
      
      logger.info(`Cleaned up ${result.count} expired tokens`);
    } catch (error) {
      logger.error('Failed to cleanup expired tokens:', error);
    }
  }
}

module.exports = new JWTService();