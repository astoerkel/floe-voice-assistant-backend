const express = require('express');
const router = express.Router();
const oauthController = require('../controllers/oauth.controller');
const { authenticateToken, optionalAuth } = require('../services/auth/middleware');

// Public OAuth endpoints (no authentication required)
router.post('/public/google/init', oauthController.initGoogleOAuthPublic);
router.post('/public/airtable/init', oauthController.initAirtableOAuthPublic);

// Authenticated OAuth endpoints (legacy, for backwards compatibility)
router.get('/google/init', authenticateToken, oauthController.initGoogleOAuth);
router.get('/airtable/init', authenticateToken, oauthController.initAirtableOAuth);

// OAuth callbacks (no authentication required)
router.get('/google/callback', oauthController.handleGoogleCallback);
router.get('/airtable/callback', oauthController.handleAirtableCallback);

// Integration management
router.get('/integrations', optionalAuth, oauthController.getIntegrations);
router.delete('/integrations/:integrationId', authenticateToken, oauthController.disconnectIntegration);
router.get('/integrations/:type/test', authenticateToken, oauthController.testIntegration);

module.exports = router;