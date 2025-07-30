const axios = require('axios');
const { ChatOpenAI } = require('@langchain/openai');

// Load environment variables from the Hetzner production file
require('dotenv').config({ path: '.env.hetzner-production' });

const BACKEND_URL = process.env.BACKEND_URL || 'https://floe.cognetica.de';

console.log('=== Voice Assistant Hetzner Configuration Verification ===\n');

async function verifyConfiguration() {
    let allTestsPassed = true;
    
    // 1. Verify OpenRouter Configuration
    console.log('1. OpenRouter Configuration:');
    console.log('   - API Key:', process.env.OPENROUTER_API_KEY ? `✓ Set (${process.env.OPENROUTER_API_KEY.substring(0, 10)}...)` : '✗ Not set');
    console.log('   - Site URL:', process.env.OPENROUTER_SITE_URL || 'Not set');
    console.log('   - Site Name:', process.env.OPENROUTER_SITE_NAME || 'Not set');
    
    if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_API_KEY.startsWith('sk-or-')) {
        console.log('   ✗ ERROR: Invalid or missing OpenRouter API key');
        allTestsPassed = false;
    }
    
    // Test OpenRouter connection
    console.log('\n   Testing OpenRouter connection...');
    try {
        const llm = new ChatOpenAI({
            modelName: 'openai/gpt-4o',
            temperature: 0.1,
            maxTokens: 50,
            openAIApiKey: process.env.OPENROUTER_API_KEY,
            configuration: {
                baseURL: 'https://openrouter.ai/api/v1',
                defaultHeaders: {
                    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://floe.cognetica.de',
                    'X-Title': process.env.OPENROUTER_SITE_NAME || 'voice_assistant'
                }
            }
        });
        
        const response = await llm.invoke('Say "OpenRouter is working" if you can read this.');
        console.log('   ✓ OpenRouter connection successful');
        console.log(`   Response: ${response.content}`);
    } catch (error) {
        console.log('   ✗ OpenRouter connection failed:', error.message);
        allTestsPassed = false;
    }
    
    // 2. Verify Google OAuth Configuration
    console.log('\n2. Google OAuth Configuration:');
    console.log('   - Client ID:', process.env.GOOGLE_CLIENT_ID ? `✓ Set (${process.env.GOOGLE_CLIENT_ID.substring(0, 20)}...)` : '✗ Not set');
    console.log('   - Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? '✓ Set' : '✗ Not set');
    console.log('   - Callback URL:', `${BACKEND_URL}/api/oauth/google/callback`);
    
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.log('   ✗ ERROR: Missing Google OAuth credentials');
        allTestsPassed = false;
    }
    
    // 3. Verify Database Configuration
    console.log('\n3. Database Configuration:');
    console.log('   - DATABASE_URL:', process.env.DATABASE_URL ? '✓ Set' : '✗ Not set');
    console.log('   - REDIS_URL:', process.env.REDIS_URL ? '✓ Set' : '✗ Not set');
    
    // 4. Verify JWT Configuration
    console.log('\n4. JWT Configuration:');
    console.log('   - JWT_SECRET:', process.env.JWT_SECRET ? '✓ Set' : '✗ Not set');
    console.log('   - JWT_REFRESH_SECRET:', process.env.JWT_REFRESH_SECRET ? '✓ Set' : '✗ Not set');
    
    // 5. Test Backend Endpoints
    console.log('\n5. Testing Backend Endpoints:');
    
    // Test health endpoint
    try {
        const response = await axios.get(`${BACKEND_URL}/api/health`);
        console.log('   ✓ Health endpoint:', response.data.status || 'OK');
    } catch (error) {
        console.log('   ✗ Health endpoint failed:', error.message);
        allTestsPassed = false;
    }
    
    // Test OAuth initiation
    try {
        const response = await axios.post(`${BACKEND_URL}/api/oauth/public/google/init`, {
            returnUrl: 'voiceassistant://oauth/success'
        });
        
        if (response.data.authUrl) {
            console.log('   ✓ Google OAuth initiation endpoint working');
            
            // Verify the auth URL contains correct parameters
            const authUrl = new URL(response.data.authUrl);
            const clientId = authUrl.searchParams.get('client_id');
            const redirectUri = authUrl.searchParams.get('redirect_uri');
            
            if (clientId === process.env.GOOGLE_CLIENT_ID) {
                console.log('   ✓ OAuth client ID matches configuration');
            } else {
                console.log('   ✗ OAuth client ID mismatch');
                allTestsPassed = false;
            }
            
            if (redirectUri === `${BACKEND_URL}/api/oauth/google/callback`) {
                console.log('   ✓ OAuth redirect URI correctly configured');
            } else {
                console.log('   ✗ OAuth redirect URI mismatch:', redirectUri);
                allTestsPassed = false;
            }
        }
    } catch (error) {
        console.log('   ✗ OAuth initiation failed:', error.response?.data?.message || error.message);
        allTestsPassed = false;
    }
    
    // 6. Configuration Summary
    console.log('\n=== Configuration Summary ===');
    if (allTestsPassed) {
        console.log('✓ All configuration tests passed!');
        console.log('\nNext steps:');
        console.log('1. Deploy to Hetzner server using:');
        console.log('   scp .env.hetzner-production floeapp@91.99.186.67:/opt/voice-assistant/.env');
        console.log('2. Restart the backend on server:');
        console.log('   ssh floeapp@91.99.186.67 "cd /opt/voice-assistant && pm2 restart all"');
        console.log('3. Test Google OAuth flow from iOS app');
    } else {
        console.log('✗ Some configuration tests failed. Please fix the issues above.');
    }
    
    // 7. Important reminders
    console.log('\n=== Important Reminders ===');
    console.log('1. Ensure Google Cloud Console has the correct redirect URI:');
    console.log(`   ${BACKEND_URL}/api/oauth/google/callback`);
    console.log('2. The enhanced coordinator now uses ONLY OpenRouter (no OpenAI fallback)');
    console.log('3. Monitor server logs for any runtime errors');
}

// Run verification
verifyConfiguration().catch(console.error);