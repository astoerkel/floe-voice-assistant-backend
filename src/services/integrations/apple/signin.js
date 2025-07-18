const appleSignin = require('apple-signin-auth');
const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');

class AppleSignInIntegration {
  constructor() {
    this.serviceName = 'apple_signin';
    this.config = {
      clientId: process.env.APPLE_CLIENT_ID,
      keyId: process.env.APPLE_KEY_ID,
      teamId: process.env.APPLE_TEAM_ID,
      privateKey: process.env.APPLE_PRIVATE_KEY
    };
  }

  async verifyIdToken(idToken) {
    try {
      const payload = await appleSignin.verifyIdToken(idToken, {
        audience: this.config.clientId,
        ignoreExpiration: false
      });

      logger.info('Apple ID token verified successfully');
      return {
        success: true,
        payload: {
          sub: payload.sub,
          email: payload.email,
          emailVerified: payload.email_verified,
          isPrivateEmail: payload.is_private_email,
          realUserStatus: payload.real_user_status,
          transferSub: payload.transfer_sub
        }
      };
    } catch (error) {
      logger.error('Apple ID token verification failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async authenticateUser(idToken, authorizationCode = null) {
    try {
      // Verify the ID token
      const verification = await this.verifyIdToken(idToken);
      
      if (!verification.success) {
        throw new Error(`Token verification failed: ${verification.error}`);
      }

      const { payload } = verification;
      
      // Check if user exists in database
      let user = await prisma.user.findUnique({
        where: { appleId: payload.sub }
      });

      if (!user) {
        // Create new user
        user = await prisma.user.create({
          data: {
            appleId: payload.sub,
            email: payload.email,
            emailVerified: payload.emailVerified,
            isPrivateEmail: payload.isPrivateEmail,
            realUserStatus: payload.realUserStatus,
            authProvider: 'apple',
            profile: {
              firstName: '', // Apple doesn't provide this in the token
              lastName: '',  // Apple doesn't provide this in the token
              profilePicture: null
            }
          }
        });

        logger.info(`Created new user from Apple Sign In: ${user.id}`);
      } else {
        // Update existing user
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            email: payload.email,
            emailVerified: payload.emailVerified,
            realUserStatus: payload.realUserStatus,
            lastLoginAt: new Date()
          }
        });

        logger.info(`Updated existing user from Apple Sign In: ${user.id}`);
      }

      // Create or update Apple Sign In integration
      await prisma.integration.upsert({
        where: {
          userId_type: {
            userId: user.id,
            type: this.serviceName
          }
        },
        update: {
          isActive: true,
          metadata: {
            appleId: payload.sub,
            email: payload.email,
            isPrivateEmail: payload.isPrivateEmail,
            realUserStatus: payload.realUserStatus,
            lastSignIn: new Date()
          }
        },
        create: {
          userId: user.id,
          type: this.serviceName,
          isActive: true,
          metadata: {
            appleId: payload.sub,
            email: payload.email,
            isPrivateEmail: payload.isPrivateEmail,
            realUserStatus: payload.realUserStatus,
            lastSignIn: new Date()
          }
        }
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          appleId: payload.sub,
          emailVerified: user.emailVerified,
          profile: user.profile
        }
      };
    } catch (error) {
      logger.error('Apple Sign In authentication failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async revokeAppleToken(userId) {
    try {
      const integration = await prisma.integration.findUnique({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        }
      });

      if (!integration) {
        throw new Error('Apple Sign In integration not found');
      }

      // Apple doesn't provide a direct revoke endpoint for Sign In with Apple
      // We'll mark the integration as inactive in our database
      await prisma.integration.update({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        },
        data: {
          isActive: false,
          metadata: {
            ...integration.metadata,
            revokedAt: new Date()
          }
        }
      });

      logger.info(`Revoked Apple Sign In integration for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to revoke Apple Sign In integration:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserProfile(userId) {
    try {
      const integration = await prisma.integration.findUnique({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        },
        include: {
          user: true
        }
      });

      if (!integration || !integration.isActive) {
        throw new Error('Apple Sign In integration not found or inactive');
      }

      return {
        success: true,
        profile: {
          appleId: integration.metadata.appleId,
          email: integration.metadata.email,
          isPrivateEmail: integration.metadata.isPrivateEmail,
          realUserStatus: integration.metadata.realUserStatus,
          lastSignIn: integration.metadata.lastSignIn,
          user: {
            id: integration.user.id,
            email: integration.user.email,
            emailVerified: integration.user.emailVerified,
            profile: integration.user.profile
          }
        }
      };
    } catch (error) {
      logger.error('Failed to get user profile:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateUserProfile(userId, profileData) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          profile: {
            ...profileData
          }
        }
      });

      logger.info(`Updated user profile for user ${userId}`);
      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          profile: user.profile
        }
      };
    } catch (error) {
      logger.error('Failed to update user profile:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteUserAccount(userId) {
    try {
      // This is a sensitive operation - should include additional verification
      
      // First, deactivate all integrations
      await prisma.integration.updateMany({
        where: { userId },
        data: { isActive: false }
      });

      // Delete user data (in a real app, you might want to soft delete)
      await prisma.user.delete({
        where: { id: userId }
      });

      logger.info(`Deleted user account: ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete user account:', error);
      return { success: false, error: error.message };
    }
  }

  async checkUserStatus(appleId) {
    try {
      const user = await prisma.user.findUnique({
        where: { appleId },
        include: {
          integrations: {
            where: { type: this.serviceName }
          }
        }
      });

      if (!user) {
        return {
          exists: false,
          user: null
        };
      }

      const integration = user.integrations[0];
      
      return {
        exists: true,
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          appleId: user.appleId,
          isActive: integration?.isActive || false,
          lastSignIn: integration?.metadata?.lastSignIn,
          profile: user.profile
        }
      };
    } catch (error) {
      logger.error('Failed to check user status:', error);
      return {
        exists: false,
        user: null,
        error: error.message
      };
    }
  }

  async getSignInStatistics() {
    try {
      const totalUsers = await prisma.user.count({
        where: { authProvider: 'apple' }
      });

      const activeUsers = await prisma.integration.count({
        where: {
          type: this.serviceName,
          isActive: true
        }
      });

      const last30Days = await prisma.user.count({
        where: {
          authProvider: 'apple',
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      });

      return {
        totalUsers,
        activeUsers,
        newUsersLast30Days: last30Days,
        inactiveUsers: totalUsers - activeUsers
      };
    } catch (error) {
      logger.error('Failed to get sign-in statistics:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        newUsersLast30Days: 0,
        inactiveUsers: 0
      };
    }
  }

  async isIntegrationActive(userId) {
    try {
      const integration = await prisma.integration.findUnique({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        }
      });

      return integration && integration.isActive;
    } catch (error) {
      logger.error('Failed to check integration status:', error);
      return false;
    }
  }

  validateConfiguration() {
    const required = ['clientId', 'keyId', 'teamId', 'privateKey'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      logger.error(`Apple Sign In configuration missing: ${missing.join(', ')}`);
      return false;
    }
    
    return true;
  }

  getStats() {
    return {
      serviceName: this.serviceName,
      isConfigured: this.validateConfiguration(),
      supportedOperations: [
        'verifyIdToken',
        'authenticateUser',
        'revokeAppleToken',
        'getUserProfile',
        'updateUserProfile',
        'deleteUserAccount',
        'checkUserStatus'
      ]
    };
  }
}

module.exports = new AppleSignInIntegration();