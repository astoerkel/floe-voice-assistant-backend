const express = require('express');
const router = express.Router();
const { 
  controller, 
  appleSignInValidation, 
  googleSignInValidation,
  registerValidation,
  loginValidation,
  updateProfileValidation 
} = require('../controllers/auth.controller');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// Email/Password Authentication
router.post('/register', registerValidation, controller.register);
router.post('/login', loginValidation, controller.login);

// Social Authentication
router.post('/apple-signin', appleSignInValidation, controller.appleSignIn);
router.post('/google-signin', googleSignInValidation, controller.googleSignIn);

// Token Management
router.post('/refresh', controller.refreshToken);
router.delete('/logout', optionalAuth, controller.logout);

// Protected routes
router.get('/profile', authenticateToken, controller.getProfile);
router.put('/profile', authenticateToken, updateProfileValidation, controller.updateProfile);
router.delete('/account', authenticateToken, controller.deleteAccount);

module.exports = router;