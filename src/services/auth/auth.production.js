const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const appleSignin = require('apple-signin-auth');
const db = require('../../config/database');
const logger = require('../../utils/logger');

class AuthService {
  constructor() {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    this.saltRounds = 12;
    this.jwtSecret = process.env.JWT_SECRET;
    this.refreshSecret = process.env.JWT_REFRESH_SECRET;
    this.accessTokenExpiry = '15m';
    this.refreshTokenExpiry = '7d';
    
    if (!this.jwtSecret || !this.refreshSecret) {
      throw new Error('JWT secrets must be configured');
    }
  }

  // Email/Password Authentication
  async registerUser(email, password, name) {
    try {
      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id, email FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('User already exists with this email');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, this.saltRounds);

      // Create user
      const result = await db.query(`
        INSERT INTO users (email, name, password_hash, auth_provider, created_at, last_active)
        VALUES ($1, $2, $3, 'email', NOW(), NOW())
        RETURNING id, email, name, created_at
      `, [email, name, passwordHash]);

      const user = result.rows[0];

      // Generate tokens
      const tokens = await this.generateTokens(user.id, user.email);

      logger.info(`User registered successfully: ${email}`);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          authProvider: 'email',
          createdAt: user.created_at
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      };
    } catch (error) {
      logger.error('User registration failed:', error);
      throw error;
    }
  }

  async loginUser(email, password) {
    try {
      // Find user
      const result = await db.query(
        'SELECT id, email, name, password_hash, auth_provider FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid email or password');
      }

      const user = result.rows[0];

      // Check if user registered with OAuth
      if (!user.password_hash) {
        throw new Error('This account was created with social login. Please use Apple or Google sign-in.');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      // Update last active
      await db.query(
        'UPDATE users SET last_active = NOW() WHERE id = $1',
        [user.id]
      );

      // Generate tokens
      const tokens = await this.generateTokens(user.id, user.email);

      logger.info(`User logged in successfully: ${email}`);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          authProvider: user.auth_provider
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      };
    } catch (error) {
      logger.error('User login failed:', error);
      throw error;
    }
  }

  // Apple Sign-In
  async handleAppleAuth(idToken, userData = null) {
    try {
      // Verify Apple ID token
      const appleUser = await appleSignin.verifyIdToken(idToken, {
        audience: process.env.APPLE_CLIENT_ID,
        ignoreExpiration: false
      });

      const appleId = appleUser.sub;
      const email = appleUser.email;
      const name = userData?.name || email?.split('@')[0] || 'Apple User';

      logger.info(`Apple Sign-In attempt for Apple ID: ${appleId}, Email: ${email}`);

      // Check if user exists by Apple ID first
      let result = await db.query(
        'SELECT id, email, name, auth_provider FROM users WHERE apple_id = $1',
        [appleId]
      );

      let user;

      if (result.rows.length > 0) {
        // Existing user with Apple ID
        user = result.rows[0];
        
        // Update last active
        await db.query(
          'UPDATE users SET last_active = NOW() WHERE id = $1',
          [user.id]
        );

        logger.info(`Existing Apple user logged in: ${user.email}`);
      } else if (email) {
        // Check if user exists by email (for linking accounts)
        result = await db.query(
          'SELECT id, email, name, auth_provider FROM users WHERE email = $1',
          [email]
        );

        if (result.rows.length > 0) {
          // Link Apple ID to existing account
          user = result.rows[0];
          
          await db.query(
            'UPDATE users SET apple_id = $1, last_active = NOW() WHERE id = $2',
            [appleId, user.id]
          );

          logger.info(`Apple ID linked to existing account: ${email}`);
        } else {
          // Create new user
          const insertResult = await db.query(`
            INSERT INTO users (email, name, apple_id, auth_provider, created_at, last_active)
            VALUES ($1, $2, $3, 'apple', NOW(), NOW())
            ON CONFLICT (email) DO UPDATE SET
              apple_id = EXCLUDED.apple_id,
              last_active = NOW()
            RETURNING id, email, name, auth_provider
          `, [email, name, appleId]);

          user = insertResult.rows[0];
          logger.info(`New Apple user created: ${email}`);
        }
      } else {
        throw new Error('Apple Sign-In requires email access');
      }

      // Generate tokens
      const tokens = await this.generateTokens(user.id, user.email);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          authProvider: user.auth_provider
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      };
    } catch (error) {
      logger.error('Apple authentication failed:', error);
      throw new Error(`Apple authentication failed: ${error.message}`);
    }
  }

  // Google OAuth
  async handleGoogleAuth(idToken) {
    try {
      // Verify Google ID token
      const ticket = await this.googleClient.verifyIdToken({
        idToken: idToken,
        audience: process.env.GOOGLE_CLIENT_ID
      });

      const payload = ticket.getPayload();
      const googleId = payload.sub;
      const email = payload.email;
      const name = payload.name || email?.split('@')[0] || 'Google User';

      logger.info(`Google Sign-In attempt for Google ID: ${googleId}, Email: ${email}`);

      // Check if user exists by Google ID first
      let result = await db.query(
        'SELECT id, email, name, auth_provider FROM users WHERE google_id = $1',
        [googleId]
      );

      let user;

      if (result.rows.length > 0) {
        // Existing user with Google ID
        user = result.rows[0];
        
        // Update last active
        await db.query(
          'UPDATE users SET last_active = NOW() WHERE id = $1',
          [user.id]
        );

        logger.info(`Existing Google user logged in: ${user.email}`);
      } else if (email) {
        // Check if user exists by email (for linking accounts)
        result = await db.query(
          'SELECT id, email, name, auth_provider FROM users WHERE email = $1',
          [email]
        );

        if (result.rows.length > 0) {
          // Link Google ID to existing account
          user = result.rows[0];
          
          await db.query(
            'UPDATE users SET google_id = $1, last_active = NOW() WHERE id = $2',
            [googleId, user.id]
          );

          logger.info(`Google ID linked to existing account: ${email}`);
        } else {
          // Create new user
          const insertResult = await db.query(`
            INSERT INTO users (email, name, google_id, auth_provider, created_at, last_active)
            VALUES ($1, $2, $3, 'google', NOW(), NOW())
            ON CONFLICT (email) DO UPDATE SET
              google_id = EXCLUDED.google_id,
              last_active = NOW()
            RETURNING id, email, name, auth_provider
          `, [email, name, googleId]);

          user = insertResult.rows[0];
          logger.info(`New Google user created: ${email}`);
        }
      } else {
        throw new Error('Google Sign-In requires email access');
      }

      // Generate tokens
      const tokens = await this.generateTokens(user.id, user.email);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          authProvider: user.auth_provider
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      };
    } catch (error) {
      logger.error('Google authentication failed:', error);
      throw new Error(`Google authentication failed: ${error.message}`);
    }
  }

  // JWT Token Management
  async generateTokens(userId, email) {
    try {
      const payload = {
        userId: userId,
        email: email,
        type: 'access'
      };

      const accessToken = jwt.sign(payload, this.jwtSecret, {
        expiresIn: this.accessTokenExpiry,
        issuer: 'voice-assistant-api',
        subject: userId.toString()
      });

      const refreshPayload = {
        userId: userId,
        email: email,
        type: 'refresh'
      };

      const refreshToken = jwt.sign(refreshPayload, this.refreshSecret, {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'voice-assistant-api',
        subject: userId.toString()
      });

      // Store refresh token in database
      await db.query(`
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_at)
        VALUES ($1, $2, NOW() + INTERVAL '7 days', NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          token_hash = EXCLUDED.token_hash,
          expires_at = EXCLUDED.expires_at,
          created_at = NOW()
      `, [userId, this.hashToken(refreshToken)]);

      return { accessToken, refreshToken };
    } catch (error) {
      logger.error('Token generation failed:', error);
      throw new Error('Failed to generate authentication tokens');
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.refreshSecret);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Check if refresh token exists in database
      const result = await db.query(
        'SELECT user_id FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()',
        [decoded.userId, this.hashToken(refreshToken)]
      );

      if (result.rows.length === 0) {
        throw new Error('Refresh token not found or expired');
      }

      // Get user details
      const userResult = await db.query(
        'SELECT id, email FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      // Generate new tokens
      const tokens = await this.generateTokens(user.id, user.email);

      logger.info(`Tokens refreshed for user: ${user.email}`);

      return tokens;
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw new Error('Invalid or expired refresh token');
    }
  }

  async revokeRefreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.refreshSecret, { ignoreExpiration: true });
      
      await db.query(
        'DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2',
        [decoded.userId, this.hashToken(refreshToken)]
      );

      logger.info(`Refresh token revoked for user: ${decoded.userId}`);
    } catch (error) {
      logger.error('Token revocation failed:', error);
      // Don't throw error for revocation failures
    }
  }

  async revokeAllUserTokens(userId) {
    try {
      await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
      logger.info(`All tokens revoked for user: ${userId}`);
    } catch (error) {
      logger.error('Token revocation failed:', error);
      throw new Error('Failed to revoke user tokens');
    }
  }

  // User Management
  async getUserById(userId) {
    try {
      const result = await db.query(`
        SELECT id, email, name, auth_provider, created_at, last_active
        FROM users WHERE id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Get user failed:', error);
      throw new Error('Failed to get user');
    }
  }

  async updateUserProfile(userId, updates) {
    try {
      const allowedFields = ['name'];
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      for (const [field, value] of Object.entries(updates)) {
        if (allowedFields.includes(field) && value !== undefined) {
          updateFields.push(`${field} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      values.push(userId);
      const query = `
        UPDATE users SET ${updateFields.join(', ')}, last_active = NOW()
        WHERE id = $${paramIndex}
        RETURNING id, email, name, auth_provider, last_active
      `;

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.info(`User profile updated: ${userId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Update user profile failed:', error);
      throw error;
    }
  }

  async deleteUser(userId) {
    try {
      // Delete user and cascade to refresh_tokens
      const result = await db.query(
        'DELETE FROM users WHERE id = $1 RETURNING email',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.info(`User deleted: ${result.rows[0].email}`);
      return true;
    } catch (error) {
      logger.error('Delete user failed:', error);
      throw new Error('Failed to delete user');
    }
  }

  // Utility methods
  hashToken(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }
}

module.exports = new AuthService();