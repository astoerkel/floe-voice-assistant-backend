const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Diagnostic endpoint to check OAuth configuration
router.get('/oauth-config', async (req, res) => {
    try {
        // Log for debugging
        logger.info('OAuth configuration check requested');
        
        // Get environment configuration
        const config = {
            environment: {
                NODE_ENV: process.env.NODE_ENV || 'NOT SET',
                BACKEND_URL: process.env.BACKEND_URL || 'NOT SET'
            },
            oauth: {
                google: {
                    clientId: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET',
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET',
                    redirectUri: `${process.env.BACKEND_URL || 'https://voice-assistant-backend-899362685715.us-central1.run.app'}/api/oauth/google/callback`
                },
                airtable: {
                    clientId: process.env.AIRTABLE_CLIENT_ID ? 'SET' : 'NOT SET', 
                    clientSecret: process.env.AIRTABLE_CLIENT_SECRET ? 'SET' : 'NOT SET',
                    redirectUri: `${process.env.BACKEND_URL || 'https://voice-assistant-backend-899362685715.us-central1.run.app'}/api/oauth/airtable/callback`
                }
            },
            redis: {
                url: process.env.REDIS_URL ? 'SET' : 'NOT SET'
            }
        };
        
        res.json(config);
    } catch (error) {
        logger.error('OAuth config check error:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve OAuth configuration',
            message: error.message 
        });
    }
});

module.exports = router;