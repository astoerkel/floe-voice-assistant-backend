const { OAuth2Client } = require('google-auth-library');
const appleSignin = require('apple-signin-auth');
const db = require('../../config/databasePool');
const jwtService = require('./jwt.production');
const logger = require('../../utils/logger');

class OAuthService {
  constructor() {
    this.googleClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    this.appleConfig = {
      clientId: process.env.APPLE_CLIENT_ID,
      teamId: process.env.APPLE_TEAM_ID,
      keyId: process.env.APPLE_KEY_ID,
      privateKey: process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    };
  }

  async verifyGoogleToken(idToken) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      
      const payload = ticket.getPayload();
      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        profilePicture: payload.picture,
        emailVerified: payload.email_verified
      };
    } catch (error) {
      logger.error('Google token verification failed:', error);
      throw new Error('Invalid Google token');
    }
  }

  async verifyAppleToken(idToken) {
    try {
      const appleIdTokenClaims = await appleSignin.verifyIdToken(idToken, {
        audience: this.appleConfig.clientId,
        ignoreExpiration: false
      });
      
      return {
        appleId: appleIdTokenClaims.sub,
        email: appleIdTokenClaims.email,
        emailVerified: appleIdTokenClaims.email_verified === true || appleIdTokenClaims.email_verified === 'true'
      };
    } catch (error) {
      logger.error('Apple token verification failed:', error);
      throw new Error('Invalid Apple token');
    }
  }

  async handleGoogleAuth(idToken) {
    try {
      const userInfo = await this.verifyGoogleToken(idToken);
      
      if (!userInfo.emailVerified) {
        throw new Error('Email not verified');
      }
      
      // Check if user exists
      let result = await db.query('SELECT * FROM users WHERE email = $1', [userInfo.email]);
      let user;
      
      if (result.rows.length > 0) {
        user = result.rows[0];
        // Update Google ID if not set
        if (!user.google_id) {
          await db.query(`
            UPDATE users 
            SET google_id = $1, profile_picture = COALESCE($2, profile_picture), updated_at = NOW()
            WHERE id = $3
          `, [userInfo.googleId, userInfo.profilePicture, user.id]);
          user.google_id = userInfo.googleId;
          user.profile_picture = userInfo.profilePicture || user.profile_picture;
        }
      } else {
        // Create new user
        const insertResult = await db.query(`
          INSERT INTO users (email, name, google_id, profile_picture, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          RETURNING *
        `, [userInfo.email, userInfo.name, userInfo.googleId, userInfo.profilePicture]);
        user = insertResult.rows[0];
      }
      
      // Generate JWT tokens
      const { accessToken, refreshToken } = jwtService.generateTokens(user.id);
      
      logger.info(`Google authentication successful for user ${user.id}`);
      
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          profilePicture: user.profile_picture
        },
        accessToken,
        refreshToken
      };
    } catch (error) {
      logger.error('Google authentication failed:', error);
      throw error;
    }
  }

  async handleAppleAuth(idToken, user = null) {
    try {
      const userInfo = await this.verifyAppleToken(idToken);
      
      // Check if user exists by email
      let result = await db.query('SELECT * FROM users WHERE email = $1', [userInfo.email]);
      let existingUser;
      
      if (result.rows.length > 0) {
        existingUser = result.rows[0];
        // Update Apple ID if not set
        if (!existingUser.apple_id) {
          await db.query(`
            UPDATE users 
            SET apple_id = $1, updated_at = NOW()
            WHERE id = $2
          `, [userInfo.appleId, existingUser.id]);
          existingUser.apple_id = userInfo.appleId;
        }
      } else {
        // Create new user
        const insertResult = await db.query(`
          INSERT INTO users (email, name, apple_id, created_at, updated_at)
          VALUES ($1, $2, $3, NOW(), NOW())
          RETURNING *
        `, [userInfo.email, user?.name || null, userInfo.appleId]);
        existingUser = insertResult.rows[0];
      }
      
      // Generate JWT tokens
      const { accessToken, refreshToken } = jwtService.generateTokens(existingUser.id);
      
      logger.info(`Apple authentication successful for user ${existingUser.id}`);
      
      return {
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          profilePicture: existingUser.profile_picture
        },
        accessToken,
        refreshToken
      };
    } catch (error) {
      logger.error('Apple authentication failed:', error);
      throw error;
    }
  }

  async getGoogleAuthUrl(state) {
    const authUrl = this.googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'openid',
        'profile',
        'email',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.compose'
      ],
      state
    });
    
    return authUrl;
  }

  async handleGoogleCallback(code) {
    try {
      const { tokens } = await this.googleClient.getToken(code);
      
      // Verify the ID token
      const userInfo = await this.verifyGoogleToken(tokens.id_token);
      
      // Find user by email
      const result = await db.query('SELECT id FROM users WHERE email = $1', [userInfo.email]);
      
      if (result.rows.length > 0) {
        const userId = result.rows[0].id;
        
        // Store or update Google OAuth tokens
        await db.query(`
          UPDATE users 
          SET google_access_token = $1, 
              google_refresh_token = $2,
              google_token_expires_at = $3,
              updated_at = NOW()
          WHERE id = $4
        `, [
          tokens.access_token,
          tokens.refresh_token,
          tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          userId
        ]);
      }
      
      return { success: true };
    } catch (error) {
      logger.error('Google callback failed:', error);
      throw error;
    }
  }
}

module.exports = new OAuthService();