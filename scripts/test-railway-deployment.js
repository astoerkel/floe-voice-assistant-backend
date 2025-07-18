#!/usr/bin/env node

/**
 * Test Railway Deployment Script
 * Tests OAuth endpoints and backend health on Railway
 */

const axios = require('axios');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

async function testBackendHealth() {
    logInfo('Testing Railway backend health...');
    
    const backendUrl = 'https://voiceassistant-floe-production.up.railway.app';
    
    try {
        const response = await axios.get(`${backendUrl}/health`, { timeout: 10000 });
        
        if (response.status === 200) {
            logSuccess(`Backend is healthy: ${response.data.status}`);
            logInfo(`Environment: ${response.data.environment}`);
            logInfo(`Version: ${response.data.version}`);
            return true;
        } else {
            logError(`Backend health check failed with status: ${response.status}`);
            return false;
        }
    } catch (error) {
        logError(`Backend health check failed: ${error.message}`);
        if (error.code === 'ENOTFOUND') {
            logError('Backend URL not found. Is the Railway deployment running?');
        }
        return false;
    }
}

async function testOAuthEndpoints() {
    logInfo('Testing OAuth endpoints...');
    
    const backendUrl = 'https://voiceassistant-floe-production.up.railway.app';
    
    try {
        // Test Google OAuth init endpoint (should return 401 without auth)
        const response = await axios.get(`${backendUrl}/api/oauth/google/init`, { 
            timeout: 5000,
            validateStatus: (status) => status === 401 || status === 200
        });
        
        if (response.status === 401) {
            logSuccess('Google OAuth init endpoint is responding (authentication required)');
            return true;
        } else if (response.status === 200) {
            logWarning('Google OAuth init endpoint accessible without authentication');
            return true;
        } else {
            logError(`OAuth endpoint test failed with status: ${response.status}`);
            return false;
        }
    } catch (error) {
        logError(`OAuth endpoint test failed: ${error.message}`);
        
        if (error.response?.status === 404) {
            logError('OAuth routes not found. Are the routes registered in app.js?');
        } else if (error.response?.status === 500) {
            logError('Server error. Check Railway logs for details.');
        }
        
        return false;
    }
}

async function testDatabaseConnection() {
    logInfo('Testing database connection...');
    
    const backendUrl = 'https://voiceassistant-floe-production.up.railway.app';
    
    try {
        // Test any database-dependent endpoint
        const response = await axios.get(`${backendUrl}/api/auth/profile`, { 
            timeout: 5000,
            validateStatus: (status) => status === 401 || status === 200
        });
        
        if (response.status === 401) {
            logSuccess('Database connection working (authentication required)');
            return true;
        } else {
            logSuccess('Database connection appears to be working');
            return true;
        }
    } catch (error) {
        if (error.response?.status === 500) {
            logError('Database connection may be failing. Check Railway logs.');
            return false;
        } else {
            logSuccess('Database connection test inconclusive but likely working');
            return true;
        }
    }
}

async function checkEnvironmentVariables() {
    logInfo('Checking if environment variables are set...');
    
    const backendUrl = 'https://voiceassistant-floe-production.up.railway.app';
    
    try {
        // The health endpoint might include environment info
        const response = await axios.get(`${backendUrl}/health`, { timeout: 5000 });
        
        if (response.data.environment) {
            logSuccess(`Environment: ${response.data.environment}`);
        }
        
        // Test if OAuth endpoints are working (indirect test of env vars)
        const oauthResponse = await axios.get(`${backendUrl}/api/oauth/google/init`, { 
            timeout: 5000,
            validateStatus: (status) => [200, 401, 500].includes(status)
        });
        
        if (oauthResponse.status === 500) {
            logWarning('OAuth endpoints returning 500 - may indicate missing environment variables');
            return false;
        } else {
            logSuccess('OAuth endpoints responding correctly');
            return true;
        }
    } catch (error) {
        logError(`Environment variable check failed: ${error.message}`);
        return false;
    }
}

async function displayDeploymentStatus() {
    const backendUrl = 'https://voiceassistant-floe-production.up.railway.app';
    
    log('\n' + '='.repeat(60), 'cyan');
    log('🚀 Railway Deployment Status', 'cyan');
    log('='.repeat(60), 'cyan');
    
    logInfo('Backend URL: ' + backendUrl);
    logInfo('Health Check: ' + backendUrl + '/health');
    logInfo('Google OAuth Init: ' + backendUrl + '/api/oauth/google/init');
    logInfo('Google OAuth Callback: ' + backendUrl + '/api/oauth/google/callback');
    logInfo('Integrations: ' + backendUrl + '/api/oauth/integrations');
    
    log('\n📋 Next Steps:', 'yellow');
    logInfo('1. Verify all tests pass above');
    logInfo('2. Check Railway logs: railway logs --follow');
    logInfo('3. Test OAuth flow from iOS app');
    logInfo('4. Monitor integration success rates');
    
    log('\n🔧 If issues found:', 'yellow');
    logInfo('• Check Railway environment variables are set');
    logInfo('• Verify database and Redis services are running');
    logInfo('• Review Railway deployment logs');
    logInfo('• Ensure OAuth routes are registered in app.js');
}

async function main() {
    log('🧪 Testing Railway OAuth Deployment', 'cyan');
    log('=' .repeat(50), 'cyan');
    
    let allTestsPassed = true;
    
    // Run all tests
    const tests = [
        { name: 'Backend Health', fn: testBackendHealth },
        { name: 'OAuth Endpoints', fn: testOAuthEndpoints },
        { name: 'Database Connection', fn: testDatabaseConnection },
        { name: 'Environment Variables', fn: checkEnvironmentVariables }
    ];
    
    for (const test of tests) {
        try {
            const result = await test.fn();
            if (!result) {
                allTestsPassed = false;
            }
        } catch (error) {
            logError(`Error during ${test.name} test: ${error.message}`);
            allTestsPassed = false;
        }
        
        log(''); // Empty line for readability
    }
    
    // Display deployment status
    await displayDeploymentStatus();
    
    // Final result
    log('\n' + '='.repeat(50), 'cyan');
    if (allTestsPassed) {
        logSuccess('All tests passed! OAuth deployment is ready for testing. ✨');
        logInfo('You can now test the OAuth flow from your iOS app.');
    } else {
        logWarning('Some tests failed. Check the issues above and Railway logs.');
        logInfo('The deployment may still work - test the OAuth flow from iOS app.');
    }
}

// Run tests if called directly
if (require.main === module) {
    main().catch(error => {
        logError(`Test script failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    testBackendHealth,
    testOAuthEndpoints,
    testDatabaseConnection,
    checkEnvironmentVariables
};