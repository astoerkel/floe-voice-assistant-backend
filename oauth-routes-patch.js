// OAuth Routes Patch - Add this to your existing app.js
// This is a minimal patch to add OAuth routes to the existing deployment

const express = require('express');
const { google } = require('googleapis');
const crypto = require('crypto');

// OAuth routes that can be added to existing app
function addOAuthRoutes(app) {
    // Simple OAuth state storage (in production, use Redis or database)
    const oauthStates = new Map();

    // Google OAuth configuration
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.BACKEND_URL || 'https://voice-assistant-backend-899362685715.us-central1.run.app'}/api/oauth/google/callback`
    );

    const scopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
    ];

    // Google OAuth init
    app.get('/api/oauth/google/init', (req, res) => {
        try {
            if (!process.env.GOOGLE_CLIENT_ID) {
                return res.status(500).json({ error: 'Google OAuth not configured' });
            }

            const state = crypto.randomBytes(32).toString('hex');
            oauthStates.set(state, { createdAt: new Date(), userId: 'test-user' });

            const authUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: scopes,
                state: state,
                prompt: 'consent'
            });

            res.json({
                success: true,
                authUrl: authUrl,
                state: state
            });
        } catch (error) {
            console.error('OAuth init error:', error);
            res.status(500).json({ error: 'Failed to initiate OAuth' });
        }
    });

    // Google OAuth callback
    app.get('/api/oauth/google/callback', async (req, res) => {
        try {
            const { code, state, error } = req.query;

            if (error) {
                return res.redirect(`com.amitstoerkel.VoiceAssistant://oauth?error=${error}`);
            }

            if (!code || !state) {
                return res.redirect(`com.amitstoerkel.VoiceAssistant://oauth?error=missing_parameters`);
            }

            if (!oauthStates.has(state)) {
                return res.redirect(`com.amitstoerkel.VoiceAssistant://oauth?error=invalid_state`);
            }

            // Exchange code for tokens
            const { tokens } = await oauth2Client.getToken(code);
            
            // Clean up state
            oauthStates.delete(state);

            // In production, save tokens to database
            console.log('OAuth tokens received:', { 
                access_token: tokens.access_token ? 'present' : 'missing',
                refresh_token: tokens.refresh_token ? 'present' : 'missing'
            });

            res.redirect(`com.amitstoerkel.VoiceAssistant://oauth?success=google_connected`);
        } catch (error) {
            console.error('OAuth callback error:', error);
            res.redirect(`com.amitstoerkel.VoiceAssistant://oauth?error=oauth_failed`);
        }
    });

    // Test OAuth endpoint
    app.get('/api/oauth/test', (req, res) => {
        res.json({
            success: true,
            message: 'OAuth routes are working',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            googleClientId: process.env.GOOGLE_CLIENT_ID ? 'configured' : 'missing'
        });
    });

    // Clean up expired states every hour
    setInterval(() => {
        const now = new Date();
        for (const [state, data] of oauthStates.entries()) {
            if (now - data.createdAt > 10 * 60 * 1000) { // 10 minutes
                oauthStates.delete(state);
            }
        }
    }, 60 * 60 * 1000);

    console.log('OAuth routes added successfully');
}

module.exports = { addOAuthRoutes };

// If run directly, show instructions
if (require.main === module) {
    console.log(`
OAuth Routes Patch
==================

To add OAuth routes to your existing app.js:

1. Add this to your app.js file:

const { addOAuthRoutes } = require('./oauth-routes-patch');
addOAuthRoutes(app);

2. Or copy the addOAuthRoutes function directly into your app.js

3. Make sure these environment variables are set:
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
   - BACKEND_URL

4. Test the routes:
   - GET /api/oauth/test
   - GET /api/oauth/google/init
   - GET /api/oauth/google/callback
`);
}