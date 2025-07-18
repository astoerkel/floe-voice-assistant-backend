const oauthService = require('../services/auth/oauth');
const jwtService = require('../services/auth/jwt');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { body, validationResult } = require('express-validator');

class AuthController {
  // Apple Sign In
  async appleSignIn(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }
      
      const { idToken, user } = req.body;
      
      const result = await oauthService.handleAppleAuth(idToken, user);
      
      res.json({
        success: true,
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      });
    } catch (error) {
      logger.error('Apple Sign In failed:', error);
      res.status(400).json({ error: error.message });
    }
  }

  // Google OAuth initialization
  async googleOAuthInit(req, res) {
    try {
      const { state } = req.query;
      const authUrl = await oauthService.getGoogleAuthUrl(state);
      
      res.json({
        success: true,
        authUrl
      });
    } catch (error) {
      logger.error('Google OAuth init failed:', error);
      res.status(500).json({ error: 'Failed to initialize Google OAuth' });
    }
  }

  // Google OAuth callback
  async googleOAuthCallback(req, res) {
    try {
      const { code } = req.query;
      
      if (!code) {
        return res.status(400).json({ error: 'Authorization code required' });
      }
      
      await oauthService.handleGoogleCallback(code);
      
      res.json({
        success: true,
        message: 'Google integration successful'
      });
    } catch (error) {
      logger.error('Google OAuth callback failed:', error);
      res.status(400).json({ error: error.message });
    }
  }

  // Refresh access token
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }
      
      const tokens = await jwtService.refreshAccessToken(refreshToken);
      
      res.json({
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      });
    } catch (error) {
      logger.error('Token refresh failed:', error);
      res.status(401).json({ error: 'Invalid refresh token' });
    }
  }

  // Logout
  async logout(req, res) {
    try {
      const { refreshToken } = req.body;
      
      if (refreshToken) {
        await jwtService.revokeRefreshToken(refreshToken);
      }
      
      // If authenticated, revoke all tokens
      if (req.user) {
        await jwtService.revokeAllUserTokens(req.user.id);
      }
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      logger.error('Logout failed:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }

  // Get user profile
  async getProfile(req, res) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          profilePicture: true,
          createdAt: true,
          lastActive: true,
          integrations: {
            select: {
              id: true,
              type: true,
              isActive: true,
              createdAt: true
            }
          }
        }
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({
        success: true,
        user
      });
    } catch (error) {
      logger.error('Get profile failed:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }

  // Update user profile
  async updateProfile(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }
      
      const { name } = req.body;
      
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { name },
        select: {
          id: true,
          email: true,
          name: true,
          profilePicture: true,
          lastActive: true
        }
      });
      
      res.json({
        success: true,
        user
      });
    } catch (error) {
      logger.error('Update profile failed:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }

  // Delete user account
  async deleteAccount(req, res) {
    try {
      const { password } = req.body;
      
      // For OAuth-only users, we might not have password
      // This is a placeholder for future password verification
      
      await prisma.user.delete({
        where: { id: req.user.id }
      });
      
      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      logger.error('Delete account failed:', error);
      res.status(500).json({ error: 'Failed to delete account' });
    }
  }
}

// Validation middleware
const appleSignInValidation = [
  body('idToken').notEmpty().withMessage('ID token is required'),
  body('user.name').optional().isString().withMessage('Name must be a string'),
  body('user.email').optional().isEmail().withMessage('Valid email is required')
];

const updateProfileValidation = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters')
];

const controller = new AuthController();

module.exports = {
  controller,
  appleSignInValidation,
  updateProfileValidation
};