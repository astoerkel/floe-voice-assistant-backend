const authService = require('../services/auth/auth.production');
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
      
      const result = await authService.handleAppleAuth(idToken, user);
      
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
      // Google OAuth now handled via ID token, not redirect flow
      res.status(501).json({ error: 'Google OAuth redirect flow not implemented. Use ID token authentication.' });
      
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
      
      // Google OAuth now handled via ID token, not redirect flow
      res.status(501).json({ error: 'Google OAuth callback not implemented. Use ID token authentication.' });
      
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
      
      const tokens = await authService.refreshAccessToken(refreshToken);
      
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
        await authService.revokeRefreshToken(refreshToken);
      }
      
      // If authenticated, revoke all tokens
      if (req.user) {
        await authService.revokeAllUserTokens(req.user.id);
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
      const user = await authService.getUserById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          authProvider: user.auth_provider,
          createdAt: user.created_at,
          lastActive: user.last_active
        }
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
      
      const user = await authService.updateUserProfile(req.user.id, { name });
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          authProvider: user.auth_provider,
          lastActive: user.last_active
        }
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
      
      await authService.deleteUser(req.user.id);
      
      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      logger.error('Delete account failed:', error);
      res.status(500).json({ error: 'Failed to delete account' });
    }
  }

  // Email/Password Registration
  async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }
      
      const { email, password, name } = req.body;
      
      const result = await authService.registerUser(email, password, name);
      
      res.status(201).json({
        success: true,
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      });
    } catch (error) {
      logger.error('Registration failed:', error);
      res.status(400).json({ error: error.message });
    }
  }

  // Email/Password Login
  async login(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }
      
      const { email, password } = req.body;
      
      const result = await authService.loginUser(email, password);
      
      res.json({
        success: true,
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      });
    } catch (error) {
      logger.error('Login failed:', error);
      res.status(400).json({ error: error.message });
    }
  }

  // Google Sign In
  async googleSignIn(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }
      
      const { idToken } = req.body;
      
      const result = await authService.handleGoogleAuth(idToken);
      
      res.json({
        success: true,
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      });
    } catch (error) {
      logger.error('Google Sign In failed:', error);
      res.status(400).json({ error: error.message });
    }
  }
}

// Validation middleware
const appleSignInValidation = [
  body('idToken').notEmpty().withMessage('ID token is required'),
  body('user.name').optional().isString().withMessage('Name must be a string'),
  body('user.email').optional().isEmail().withMessage('Valid email is required')
];

const googleSignInValidation = [
  body('idToken').notEmpty().withMessage('ID token is required')
];

const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('name').notEmpty().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

const updateProfileValidation = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters')
];

const controller = new AuthController();

module.exports = {
  controller,
  appleSignInValidation,
  googleSignInValidation,
  registerValidation,
  loginValidation,
  updateProfileValidation
};