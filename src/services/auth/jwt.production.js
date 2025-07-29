const jwt = require('jsonwebtoken');
const db = require('../../config/database');

class JWTService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'default-jwt-secret-change-me';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-me';
    this.jwtExpiration = process.env.JWT_EXPIRATION || '15m';
    this.refreshTokenExpiration = process.env.REFRESH_TOKEN_EXPIRATION || '7d';
  }

  generateTokens(userId) {
    const payload = { userId, type: 'access' };
    const refreshPayload = { userId, type: 'refresh' };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiration
    });

    const refreshToken = jwt.sign(refreshPayload, this.jwtRefreshSecret, {
      expiresIn: this.refreshTokenExpiration
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
      throw new Error('Invalid access token');
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
      throw new Error('Invalid refresh token');
    }
  }

  async refreshTokens(refreshToken) {
    const decoded = this.verifyRefreshToken(refreshToken);
    
    // Check if user exists
    const result = await db.query('SELECT id FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return this.generateTokens(decoded.userId);
  }

  async revokeRefreshToken(refreshToken) {
    // In production, you might want to implement a blacklist
    // For now, we'll just verify it's valid
    this.verifyRefreshToken(refreshToken);
    return true;
  }
}

module.exports = new JWTService();