const express = require('express');
const router = express.Router();
const oauthController = require('../controllers/oauth.controller');
const { authenticateToken, optionalAuth } = require('../services/auth/middleware');

// Public OAuth endpoints (no authentication required)
router.post('/public/google/init', oauthController.initGoogleOAuthPublic.bind(oauthController));
router.post('/public/airtable/init', oauthController.initAirtableOAuthPublic.bind(oauthController));

// Authenticated OAuth endpoints (legacy, for backwards compatibility)
router.get('/google/init', authenticateToken, oauthController.initGoogleOAuth.bind(oauthController));
router.get('/airtable/init', authenticateToken, oauthController.initAirtableOAuth.bind(oauthController));

// OAuth callbacks (no authentication required)
router.get('/google/callback', oauthController.handleGoogleCallback.bind(oauthController));
router.get('/airtable/callback', oauthController.handleAirtableCallback.bind(oauthController));

// Integration management
router.get('/integrations', optionalAuth, oauthController.getIntegrations.bind(oauthController));
router.delete('/integrations/:integrationId', authenticateToken, oauthController.disconnectIntegration.bind(oauthController));
router.get('/integrations/:type/test', authenticateToken, oauthController.testIntegration.bind(oauthController));

module.exports = router;