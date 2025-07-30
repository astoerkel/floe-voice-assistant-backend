const axios = require('axios');
const logger = require('../utils/logger');

// Load environment variables
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_URL || 'https://floe.cognetica.de';

async function testGoogleAuthConfiguration() {
    console.log('\n=== Testing Google OAuth Configuration ===\n');
    
    // 1. Check environment variables
    console.log('1. Checking environment variables:');
    console.log(`   - GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '✓ Set' : '✗ Not set'}`);
    console.log(`   - GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? '✓ Set' : '✗ Not set'}`);
    console.log(`   - BACKEND_URL: ${process.env.BACKEND_URL || 'Not set (using default)'}`);
    console.log(`   - Callback URL: ${BACKEND_URL}/api/oauth/google/callback`);
    
    // 2. Test public OAuth initiation endpoint
    console.log('\n2. Testing public OAuth initiation endpoint:');
    try {
        const response = await axios.post(`${BACKEND_URL}/api/oauth/public/google/init`, {
            returnUrl: 'voiceassistant://oauth/success'
        });
        
        if (response.data.authUrl) {
            console.log('   ✓ OAuth initiation successful');
            console.log(`   - Auth URL: ${response.data.authUrl.substring(0, 50)}...`);
            console.log(`   - State: ${response.data.state}`);
            
            // Parse the auth URL to check parameters
            const authUrl = new URL(response.data.authUrl);
            console.log('\n3. Checking OAuth URL parameters:');
            console.log(`   - Client ID: ${authUrl.searchParams.get('client_id')}`);
            console.log(`   - Redirect URI: ${authUrl.searchParams.get('redirect_uri')}`);
            console.log(`   - Scopes: ${authUrl.searchParams.get('scope')}`);
            console.log(`   - Access Type: ${authUrl.searchParams.get('access_type')}`);
            console.log(`   - Prompt: ${authUrl.searchParams.get('prompt')}`);
        } else {
            console.log('   ✗ No auth URL received');
        }
    } catch (error) {
        console.log(`   ✗ Failed to initiate OAuth: ${error.response?.data?.message || error.message}`);
        if (error.response?.data) {
            console.log('   Response:', JSON.stringify(error.response.data, null, 2));
        }
    }
    
    // 3. Check if the callback endpoint is accessible
    console.log('\n4. Checking callback endpoint accessibility:');
    try {
        const response = await axios.get(`${BACKEND_URL}/api/oauth/google/callback`, {
            params: { error: 'test' },
            maxRedirects: 0,
            validateStatus: function (status) {
                return status < 500; // Accept any status less than 500
            }
        });
        
        if (response.status === 302 || response.status === 301) {
            console.log('   ✓ Callback endpoint is accessible (redirects as expected)');
        } else {
            console.log(`   - Callback endpoint returned status: ${response.status}`);
        }
    } catch (error) {
        if (error.response && error.response.status >= 300 && error.response.status < 400) {
            console.log('   ✓ Callback endpoint is accessible (redirects as expected)');
        } else {
            console.log(`   ✗ Callback endpoint error: ${error.message}`);
        }
    }
    
    // 4. Test authenticated integrations endpoint
    console.log('\n5. Testing integrations endpoint (requires auth):');
    console.log('   - This would require a valid JWT token');
    console.log('   - Endpoint: GET /api/oauth/integrations');
    
    console.log('\n=== Configuration Summary ===');
    console.log('\nTo complete Google OAuth setup:');
    console.log('1. Ensure Google Cloud Console OAuth 2.0 Client is configured with:');
    console.log(`   - Authorized redirect URI: ${BACKEND_URL}/api/oauth/google/callback`);
    console.log('2. Test the full OAuth flow from your iOS app');
    console.log('3. Monitor server logs for any errors during the OAuth process');
    
    // 5. Check OpenRouter configuration
    console.log('\n=== OpenRouter Configuration ===');
    console.log(`OpenRouter API Key: ${process.env.OPENROUTER_API_KEY ? '✓ Set' : '✗ Not set'}`);
    console.log(`OpenRouter Site URL: ${process.env.OPENROUTER_SITE_URL || 'Not set'}`);
    console.log(`OpenRouter Site Name: ${process.env.OPENROUTER_SITE_NAME || 'Not set'}`);
}

// Run the test
testGoogleAuthConfiguration().catch(console.error);