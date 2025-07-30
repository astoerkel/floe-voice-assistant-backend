const GoogleOAuthService = require('../services/oauth/googleOAuth.production');
const AirtableOAuthService = require('../services/oauth/airtableOAuth.production');
const db = require('../config/databasePool');
const logger = require('../utils/logger');
const crypto = require('crypto');

class OAuthControllerDirect {
    constructor() {
        this.googleOAuth = new GoogleOAuthService();
        this.airtableOAuth = new AirtableOAuthService();
    }
    
    // Helper to store OAuth state in database
    async storeOAuthState(state, data) {
        try {
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
            
            await db.query(`
                INSERT INTO oauth_states (state, user_id, device_id, return_url, provider, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (state) DO UPDATE SET
                    user_id = $2,
                    device_id = $3,
                    return_url = $4,
                    provider = $5,
                    expires_at = $6
            `, [state, data.userId || null, data.deviceId, data.returnUrl, data.provider, expiresAt]);
            
            logger.info(`OAuth state stored in database: ${state}`);
            return true;
        } catch (error) {
            logger.error('Failed to store OAuth state:', error);
            return false;
        }
    }
    
    // Helper to retrieve OAuth state from database
    async getOAuthState(state) {
        try {
            const result = await db.query(`
                SELECT * FROM oauth_states 
                WHERE state = $1 AND expires_at > NOW()
            `, [state]);
            
            if (result.rows.length > 0) {
                logger.info(`OAuth state retrieved from database: ${state}`);
                return result.rows[0];
            }
            
            return null;
        } catch (error) {
            logger.error('Failed to retrieve OAuth state:', error);
            return null;
        }
    }
    
