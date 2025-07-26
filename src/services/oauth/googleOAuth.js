const { google } = require('googleapis');
const { prisma } = require('../../config/database');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class GoogleOAuthService {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.BACKEND_URL || 'https://voice-assistant-backend-899362685715.us-central1.run.app'}/api/oauth/google/callback`
        );
        
        this.scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
        ];
    }
    
    async initiateOAuth(userId, returnUrl = null) {
        try {
            // Generate state parameter for security
            const state = crypto.randomBytes(32).toString('hex');
            
            // Store state in database
            await prisma.oAuthState.create({
                data: {
                    state,
                    userId,
                    provider: 'google',
                    returnUrl,
                    expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
                }
            });
            
            // Generate authorization URL
            const authUrl = this.oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: this.scopes,
                state: state,
                prompt: 'consent' // Force consent to get refresh token
            });
            
            logger.info(`Google OAuth initiated for user ${userId}`);
            
            return {
                authUrl,
                state
            };
        } catch (error) {
            logger.error('Google OAuth initiation error:', error);
            throw new Error('Failed to initiate Google OAuth');
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
            
            // Exchange code for tokens
            const { tokens } = await this.oauth2Client.getToken(code);
            
            // Get user info
            this.oauth2Client.setCredentials(tokens);
            const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
            const userInfo = await oauth2.userinfo.get();
            
            // Store integration
            const integration = await prisma.integration.upsert({
                where: {
                    userId_type: {
                        userId: stateRecord.userId,
                        type: 'google'
                    }
                },
                update: {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token || undefined,
                    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                    scope: this.scopes.join(' '),
                    isActive: true,
                    lastSyncAt: new Date(),
                    serviceData: {
                        userInfo: userInfo.data,
                        tokenType: tokens.token_type || 'Bearer'
                    }
                },
                create: {
                    userId: stateRecord.userId,
                    type: 'google',
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                    scope: this.scopes.join(' '),
                    serviceData: {
                        userInfo: userInfo.data,
                        tokenType: tokens.token_type || 'Bearer'
                    }
                }
            });
            
            // Clean up state
            await prisma.oAuthState.delete({
                where: { state }
            });
            
            logger.info(`Google OAuth completed for user ${stateRecord.userId}`);
            
            return {
                integration,
                returnUrl: stateRecord.returnUrl,
                userInfo: userInfo.data
            };
            
        } catch (error) {
            logger.error('Google OAuth callback error:', error);
            throw new Error('Failed to complete Google OAuth');
        }
    }
    
    async refreshToken(integration) {
        try {
            if (!integration.refreshToken) {
                throw new Error('No refresh token available');
            }
            
            this.oauth2Client.setCredentials({
                refresh_token: integration.refreshToken
            });
            
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            
            // Update integration with new tokens
            const updatedIntegration = await prisma.integration.update({
                where: { id: integration.id },
                data: {
                    accessToken: credentials.access_token,
                    refreshToken: credentials.refresh_token || integration.refreshToken,
                    expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
                    lastSyncAt: new Date()
                }
            });
            
            logger.info(`Google OAuth token refreshed for integration ${integration.id}`);
            
            return updatedIntegration;
            
        } catch (error) {
            logger.error('Google OAuth token refresh error:', error);
            
            // If refresh fails, mark integration as inactive
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
            
            throw new Error('Failed to refresh Google OAuth token');
        }
    }
    
    async getValidToken(userId) {
        try {
            let integration = await prisma.integration.findUnique({
                where: {
                    userId_type: {
                        userId,
                        type: 'google'
                    }
                }
            });
            
            if (!integration || !integration.isActive) {
                throw new Error('Google integration not found or inactive');
            }
            
            // Check if token needs refresh
            if (integration.expiresAt && new Date() >= new Date(integration.expiresAt.getTime() - 5 * 60 * 1000)) {
                integration = await this.refreshToken(integration);
            }
            
            return integration.accessToken;
            
        } catch (error) {
            logger.error('Get valid Google token error:', error);
            throw error;
        }
    }
    
    async revokeToken(integration) {
        try {
            // Revoke token with Google
            this.oauth2Client.setCredentials({
                access_token: integration.accessToken
            });
            
            await this.oauth2Client.revokeCredentials();
            
            logger.info(`Google OAuth token revoked for integration ${integration.id}`);
            
        } catch (error) {
            logger.error('Google OAuth token revoke error:', error);
            // Don't throw error, just log it
        }
    }
    
    // Public OAuth methods (no existing user required)
    async createAuthUrl(state, returnUrl = null) {
        try {
            // Generate authorization URL
            const authUrl = this.oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: this.scopes,
                state: state,
                prompt: 'consent' // Force consent to get refresh token
            });
            
            logger.info(`Google OAuth URL created for state: ${state}`);
            
            return {
                authUrl,
                state
            };
            
        } catch (error) {
            logger.error('Google OAuth createAuthUrl error:', error);
            throw error;
        }
    }
    
    async handlePublicCallback(code, state, sessionData) {
        try {
            // Exchange code for tokens
            const { tokens } = await this.oauth2Client.getToken(code);
            
            // Get user info
            this.oauth2Client.setCredentials(tokens);
            const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
            const userInfoResponse = await oauth2.userinfo.get();
            const userInfo = userInfoResponse.data;
            
            // Use authenticated user if available, otherwise create/get user by email
            let user;
            if (sessionData.userId) {
                // Link to existing authenticated user
                user = await prisma.user.findUnique({
                    where: { id: sessionData.userId, isActive: true }
                });
                
                if (!user) {
                    throw new Error('Authenticated user not found or inactive');
                }
                
                logger.info(`Linking Google account ${userInfo.email} to existing user ${user.id} (${user.email})`);
            } else {
                // Fallback: create or get user by Google email (legacy behavior)
                user = await prisma.user.findUnique({
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
                    
                    logger.info(`Created new user ${user.id} for Google account ${userInfo.email}`);
                }
            }
            
            // Create or update integration
            const integration = await prisma.integration.upsert({
                where: {
                    userId_type: {
                        userId: user.id,
                        type: 'google'
                    }
                },
                update: {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                    scope: this.scopes.join(' '),
                    isActive: true,
                    lastSyncAt: new Date(),
                    serviceData: {
                        userInfo: {
                            email: userInfo.email,
                            name: userInfo.name,
                            picture: userInfo.picture
                        }
                    }
                },
                create: {
                    userId: user.id,
                    type: 'google',
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                    scope: this.scopes.join(' '),
                    isActive: true,
                    lastSyncAt: new Date(),
                    serviceData: {
                        userInfo: {
                            email: userInfo.email,
                            name: userInfo.name,
                            picture: userInfo.picture
                        }
                    }
                }
            });
            
            // Generate JWT tokens for the user
            const jwtService = require('../auth/jwt');
            const { accessToken } = jwtService.generateTokens(user.id);
            
            logger.info(`Google OAuth completed for user ${user.id}`);
            
            return {
                integration,
                user,
                jwtToken: accessToken,
                returnUrl: sessionData.returnUrl
            };
            
        } catch (error) {
            logger.error('Google OAuth handlePublicCallback error:', error);
            throw error;
        }
    }
}

module.exports = GoogleOAuthService;