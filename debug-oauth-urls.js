// Debug OAuth URL generation
require('dotenv').config();

console.log('=== OAuth URL Debug ===\n');

// Check environment
console.log('Environment Variables:');
console.log('BACKEND_URL:', process.env.BACKEND_URL || 'NOT SET (using fallback)');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID || 'NOT SET');
console.log('AIRTABLE_CLIENT_ID:', process.env.AIRTABLE_CLIENT_ID || 'NOT SET');
console.log('');

// Test Google OAuth URL generation
try {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID || '899362685715-eha0qo2dsre64sbiapvhrbomp1ep05e5.apps.googleusercontent.com',
        process.env.GOOGLE_CLIENT_SECRET || 'test-secret',
        `${process.env.BACKEND_URL || 'https://voice-assistant-backend-899362685715.us-central1.run.app'}/api/oauth/google/callback`
    );
    
    const scopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
    ];
    
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: 'test-state-123',
        prompt: 'consent'
    });
    
    console.log('Google OAuth URL:');
    console.log(authUrl);
    console.log('');
    
    // Parse and display components
    const url = new URL(authUrl);
    console.log('Google OAuth URL Components:');
    console.log('- Base URL:', url.origin + url.pathname);
    console.log('- Client ID:', url.searchParams.get('client_id'));
    console.log('- Redirect URI:', url.searchParams.get('redirect_uri'));
    console.log('- Scopes:', url.searchParams.get('scope'));
    console.log('');
    
} catch (error) {
    console.error('Error generating Google OAuth URL:', error.message);
}

// Test Airtable OAuth URL generation
try {
    const crypto = require('crypto');
    
    // Simulate PKCE
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
    
    const clientId = process.env.AIRTABLE_CLIENT_ID || '2588ca29-039d-4704-bd8c-60fcaa7ead3c';
    const redirectUri = `${process.env.BACKEND_URL || 'https://voice-assistant-backend-899362685715.us-central1.run.app'}/api/oauth/airtable/callback`;
    const scopes = ['data.records:read', 'data.records:write', 'schema.bases:read'];
    
    const authUrl = new URL('https://airtable.com/oauth2/v1/authorize');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', scopes.join(' '));
    authUrl.searchParams.append('state', 'test-state-456');
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    
    console.log('Airtable OAuth URL:');
    console.log(authUrl.toString());
    console.log('');
    
    console.log('Airtable OAuth URL Components:');
    console.log('- Base URL:', authUrl.origin + authUrl.pathname);
    console.log('- Client ID:', authUrl.searchParams.get('client_id'));
    console.log('- Redirect URI:', authUrl.searchParams.get('redirect_uri'));
    console.log('- Scopes:', authUrl.searchParams.get('scope'));
    console.log('- Code Challenge:', authUrl.searchParams.get('code_challenge'));
    console.log('- Code Challenge Method:', authUrl.searchParams.get('code_challenge_method'));
    console.log('');
    
} catch (error) {
    console.error('Error generating Airtable OAuth URL:', error.message);
}

// Check what the production endpoints should return
console.log('Expected Production OAuth URLs:');
console.log('Google Init: POST https://voice-assistant-backend-899362685715.us-central1.run.app/api/oauth/public/google/init');
console.log('Airtable Init: POST https://voice-assistant-backend-899362685715.us-central1.run.app/api/oauth/public/airtable/init');
console.log('');

// Test actual endpoint responses
const axios = require('axios');

async function testEndpoints() {
    console.log('Testing actual endpoints...\n');
    
    // Test Google OAuth init
    try {
        const googleResponse = await axios.post(
            'https://voice-assistant-backend-899362685715.us-central1.run.app/api/oauth/public/google/init',
            {
                deviceId: 'test-device',
                returnUrl: 'voiceassistant://oauth-complete'
            }
        );
        
        console.log('Google OAuth Init Response:');
        console.log('- Success:', googleResponse.data.success);
        console.log('- Auth URL:', googleResponse.data.authUrl);
        
        if (googleResponse.data.authUrl) {
            const url = new URL(googleResponse.data.authUrl);
            console.log('- Redirect URI in URL:', url.searchParams.get('redirect_uri'));
        }
        console.log('');
        
    } catch (error) {
        console.error('Google OAuth Init Error:', error.response?.data || error.message);
    }
    
    // Test Airtable OAuth init
    try {
        const airtableResponse = await axios.post(
            'https://voice-assistant-backend-899362685715.us-central1.run.app/api/oauth/public/airtable/init',
            {
                deviceId: 'test-device',
                returnUrl: 'voiceassistant://oauth-complete'
            }
        );
        
        console.log('Airtable OAuth Init Response:');
        console.log('- Success:', airtableResponse.data.success);
        console.log('- Auth URL:', airtableResponse.data.authUrl);
        
        if (airtableResponse.data.authUrl) {
            const url = new URL(airtableResponse.data.authUrl);
            console.log('- Redirect URI in URL:', url.searchParams.get('redirect_uri'));
        }
        console.log('');
        
    } catch (error) {
        console.error('Airtable OAuth Init Error:', error.response?.data || error.message);
    }
}

testEndpoints();