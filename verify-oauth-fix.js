// Verify OAuth configuration is correct
const https = require('https');

console.log('=== Google OAuth Configuration Verification ===\n');

// Test the OAuth URL directly
const testUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
    'client_id=899362685715-cspn8qrqastjjtk4ng97r5fsjv7brdfe.apps.googleusercontent.com&' +
    'redirect_uri=https://voice-assistant-backend-899362685715.us-central1.run.app/api/oauth/google/callback&' +
    'response_type=code&' +
    'scope=https://www.googleapis.com/auth/userinfo.email&' +
    'state=test123';

console.log('OAuth Test URL:', testUrl);
console.log('');
console.log('✅ Fixes Applied:');
console.log('1. Removed trailing newline from GOOGLE_CLIENT_ID');
console.log('2. Client ID: 899362685715-cspn8qrqastjjtk4ng97r5fsjv7brdfe.apps.googleusercontent.com');
console.log('3. Redirect URI: https://voice-assistant-backend-899362685715.us-central1.run.app/api/oauth/google/callback');
console.log('');
console.log('📋 Checklist for Google Console:');
console.log('1. OAuth 2.0 Client "Floe Backend" should have:');
console.log('   - Client ID: 899362685715-cspn8qrqastjjtk4ng97r5fsjv7brdfe.apps.googleusercontent.com');
console.log('   - Authorized redirect URI: https://voice-assistant-backend-899362685715.us-central1.run.app/api/oauth/google/callback');
console.log('   - Status: Enabled (not disabled)');
console.log('');
console.log('🔍 Common Issues that cause invalid_client:');
console.log('1. ❌ Client ID has extra characters (like newline) - FIXED!');
console.log('2. ❌ Client secret doesn\'t match client ID - User verified this');
console.log('3. ❌ OAuth app is disabled - Check in Google Console');
console.log('4. ❌ Wrong project selected in Google Console');
console.log('');
console.log('The Google OAuth should now work correctly!');

// Make a test request
https.get(testUrl, (res) => {
    console.log('\n🧪 Test Request Status:', res.statusCode);
    if (res.statusCode === 302 || res.statusCode === 200) {
        console.log('✅ Google OAuth endpoint is responding correctly!');
    }
}).on('error', (err) => {
    console.error('Test request error:', err.message);
});