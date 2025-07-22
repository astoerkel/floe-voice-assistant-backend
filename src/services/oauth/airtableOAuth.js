const axios = require('axios');
const { prisma } = require('../../config/database');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class AirtableOAuthService {
    constructor() {
        this.clientId = process.env.AIRTABLE_CLIENT_ID;
        this.clientSecret = process.env.AIRTABLE_CLIENT_SECRET;
        this.redirectUri = `${process.env.BACKEND_URL || 'https://voice-assistant-backend-899362685715.us-central1.run.app'}/api/oauth/airtable/callback`;
        
        this.scopes = [
            'data.records:read',
            'data.records:write',
            'schema.bases:read'
        ];
    }
    
    async initiateOAuth(userId, returnUrl = null) {
        try {
            // Generate state and code verifier for PKCE
            const state = crypto.randomBytes(32).toString('hex');
            const codeVerifier = crypto.randomBytes(32).toString('base64url');
            const codeChallenge = crypto.createHash('sha256')
                .update(codeVerifier)
                .digest('base64url');
            
            // Store state in database
            await prisma.oAuthState.create({
                data: {
                    state,
                    userId,
                    provider: 'airtable',
                    returnUrl,
                    codeVerifier,
                    expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
                }
            });
            
            // Build authorization URL
            const authUrl = new URL('https://airtable.com/oauth2/v1/authorize');
            authUrl.searchParams.append('client_id', this.clientId);
            authUrl.searchParams.append('redirect_uri', this.redirectUri);
            authUrl.searchParams.append('response_type', 'code');
            authUrl.searchParams.append('scope', this.scopes.join(' '));
            authUrl.searchParams.append('state', state);
            authUrl.searchParams.append('code_challenge', codeChallenge);
            authUrl.searchParams.append('code_challenge_method', 'S256');
            
            logger.info(`Airtable OAuth initiated for user ${userId}`);
            
            return {
                authUrl: authUrl.toString(),
                state
            };
        } catch (error) {
            logger.error('Airtable OAuth initiation error:', error);
            throw new Error('Failed to initiate Airtable OAuth');
        }
    }
    
    async handleCallback(code, state) {
        try {
            // Verify state parameter
            const stateRecord = await prisma.oAuthState.findUnique({
                where: { state }
            });
            
            if (!stateRecord || new Date() > stateRecord.expiresAt) {
                throw new Error('Invalid or expired OAuth state');
            }
            
            // Exchange code for token
            const tokenResponse = await axios.post('https://airtable.com/oauth2/v1/token', {
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: this.redirectUri,
                client_id: this.clientId,
                code_verifier: stateRecord.codeVerifier
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                auth: {
                    username: this.clientId,
                    password: this.clientSecret
                }
            });
            
            const tokens = tokenResponse.data;
            
            // Get user info and bases
            const userResponse = await axios.get('https://api.airtable.com/v0/meta/whoami', {
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`
                }
            });
            
            // Store integration
            const integration = await prisma.integration.upsert({
                where: {
                    userId_type: {
                        userId: stateRecord.userId,
                        type: 'airtable'
                    }
                },
                update: {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
                    scope: tokens.scope,
                    isActive: true,
                    lastSyncAt: new Date(),
                    serviceData: {
                        userInfo: userResponse.data,
                        tokenType: tokens.token_type
                    }
                },
                create: {
                    userId: stateRecord.userId,
                    type: 'airtable',
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
                    scope: tokens.scope,
                    serviceData: {
                        userInfo: userResponse.data,
                        tokenType: tokens.token_type
                    }
                }
            });
            
            // Clean up state
            await prisma.oAuthState.delete({
                where: { state }
            });
            
            logger.info(`Airtable OAuth completed for user ${stateRecord.userId}`);
            
            return {
                integration,
                returnUrl: stateRecord.returnUrl,
                userInfo: userResponse.data
            };
            
        } catch (error) {
            logger.error('Airtable OAuth callback error:', error);
            throw new Error('Failed to complete Airtable OAuth');
        }
    }
    
    async refreshToken(integration) {
        try {
            const tokenResponse = await axios.post('https://airtable.com/oauth2/v1/token', {
                grant_type: 'refresh_token',
                refresh_token: integration.refreshToken
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                auth: {
                    username: this.clientId,
                    password: this.clientSecret
                }
            });
            
            const tokens = tokenResponse.data;
            
            // Update integration
            const updatedIntegration = await prisma.integration.update({
                where: { id: integration.id },
                data: {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token || integration.refreshToken,
                    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
                    lastSyncAt: new Date()
                }
            });
            
            logger.info(`Airtable OAuth token refreshed for integration ${integration.id}`);
            
            return updatedIntegration;
            
        } catch (error) {
            logger.error('Airtable OAuth token refresh error:', error);
            
            // Mark integration as inactive if refresh fails
            await prisma.integration.update({
                where: { id: integration.id },
                data: { 
                    isActive: false,
                    syncErrors: { 
                        lastError: error.message,
                        timestamp: new Date()
                    }
                }
            });
            
            throw new Error('Failed to refresh Airtable OAuth token');
        }
    }
    
    async getValidToken(userId) {
        try {
            let integration = await prisma.integration.findUnique({
                where: {
                    userId_type: {
                        userId,
                        type: 'airtable'
                    }
                }
            });
            
            if (!integration || !integration.isActive) {
                throw new Error('Airtable integration not found or inactive');
            }
            
            // Check if token needs refresh
            if (integration.expiresAt && new Date() >= new Date(integration.expiresAt.getTime() - 5 * 60 * 1000)) {
                integration = await this.refreshToken(integration);
            }
            
            return integration.accessToken;
            
        } catch (error) {
            logger.error('Get valid Airtable token error:', error);
            throw error;
        }
    }
    
    async revokeToken(integration) {
        try {
            // Airtable doesn't have a revoke endpoint, so we just mark as inactive
            await prisma.integration.update({
                where: { id: integration.id },
                data: { 
                    isActive: false,
                    syncErrors: { 
                        lastError: 'Token revoked by user',
                        timestamp: new Date()
                    }
                }
            });
            
            logger.info(`Airtable OAuth token revoked for integration ${integration.id}`);
            
        } catch (error) {
            logger.error('Airtable OAuth token revoke error:', error);
            // Don't throw error, just log it
        }
    }
    
    // Public OAuth methods (no existing user required)
    async createAuthUrl(state, returnUrl = null) {
        try {
            // Generate PKCE parameters
            const codeVerifier = crypto.randomBytes(32).toString('base64url');
            const codeChallenge = crypto.createHash('sha256')
                .update(codeVerifier)
                .digest('base64url');
            
            // Build authorization URL with PKCE
            const authUrl = new URL('https://airtable.com/oauth2/v1/authorize');
            authUrl.searchParams.append('client_id', process.env.AIRTABLE_CLIENT_ID || '2588ca29-039d-4704-bd8c-60fcaa7ead3c');
            authUrl.searchParams.append('redirect_uri', `${process.env.BACKEND_URL || 'https://voice-assistant-backend-899362685715.us-central1.run.app'}/api/oauth/airtable/callback`);
            authUrl.searchParams.append('response_type', 'code');
            authUrl.searchParams.append('scope', 'data.records:read data.records:write schema.bases:read');
            authUrl.searchParams.append('state', state);
            authUrl.searchParams.append('code_challenge', codeChallenge);
            authUrl.searchParams.append('code_challenge_method', 'S256');
            
            logger.info(`Airtable OAuth URL created for state: ${state}`);
            
            return {
                authUrl: authUrl.toString(),
                state,
                codeVerifier // Return code verifier so it can be stored
            };
            
        } catch (error) {
            logger.error('Airtable OAuth createAuthUrl error:', error);
            throw error;
        }
    }
    
    async handlePublicCallback(code, state, sessionData) {
        try {
            // Exchange code for tokens with PKCE
            const tokenData = {
                grant_type: 'authorization_code',
                client_id: process.env.AIRTABLE_CLIENT_ID || '2588ca29-039d-4704-bd8c-60fcaa7ead3c',
                client_secret: process.env.AIRTABLE_CLIENT_SECRET,
                code: code,
                redirect_uri: `${process.env.BACKEND_URL || 'https://voice-assistant-backend-899362685715.us-central1.run.app'}/api/oauth/airtable/callback`
            };
            
            // Add code_verifier if available (for PKCE)
            if (sessionData && sessionData.codeVerifier) {
                tokenData.code_verifier = sessionData.codeVerifier;
            }
            
            const tokenResponse = await axios.post('https://airtable.com/oauth2/v1/token', tokenData);
            
            const tokens = tokenResponse.data;
            
            // Get user info
            const userResponse = await axios.get('https://api.airtable.com/v0/meta/whoami', {
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`
                }
            });
            
            const userInfo = userResponse.data;
            
            // Create or get user
            let user = await prisma.user.findUnique({
                where: { email: userInfo.email }
            });
            
            if (!user) {
                // Create new user
                user = await prisma.user.create({
                    data: {
                        email: userInfo.email,
                        name: userInfo.name || userInfo.email,
                        isActive: true,
                        lastActive: new Date()
                    }
                });
            }
            
            // Create or update integration
            const integration = await prisma.integration.upsert({
                where: {
                    userId_type: {
                        userId: user.id,
                        type: 'airtable'
                    }
                },
                update: {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
                    scope: tokens.scope,
                    isActive: true,
                    lastSyncAt: new Date(),
                    serviceData: {
                        userInfo: userInfo,
                        tokenType: tokens.token_type
                    }
                },
                create: {
                    userId: user.id,
                    type: 'airtable',
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
                    scope: tokens.scope,
                    isActive: true,
                    lastSyncAt: new Date(),
                    serviceData: {
                        userInfo: userInfo,
                        tokenType: tokens.token_type
                    }
                }
            });
            
            // Generate JWT tokens for the user
            const jwtService = require('../auth/jwt');
            const { accessToken } = jwtService.generateTokens(user.id);
            
            logger.info(`Airtable OAuth completed for user ${user.id}`);
            
            return {
                integration,
                user,
                jwtToken: accessToken,
                returnUrl: sessionData.returnUrl
            };
            
        } catch (error) {
            logger.error('Airtable OAuth handlePublicCallback error:', error);
            throw error;
        }
    }
}

module.exports = AirtableOAuthService;