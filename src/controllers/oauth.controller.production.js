const GoogleOAuthService = require('../services/oauth/googleOAuth.production');
const AirtableOAuthService = require('../services/oauth/airtableOAuth.production');
const db = require('../config/database');
const logger = require('../utils/logger');
const crypto = require('crypto');

class OAuthController {
    constructor() {
        this.googleOAuth = new GoogleOAuthService();
        this.airtableOAuth = new AirtableOAuthService();
    }
    
    // Google OAuth endpoints
    async initGoogleOAuth(req, res) {
        try {
            const { returnUrl } = req.query;
            const result = await this.googleOAuth.initiateOAuth(req.user.id, returnUrl);
            
            res.json({
                success: true,
                authUrl: result.authUrl,
                state: result.state
            });
        } catch (error) {
            logger.error('Google OAuth init error:', error);
            res.status(500).json({
                error: 'Failed to initiate Google OAuth',
                message: error.message
            });
        }
    }

    async initGoogleOAuthPublic(req, res) {
        try {
            const { returnUrl, deviceId } = req.body;
            
            if (!deviceId) {
                return res.status(400).json({
                    error: 'Device ID is required for public OAuth'
                });
            }

            const result = await this.googleOAuth.initiateOAuth(null, returnUrl, deviceId);
            
            res.json({
                success: true,
                authUrl: result.authUrl,
                state: result.state,
                message: 'Open this URL in your browser to connect Google account'
            });
        } catch (error) {
            logger.error('Google OAuth public init error:', error);
            res.status(500).json({
                error: 'Failed to start Google OAuth',
                message: error.message
            });
        }
    }

    async handleGoogleCallback(req, res) {
        try {
            const { code, state, error: oauthError } = req.query;
            
            if (oauthError) {
                logger.error('Google OAuth error:', oauthError);
                return res.status(400).send(`
                    <html><body>
                        <h2>OAuth Error</h2>
                        <p>Error: ${oauthError}</p>
                        <p>Please try again.</p>
                    </body></html>
                `);
            }

            if (!code || !state) {
                return res.status(400).send(`
                    <html><body>
                        <h2>OAuth Error</h2>
                        <p>Missing authorization code or state parameter.</p>
                    </body></html>
                `);
            }

            const result = await this.googleOAuth.handleCallback(code, state);
            
            const successHtml = `
                <html>
                <head>
                    <title>Google Account Connected</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .success { color: #4CAF50; }
                        .info { color: #2196F3; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <h2 class="success">✓ Google Account Connected Successfully!</h2>
                    <p class="info">Your Google account has been linked to your voice assistant.</p>
                    <p>You can now ask about your emails, calendar events, and more.</p>
                    <p><small>You can close this window and return to your app.</small></p>
                </body>
                </html>
            `;

            if (result.returnUrl) {
                // Redirect to return URL with success parameter
                const redirectUrl = new URL(result.returnUrl);
                redirectUrl.searchParams.set('oauth_success', 'google');
                redirectUrl.searchParams.set('user_id', result.user.id);
                res.redirect(redirectUrl.toString());
            } else {
                res.send(successHtml);
            }

        } catch (error) {
            logger.error('Google OAuth callback error:', error);
            res.status(500).send(`
                <html><body>
                    <h2>OAuth Error</h2>
                    <p>Failed to connect Google account: ${error.message}</p>
                    <p>Please try again.</p>
                </body></html>
            `);
        }
    }

    // Airtable OAuth endpoints
    async initAirtableOAuth(req, res) {
        try {
            const { returnUrl } = req.query;
            const result = await this.airtableOAuth.initiateOAuth(req.user.id, returnUrl);
            
            res.json({
                success: true,
                authUrl: result.authUrl,
                state: result.state
            });
        } catch (error) {
            logger.error('Airtable OAuth init error:', error);
            res.status(500).json({
                error: 'Failed to initiate Airtable OAuth',
                message: error.message
            });
        }
    }

    async initAirtableOAuthPublic(req, res) {
        try {
            const { returnUrl, deviceId } = req.body;
            
            if (!deviceId) {
                return res.status(400).json({
                    error: 'Device ID is required for public OAuth'
                });
            }

            const result = await this.airtableOAuth.initiateOAuth(null, returnUrl, deviceId);
            
            res.json({
                success: true,
                authUrl: result.authUrl,
                state: result.state,
                message: 'Open this URL in your browser to connect Airtable account'
            });
        } catch (error) {
            logger.error('Airtable OAuth public init error:', error);
            res.status(500).json({
                error: 'Failed to start Airtable OAuth',
                message: error.message
            });
        }
    }

