const Airtable = require('airtable');
const db = require('../../config/databasePool');
const logger = require('../../utils/logger');
const crypto = require('crypto');

class AirtableOAuthService {
    constructor() {
        this.clientId = process.env.AIRTABLE_CLIENT_ID;
        this.clientSecret = process.env.AIRTABLE_CLIENT_SECRET;
        this.redirectUri = process.env.AIRTABLE_REDIRECT_URI || 'https://floe.cognetica.de/api/oauth/airtable/callback';
        
        if (!this.clientId) {
            logger.warn('Airtable OAuth not configured - missing AIRTABLE_CLIENT_ID');
        }
    }

    async initiateOAuth(userId, returnUrl = null, deviceId = null) {
        try {
            if (!this.clientId) {
                throw new Error('Airtable OAuth not configured');
            }

            const state = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            // Store OAuth state in database
            await db.query(`
                INSERT INTO oauth_states (state, user_id, device_id, return_url, expires_at, provider, created_at)
                VALUES ($1, $2, $3, $4, $5, 'airtable', NOW())
                ON CONFLICT (state) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    device_id = EXCLUDED.device_id,
                    return_url = EXCLUDED.return_url,
                    expires_at = EXCLUDED.expires_at,
                    provider = EXCLUDED.provider
            `, [state, userId, deviceId, returnUrl, expiresAt]);

            const authUrl = `https://airtable.com/oauth2/v1/authorize?` +
                `client_id=${this.clientId}&` +
                `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
                `response_type=code&` +
                `state=${state}&` +
                `scope=data.records:read data.records:write schema.bases:read`;

            logger.info(`Airtable OAuth initiated for user ${userId || 'public'}, device ${deviceId}`);

            return {
                authUrl,
                state
            };
        } catch (error) {
            logger.error('Airtable OAuth initiation error:', error);
            throw error;
        }
    }

    async handleCallback(code, state) {
        try {
            if (!this.clientId || !this.clientSecret) {
                throw new Error('Airtable OAuth not properly configured');
            }

            // Verify state and get user info
            const stateResult = await db.query(`
                SELECT user_id, device_id, return_url, expires_at
                FROM oauth_states 
                WHERE state = $1 AND expires_at > NOW() AND provider = 'airtable'
            `, [state]);

            if (stateResult.rows.length === 0) {
                throw new Error('Invalid or expired OAuth state');
            }

            const stateRecord = stateResult.rows[0];

            // Exchange code for access token
            const tokenResponse = await fetch('https://airtable.com/oauth2/v1/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: this.redirectUri
                })
            });

            if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                throw new Error(`Token exchange failed: ${errorText}`);
            }

            const tokens = await tokenResponse.json();

            // Get user info from Airtable
            const userResponse = await fetch('https://api.airtable.com/v0/meta/whoami', {
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`
                }
            });

            if (!userResponse.ok) {
                throw new Error('Failed to get user info from Airtable');
            }

            const airtableUser = await userResponse.json();
            let userId = stateRecord.user_id;
            let user;

            if (userId) {
                // Update existing user's Airtable tokens
                await db.query(`
                    UPDATE users 
                    SET airtable_access_token = $1,
                        airtable_refresh_token = $2,
                        airtable_user_info = $3,
                        updated_at = NOW()
                    WHERE id = $4
                `, [
                    tokens.access_token,
                    tokens.refresh_token,
                    JSON.stringify(airtableUser),
                    userId
                ]);

                const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
                user = userResult.rows[0];
            } else {
                // Handle public OAuth flow - create or find user by email
                const userEmail = airtableUser.email;
                
                if (!userEmail) {
                    throw new Error('Unable to get user email from Airtable');
                }

                const existingUserResult = await db.query(
                    'SELECT * FROM users WHERE email = $1', 
                    [userEmail]
                );

                if (existingUserResult.rows.length > 0) {
                    // Update existing user
                    user = existingUserResult.rows[0];
                    userId = user.id;

                    await db.query(`
                        UPDATE users 
                        SET airtable_access_token = $1,
                            airtable_refresh_token = $2,
                            airtable_user_info = $3,
                            updated_at = NOW()
                        WHERE id = $4
                    `, [
                        tokens.access_token,
                        tokens.refresh_token,
                        JSON.stringify(airtableUser),
                        userId
                    ]);
                } else {
                    // Create new user
                    const newUserResult = await db.query(`
                        INSERT INTO users (
                            email, 
                            name, 
                            airtable_access_token, 
                            airtable_refresh_token, 
                            airtable_user_info,
                            device_id,
                            created_at,
                            updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                        RETURNING *
                    `, [
                        userEmail,
                        airtableUser.name || userEmail,
                        tokens.access_token,
                        tokens.refresh_token,
                        JSON.stringify(airtableUser),
                        stateRecord.device_id
                    ]);

                    user = newUserResult.rows[0];
                    userId = user.id;
                }
            }

            // Clean up OAuth state
            await db.query('DELETE FROM oauth_states WHERE state = $1', [state]);

            logger.info(`Airtable OAuth completed for user ${userId}, email: ${airtableUser.email}`);

            return {
                user,
                returnUrl: stateRecord.return_url,
                tokens: {
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token
                }
            };
        } catch (error) {
            logger.error('Airtable OAuth callback error:', error);
            throw error;
        }
    }

    async refreshAccessToken(userId) {
        try {
            if (!this.clientId || !this.clientSecret) {
                throw new Error('Airtable OAuth not properly configured');
            }

            const userResult = await db.query(`
                SELECT airtable_refresh_token 
                FROM users 
                WHERE id = $1 AND airtable_refresh_token IS NOT NULL
            `, [userId]);

            if (userResult.rows.length === 0) {
                throw new Error('No Airtable refresh token found for user');
            }

            const refreshToken = userResult.rows[0].airtable_refresh_token;

            const tokenResponse = await fetch('https://airtable.com/oauth2/v1/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                })
            });

            if (!tokenResponse.ok) {
                throw new Error('Token refresh failed');
            }

            const tokens = await tokenResponse.json();

            // Update access token in database
            await db.query(`
                UPDATE users 
                SET airtable_access_token = $1,
                    airtable_refresh_token = $2,
                    updated_at = NOW()
                WHERE id = $3
            `, [tokens.access_token, tokens.refresh_token, userId]);

            return tokens.access_token;
        } catch (error) {
            logger.error('Airtable token refresh error:', error);
            throw error;
        }
    }

    async revokeAccess(userId) {
        try {
            // Airtable doesn't have a revoke endpoint, so we just clear from database
            await db.query(`
                UPDATE users 
                SET airtable_access_token = NULL,
                    airtable_refresh_token = NULL,
                    airtable_user_info = NULL,
                    updated_at = NOW()
                WHERE id = $1
            `, [userId]);

            logger.info(`Airtable OAuth revoked for user ${userId}`);
            return true;
        } catch (error) {
            logger.error('Airtable OAuth revocation error:', error);
            throw error;
        }
    }

    async getAuthenticatedBase(userId, baseId) {
        try {
            const userResult = await db.query(`
                SELECT airtable_access_token
                FROM users 
                WHERE id = $1
            `, [userId]);

            if (userResult.rows.length === 0) {
                throw new Error('User not found');
            }

            const user = userResult.rows[0];
            if (!user.airtable_access_token) {
                throw new Error('Airtable account not connected');
            }

            const base = new Airtable({
                apiKey: user.airtable_access_token
            }).base(baseId);

            return base;
        } catch (error) {
            logger.error('Error getting authenticated Airtable base:', error);
            throw error;
        }
    }

    async getUserBases(userId) {
        try {
            const userResult = await db.query(`
                SELECT airtable_access_token
                FROM users 
                WHERE id = $1
            `, [userId]);

            if (userResult.rows.length === 0) {
                throw new Error('User not found');
            }

            const user = userResult.rows[0];
            if (!user.airtable_access_token) {
                throw new Error('Airtable account not connected');
            }

            const response = await fetch('https://api.airtable.com/v0/meta/bases', {
                headers: {
                    'Authorization': `Bearer ${user.airtable_access_token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to get user bases from Airtable');
            }

            const data = await response.json();
            return data.bases;
        } catch (error) {
            logger.error('Error getting user Airtable bases:', error);
            throw error;
        }
    }
}

module.exports = AirtableOAuthService;