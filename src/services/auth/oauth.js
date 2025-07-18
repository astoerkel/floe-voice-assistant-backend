const { OAuth2Client } = require('google-auth-library');
const appleSignin = require('apple-signin-auth');
const { prisma } = require('../../config/database');
const jwtService = require('./jwt');
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
        emailVerified: appleIdTokenClaims.email_verified === 'true'
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
      let user = await prisma.user.findUnique({
        where: { email: userInfo.email }
      });
      
      if (user) {
        // Update Google ID if not set
        if (!user.googleId) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              googleId: userInfo.googleId,
              profilePicture: userInfo.profilePicture || user.profilePicture
            }
          });
        }
      } else {
        // Create new user
        user = await prisma.user.create({
          data: {
            email: userInfo.email,
            name: userInfo.name,
            googleId: userInfo.googleId,
            profilePicture: userInfo.profilePicture
          }
        });
      }
      
      // Generate JWT tokens
      const { accessToken, refreshToken } = jwtService.generateTokens(user.id);
      await jwtService.storeRefreshToken(user.id, refreshToken);
      
      logger.info(`Google authentication successful for user ${user.id}`);
      
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          profilePicture: user.profilePicture
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
      
      // Check if user exists
      let existingUser = await prisma.user.findUnique({
        where: { email: userInfo.email }
      });
      
      if (existingUser) {
        // Update Apple ID if not set
        if (!existingUser.appleId) {
          existingUser = await prisma.user.update({
            where: { id: existingUser.id },
            data: { appleId: userInfo.appleId }
          });
        }
      } else {
        // Create new user
        existingUser = await prisma.user.create({
          data: {
            email: userInfo.email,
            name: user?.name || null, // Apple provides name only on first sign-in
            appleId: userInfo.appleId
          }
        });
      }
      
      // Generate JWT tokens
      const { accessToken, refreshToken } = jwtService.generateTokens(existingUser.id);
      await jwtService.storeRefreshToken(existingUser.id, refreshToken);
      
      logger.info(`Apple authentication successful for user ${existingUser.id}`);
      
      return {
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          profilePicture: existingUser.profilePicture
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
      
      // Store integration
      const user = await prisma.user.findUnique({
        where: { email: userInfo.email }
      });
      
      if (user) {
        await prisma.integration.upsert({
          where: {
            userId_type: {
              userId: user.id,
              type: 'google'
            }
          },
          update: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            scope: tokens.scope
          },
          create: {
            userId: user.id,
            type: 'google',
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            scope: tokens.scope
          }
        });
      }
      
      return { success: true };
    } catch (error) {
      logger.error('Google callback failed:', error);
      throw error;
    }
  }
}

module.exports = new OAuthService();