    async handleAirtableCallback(req, res) {
        try {
            const { code, state, error: oauthError } = req.query;
            
            if (oauthError) {
                logger.error('Airtable OAuth error:', oauthError);
                return res.status(400).send(`
                    <html><body>
                        <h2>OAuth Error</h2>
                        <p>Error: ${oauthError}</p>
                        <p>Please try again.</p>
                    </body></html>
                `);
            }

            if (!code || !state) {
                return res.status(400).send(`
                    <html><body>
                        <h2>OAuth Error</h2>
                        <p>Missing authorization code or state parameter.</p>
                    </body></html>
                `);
            }

            const result = await this.airtableOAuth.handleCallback(code, state);
            
            const successHtml = `
                <html>
                <head>
                    <title>Airtable Account Connected</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .success { color: #4CAF50; }
                        .info { color: #2196F3; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <h2 class="success">✓ Airtable Account Connected Successfully!</h2>
                    <p class="info">Your Airtable account has been linked to your voice assistant.</p>
                    <p>You can now ask about your tasks, create new records, and more.</p>
                    <p><small>You can close this window and return to your app.</small></p>
                </body>
                </html>
            `;

            if (result.returnUrl) {
                const redirectUrl = new URL(result.returnUrl);
                redirectUrl.searchParams.set('oauth_success', 'airtable');
                redirectUrl.searchParams.set('user_id', result.user.id);
                res.redirect(redirectUrl.toString());
            } else {
                res.send(successHtml);
            }

        } catch (error) {
            logger.error('Airtable OAuth callback error:', error);
            res.status(500).send(`
                <html><body>
                    <h2>OAuth Error</h2>
                    <p>Failed to connect Airtable account: ${error.message}</p>
                    <p>Please try again.</p>
                </body></html>
            `);
        }
    }

    // Integration management
    async getIntegrations(req, res) {
        try {
            const userId = req.user?.id;
            
            if (!userId) {
                return res.status(401).json({
                    error: 'Authentication required'
                });
            }

            const userResult = await db.query(`
                SELECT 
                    google_access_token IS NOT NULL as google_connected,
                    google_user_info,
                    airtable_access_token IS NOT NULL as airtable_connected,
                    airtable_user_info
                FROM users 
                WHERE id = $1
            `, [userId]);

            if (userResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'User not found'
                });
            }

            const user = userResult.rows[0];
            
            const integrations = {
                google: {
                    connected: user.google_connected,
                    userInfo: user.google_user_info ? JSON.parse(user.google_user_info) : null
                },
                airtable: {
                    connected: user.airtable_connected,
                    userInfo: user.airtable_user_info ? JSON.parse(user.airtable_user_info) : null
                }
            };

            res.json({
                success: true,
                integrations
            });
        } catch (error) {
            logger.error('Get integrations error:', error);
            res.status(500).json({
                error: 'Failed to get integrations',
                message: error.message
            });
        }
    }

    async disconnectIntegration(req, res) {
        try {
            const { integrationId } = req.params;
            const userId = req.user.id;

            let success = false;

            switch (integrationId.toLowerCase()) {
                case 'google':
                    success = await this.googleOAuth.revokeAccess(userId);
                    break;
                case 'airtable':
                    success = await this.airtableOAuth.revokeAccess(userId);
                    break;
                default:
                    return res.status(400).json({
                        error: 'Invalid integration ID'
                    });
            }

            if (success) {
                res.json({
                    success: true,
                    message: `${integrationId} integration disconnected successfully`
                });
            } else {
                res.status(500).json({
                    error: `Failed to disconnect ${integrationId} integration`
                });
            }
        } catch (error) {
            logger.error('Disconnect integration error:', error);
            res.status(500).json({
                error: 'Failed to disconnect integration',
                message: error.message
            });
        }
    }

    async testIntegration(req, res) {
        try {
            const { type } = req.params;
            const userId = req.user.id;

            switch (type.toLowerCase()) {
                case 'google':
                    try {
                        const client = await this.googleOAuth.getAuthenticatedClient(userId);
                        const oauth2 = require('googleapis').google.oauth2({ version: 'v2', auth: client });
                        const userInfo = await oauth2.userinfo.get();
                        
                        res.json({
                            success: true,
                            message: 'Google integration is working',
                            userInfo: userInfo.data
                        });
                    } catch (error) {
                        res.status(400).json({
                            success: false,
                            error: 'Google integration test failed',
                            message: error.message
                        });
                    }
                    break;

                case 'airtable':
                    try {
                        const bases = await this.airtableOAuth.getUserBases(userId);
                        
                        res.json({
                            success: true,
                            message: 'Airtable integration is working',
                            basesCount: bases.length
                        });
                    } catch (error) {
                        res.status(400).json({
                            success: false,
                            error: 'Airtable integration test failed',
                            message: error.message
                        });
                    }
                    break;

                default:
                    res.status(400).json({
                        error: 'Invalid integration type'
                    });
            }
        } catch (error) {
            logger.error('Test integration error:', error);
            res.status(500).json({
                error: 'Failed to test integration',
                message: error.message
            });
        }
    }
}

module.exports = new OAuthController();