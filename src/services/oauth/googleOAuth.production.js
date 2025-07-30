const { google } = require('googleapis');
const db = require('../../config/databasePool');
const logger = require('../../utils/logger');
const crypto = require('crypto');

class GoogleOAuthService {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || 'https://floe.cognetica.de/api/oauth/google/callback'
        );

        this.scopes = [
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.events'
        ];
    }

    async initiateOAuth(userId, returnUrl = null, deviceId = null) {
        try {
            const state = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            // Store OAuth state in database
            await db.query(`
                INSERT INTO oauth_states (state, user_id, device_id, return_url, expires_at, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (state) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    device_id = EXCLUDED.device_id,
                    return_url = EXCLUDED.return_url,
                    expires_at = EXCLUDED.expires_at
            `, [state, userId, deviceId, returnUrl, expiresAt]);

            const authUrl = this.oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: this.scopes,
                state: state,
                prompt: 'consent'
            });

            logger.info(`Google OAuth initiated for user ${userId || 'public'}, device ${deviceId}`);

            return {
                authUrl,
                state
            };
        } catch (error) {
            logger.error('Google OAuth initiation error:', error);
            throw error;
        }
    }

    async handlePublicCallback(code, state, sessionData) {
        // For public OAuth, we use the session data passed in
        return this.handleCallback(code, state, sessionData);
    }

    async handleCallback(code, state, sessionData = null) {
        try {
            // For public OAuth flow, use sessionData if provided
            let stateRecord;
            if (sessionData && sessionData.deviceId) {
                // Public OAuth flow - use session data passed from controller
                stateRecord = {
                    user_id: sessionData.userId || null, // Use userId from session if available
                    device_id: sessionData.deviceId,
                    return_url: sessionData.returnUrl
                };
            } else {
                // Traditional OAuth flow - get from database
                const stateResult = await db.query(`
                    SELECT user_id, device_id, return_url, expires_at
                    FROM oauth_states 
                    WHERE state = $1 AND expires_at > NOW()
                `, [state]);

                if (stateResult.rows.length === 0) {
                    throw new Error('Invalid or expired OAuth state');
                }

                stateRecord = stateResult.rows[0];
            }

            // Exchange code for tokens
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);

            // Get user info from Google
            const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
            const userInfo = await oauth2.userinfo.get();

            const googleUser = userInfo.data;
            let userId = stateRecord.user_id;
            let user;

            if (userId) {
                // Update existing user's Google tokens
                await db.query(`
                    UPDATE users 
                    SET google_access_token = $1,
                        google_refresh_token = $2,
                        google_user_info = $3,
                        updated_at = NOW()
                    WHERE id = $4
                `, [
                    tokens.access_token,
                    tokens.refresh_token,
                    JSON.stringify(googleUser),
                    userId
                ]);

                const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
                user = userResult.rows[0];
            } else {
                // Handle public OAuth flow - try to find user by device_id first, then email
                
                // First, try to find user by device_id if available
                let deviceUser = null;
                if (stateRecord.device_id) {
                    const deviceUserResult = await db.query(
                        'SELECT * FROM users WHERE device_id = $1', 
                        [stateRecord.device_id]
                    );
                    if (deviceUserResult.rows.length > 0) {
                        deviceUser = deviceUserResult.rows[0];
                        logger.info(`Found user ${deviceUser.id} (${deviceUser.email}) by device_id ${stateRecord.device_id}`);
                    }
                }

                // Try to find user by Google email
                const existingUserResult = await db.query(
                    'SELECT * FROM users WHERE email = $1', 
                    [googleUser.email]
                );

                if (deviceUser) {
                    // Link Google account to device user (handles different email case)
                    user = deviceUser;
                    userId = user.id;
                    
                    logger.info(`Linking Google account ${googleUser.email} to existing device user ${userId} (${user.email})`);

                    await db.query(`
                        UPDATE users 
                        SET google_access_token = $1,
                            google_refresh_token = $2,
                            google_user_info = $3,
                            updated_at = NOW()
                        WHERE id = $4
                    `, [
                        tokens.access_token,
                        tokens.refresh_token,
                        JSON.stringify(googleUser),
                        userId
                    ]);
                } else if (existingUserResult.rows.length > 0) {
                    // Update existing user found by email
                    user = existingUserResult.rows[0];
                    userId = user.id;

                    logger.info(`Updating existing user ${userId} with Google account ${googleUser.email}`);

                    await db.query(`
                        UPDATE users 
                        SET google_access_token = $1,
                            google_refresh_token = $2,
                            google_user_info = $3,
                            updated_at = NOW()
                        WHERE id = $4
                    `, [
                        tokens.access_token,
                        tokens.refresh_token,
                        JSON.stringify(googleUser),
                        userId
                    ]);
                } else {
                    // Create new user only if no existing user found
                    logger.info(`Creating new user for Google account ${googleUser.email}`);
                    
                    const newUserResult = await db.query(`
                        INSERT INTO users (
                            email, 
                            name, 
                            google_access_token, 
                            google_refresh_token, 
                            google_user_info,
                            device_id,
                            created_at,
                            updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                        RETURNING *
                    `, [
                        googleUser.email,
                        googleUser.name,
                        tokens.access_token,
                        tokens.refresh_token,
                        JSON.stringify(googleUser),
                        stateRecord.device_id
                    ]);

                    user = newUserResult.rows[0];
                    userId = user.id;
                }
            }

            // Clean up OAuth state
            await db.query('DELETE FROM oauth_states WHERE state = $1', [state]);

            logger.info(`Google OAuth completed for user ${userId}, email: ${googleUser.email}`);

            // Generate JWT token for the user if this is a public OAuth flow
            let jwtToken = null;
            if (sessionData && sessionData.deviceId) {
                const JWTService = require('../auth/jwt.production');
                const jwt = new JWTService();
                const jwtTokens = jwt.generateTokens(userId);
                jwtToken = jwtTokens.accessToken;
                
                logger.info(`Generated JWT token for public OAuth flow, user ${userId}`);
            }

            return {
                user,
                returnUrl: stateRecord.return_url || (sessionData ? sessionData.returnUrl : null),
                jwtToken,
                tokens: {
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token
                }
            };
        } catch (error) {
            logger.error('Google OAuth callback error:', error);
            throw error;
        }
    }

    async refreshAccessToken(userId) {
        try {
            const userResult = await db.query(`
                SELECT google_refresh_token 
                FROM users 
                WHERE id = $1 AND google_refresh_token IS NOT NULL
            `, [userId]);

            if (userResult.rows.length === 0) {
                throw new Error('No refresh token found for user');
            }

            const refreshToken = userResult.rows[0].google_refresh_token;
            
            this.oauth2Client.setCredentials({
                refresh_token: refreshToken
            });

            const { credentials } = await this.oauth2Client.refreshAccessToken();

            // Update access token in database
            await db.query(`
                UPDATE users 
                SET google_access_token = $1, updated_at = NOW()
                WHERE id = $2
            `, [credentials.access_token, userId]);

            return credentials.access_token;
        } catch (error) {
            logger.error('Token refresh error:', error);
            throw error;
        }
    }

    async revokeAccess(userId) {
        try {
            const userResult = await db.query(`
                SELECT google_access_token 
                FROM users 
                WHERE id = $1 AND google_access_token IS NOT NULL
            `, [userId]);

            if (userResult.rows.length > 0) {
                const accessToken = userResult.rows[0].google_access_token;
                
                // Revoke token with Google
                try {
                    await this.oauth2Client.revokeToken(accessToken);
                } catch (revokeError) {
                    logger.warn('Google token revocation failed:', revokeError.message);
                }
            }

            // Clear tokens from database
            await db.query(`
                UPDATE users 
                SET google_access_token = NULL,
                    google_refresh_token = NULL,
                    google_user_info = NULL,
                    updated_at = NOW()
                WHERE id = $1
            `, [userId]);

            logger.info(`Google OAuth revoked for user ${userId}`);
            return true;
        } catch (error) {
            logger.error('Google OAuth revocation error:', error);
            throw error;
        }
    }

    async getAuthenticatedClient(userId) {
        try {
            const userResult = await db.query(`
                SELECT google_access_token, google_refresh_token
                FROM users 
                WHERE id = $1
            `, [userId]);

            if (userResult.rows.length === 0) {
                throw new Error('User not found');
            }

            const user = userResult.rows[0];
            if (!user.google_access_token) {
                throw new Error('Google account not connected');
            }

            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );

            oauth2Client.setCredentials({
                access_token: user.google_access_token,
                refresh_token: user.google_refresh_token
            });

            // Handle token refresh
            oauth2Client.on('tokens', async (tokens) => {
                if (tokens.access_token) {
                    await db.query(`
                        UPDATE users 
                        SET google_access_token = $1, updated_at = NOW()
                        WHERE id = $2
                    `, [tokens.access_token, userId]);
                }
                if (tokens.refresh_token) {
                    await db.query(`
                        UPDATE users 
                        SET google_refresh_token = $1, updated_at = NOW()
                        WHERE id = $2
                    `, [tokens.refresh_token, userId]);
                }
            });

            return oauth2Client;
        } catch (error) {
            logger.error('Error getting authenticated Google client:', error);
            throw error;
        }
    }
}

module.exports = GoogleOAuthService;