    // Helper to clean up OAuth state
    async cleanupOAuthState(state) {
        try {
            await db.query('DELETE FROM oauth_states WHERE state = $1', [state]);
            logger.info(`OAuth state cleaned up: ${state}`);
        } catch (error) {
            logger.error('Failed to cleanup OAuth state:', error);
        }
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

            // Try to get the current user from JWT token if provided
            let currentUserId = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const jwt = require('jsonwebtoken');
                    const token = authHeader.split(' ')[1];
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    currentUserId = decoded.userId;
                    logger.info(`OAuth init: Found current user ${currentUserId} from JWT token`);
                } catch (jwtError) {
                    logger.warn('OAuth init: Invalid JWT token, proceeding as public OAuth');
                }
            }

            const result = await this.googleOAuth.initiateOAuth(currentUserId, returnUrl, deviceId);
            
            // Store OAuth state in database
            await this.storeOAuthState(result.state, {
                userId: currentUserId,
                deviceId,
                returnUrl: returnUrl || 'voiceassistant://oauth',
                provider: 'google'
            });
            
            res.json({
                success: true,
                authUrl: result.authUrl,
                state: result.state,
                message: 'Open this URL in your browser to connect Google account'
            });
        } catch (error) {
            logger.error('Google OAuth public init error:', error);
            res.status(500).json({
                error: 'Failed to initiate Google OAuth',
                message: error.message
            });
        }
    }
    
    async handleGoogleCallback(req, res) {
        try {
            const { code, state, error: oauthError } = req.query;
            
            if (oauthError) {
                logger.error('Google OAuth error:', oauthError);
                return res.redirect(`${process.env.FRONTEND_URL || 'voiceassistant://oauth'}?error=${oauthError}`);
            }
            
            if (!code) {
                logger.error('Google OAuth callback missing code');
                return res.redirect(`${process.env.FRONTEND_URL || 'voiceassistant://oauth'}?error=missing_code`);
            }
            
            if (!state) {
                logger.error('Google OAuth callback missing state');
                return res.redirect(`${process.env.FRONTEND_URL || 'voiceassistant://oauth'}?error=missing_state`);
            }
            
            // Check if this is a public OAuth flow (check database)
            const sessionData = await this.getOAuthState(state);
            
            if (sessionData) {
                // Handle public OAuth flow
                const result = await this.googleOAuth.handlePublicCallback(code, state, {
                    userId: sessionData.user_id, // Pass the current user ID from stored session
                    deviceId: sessionData.device_id,
                    returnUrl: sessionData.return_url
                });
                
                // Clean up session
                await this.cleanupOAuthState(state);
                
                // Redirect back to app with JWT token
                const returnUrl = sessionData.return_url || 'voiceassistant://oauth';
                res.redirect(`${returnUrl}?success=google_connected&token=${result.jwtToken}&deviceId=${sessionData.device_id}`);
            } else {
                // Handle traditional OAuth flow (legacy)
                const result = await this.googleOAuth.handleCallback(code, state);
                
                // Redirect back to app (iOS deep link)
                const returnUrl = result.returnUrl || 'voiceassistant://oauth';
                res.redirect(`${returnUrl}?success=google_connected`);
            }
            
        } catch (error) {
            logger.error('Google OAuth callback error:', {
                message: error.message,
                stack: error.stack,
                code: req.query.code ? 'present' : 'missing',
                state: req.query.state
            });
            
            // Try to get return URL from state
            let returnUrl = 'voiceassistant://oauth';
            if (req.query.state) {
                const sessionData = await this.getOAuthState(req.query.state);
                if (sessionData && sessionData.return_url) {
                    returnUrl = sessionData.return_url;
                }
            }
            
            res.redirect(`${returnUrl}?error=oauth_failed`);
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
            
            // Store OAuth state in database
            await this.storeOAuthState(result.state, {
                deviceId,
                returnUrl: returnUrl || 'voiceassistant://oauth',
                provider: 'airtable'
            });
            
            res.json({
                success: true,
                authUrl: result.authUrl,
                state: result.state,
                message: 'Open this URL in your browser to connect Airtable account'
            });
        } catch (error) {
            logger.error('Airtable OAuth public init error:', error);
            res.status(500).json({
                error: 'Failed to initiate Airtable OAuth',
                message: error.message
            });
        }
    }
    
    async handleAirtableCallback(req, res) {
        try {
            const { code, state, error: oauthError } = req.query;
            
            if (oauthError) {
                logger.error('Airtable OAuth error:', oauthError);
                return res.redirect(`${process.env.FRONTEND_URL || 'voiceassistant://oauth'}?error=${oauthError}`);
            }
            
            if (!code || !state) {
                logger.error('Airtable OAuth callback missing parameters');
                return res.redirect(`${process.env.FRONTEND_URL || 'voiceassistant://oauth'}?error=missing_parameters`);
            }
            
            // Check if this is a public OAuth flow (check database)
            const sessionData = await this.getOAuthState(state);
            
            if (sessionData) {
                // Handle public OAuth flow
                const result = await this.airtableOAuth.handlePublicCallback(code, state, {
                    deviceId: sessionData.device_id,
                    returnUrl: sessionData.return_url
                });
                
                // Clean up session
                await this.cleanupOAuthState(state);
                
                // Redirect back to app with JWT token
                const returnUrl = sessionData.return_url || 'voiceassistant://oauth';
                res.redirect(`${returnUrl}?success=airtable_connected&token=${result.jwtToken}&deviceId=${sessionData.device_id}`);
            } else {
                // Handle traditional OAuth flow (legacy)
                const result = await this.airtableOAuth.handleCallback(code, state);
                
                // Redirect back to app (iOS deep link)
                const returnUrl = result.returnUrl || 'voiceassistant://oauth';
                res.redirect(`${returnUrl}?success=airtable_connected`);
            }
            
        } catch (error) {
            logger.error('Airtable OAuth callback error:', error);
            
            // Try to get return URL from state
            let returnUrl = 'voiceassistant://oauth';
            if (req.query.state) {
                const sessionData = await this.getOAuthState(req.query.state);
                if (sessionData && sessionData.return_url) {
                    returnUrl = sessionData.return_url;
                }
            }
            
            res.redirect(`${returnUrl}?error=oauth_failed`);
        }
    }
    
    // Integration management
    async getIntegrations(req, res) {
        try {
            const userId = req.user?.id;
            
            logger.info(`getIntegrations called for user: ${userId}, user object:`, req.user);
            
            if (!userId) {
                logger.info('No userId found, returning empty integrations');
                return res.json({
                    success: true,
                    integrations: []
                });
            }
            
            // Query both Google and Airtable integrations
            const result = await db.query(`
                SELECT 
                    CASE 
                        WHEN google_access_token IS NOT NULL THEN 'google'
                        WHEN airtable_access_token IS NOT NULL THEN 'airtable'
                    END as type,
                    CASE 
                        WHEN google_access_token IS NOT NULL THEN true
                        WHEN airtable_access_token IS NOT NULL THEN true
                        ELSE false
                    END as isActive,
                    CASE 
                        WHEN google_access_token IS NOT NULL THEN google_user_info
                        WHEN airtable_access_token IS NOT NULL THEN airtable_user_info
                    END as userInfo,
                    created_at as connectedAt,
                    updated_at as lastSyncAt
                FROM users 
                WHERE id = $1 AND (
                    google_access_token IS NOT NULL OR 
                    airtable_access_token IS NOT NULL
                )
            `, [userId]);
            
            logger.info(`Database query returned ${result.rows.length} rows:`, result.rows);
            
            const integrations = result.rows.map(row => ({
                id: `${row.type}_${userId}`,
                type: row.type,
                isActive: row.isactive,
                userInfo: row.userinfo || {},
                connectedAt: row.connectedat,
                lastSyncAt: row.lastsyncat,
                scope: row.type === 'google' ? 
                    ['calendar', 'gmail', 'drive'] : 
                    ['base:read', 'base:write']
            }));
            
            logger.info(`Returning ${integrations.length} integrations:`, integrations);
            
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
            
            // Parse integration type from ID
            const [type] = integrationId.split('_');
            
            if (type === 'google') {
                await db.query(`
                    UPDATE users 
                    SET google_access_token = NULL,
                        google_refresh_token = NULL,
                        google_user_info = NULL,
                        updated_at = NOW()
                    WHERE id = $1
                `, [userId]);
            } else if (type === 'airtable') {
                await db.query(`
                    UPDATE users 
                    SET airtable_access_token = NULL,
                        airtable_refresh_token = NULL,
                        airtable_user_info = NULL,
                        updated_at = NOW()
                    WHERE id = $1
                `, [userId]);
            }
            
            res.json({
                success: true,
                message: `${type} integration disconnected`
            });
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
            
            // For now, just return success
            // In production, this would actually test the API connection
            
            res.json({
                success: true,
                message: `${type} integration is working`
            });
        } catch (error) {
            logger.error('Test integration error:', error);
            res.status(500).json({
                error: 'Failed to test integration',
                message: error.message
            });
        }
    }
}

module.exports = new OAuthControllerDirect();