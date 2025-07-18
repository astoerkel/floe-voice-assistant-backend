const express = require('express');
const router = express.Router();
const { controller, appleSignInValidation, updateProfileValidation } = require('../controllers/auth.controller');
const { authenticateToken, optionalAuth } = require('../services/auth/middleware');

// Authentication routes
router.post('/apple-signin', appleSignInValidation, controller.appleSignIn);
router.get('/google-oauth/init', controller.googleOAuthInit);
router.get('/google-oauth/callback', controller.googleOAuthCallback);
router.post('/refresh', controller.refreshToken);
router.delete('/logout', optionalAuth, controller.logout);

// Protected routes
router.get('/profile', authenticateToken, controller.getProfile);
router.put('/profile', authenticateToken, updateProfileValidation, controller.updateProfile);
router.delete('/account', authenticateToken, controller.deleteAccount);

module.exports = router;