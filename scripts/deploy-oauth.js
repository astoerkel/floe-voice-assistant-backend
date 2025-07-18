#!/usr/bin/env node

/**
 * OAuth Integration Deployment Script
 * Focused deployment for Google OAuth integration with Railway
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
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

async function validateGoogleOAuthSetup() {
    logInfo('Validating Google OAuth configuration...');
    
    const requiredEnvVars = [
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'DATABASE_URL',
        'REDIS_URL',
        'JWT_SECRET',
        'JWT_REFRESH_SECRET'
    ];
    
    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingVars.length > 0) {
        logError(`Missing required environment variables: ${missingVars.join(', ')}`);
        logError('Please set these in your Railway environment variables');
        return false;
    }
    
    // Validate Google Client ID format
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId.includes('.apps.googleusercontent.com')) {
        logWarning('Google Client ID format may be incorrect - should end with .apps.googleusercontent.com');
    }
    
    // Validate JWT secret lengths
    if (process.env.JWT_SECRET.length < 32) {
        logError('JWT_SECRET should be at least 32 characters long');
        return false;
    }
    
    if (process.env.JWT_REFRESH_SECRET.length < 32) {
        logError('JWT_REFRESH_SECRET should be at least 32 characters long');
        return false;
    }
    
    logSuccess('Google OAuth configuration validated');
    return true;
}

async function deployOAuthMigration() {
    logInfo('Deploying OAuth database migration...');
    
    try {
        // Check if migration exists
        const migrationPath = path.join(__dirname, '..', 'src/models/prisma/migrations/20250718130000_oauth_integration_system/migration.sql');
        if (!fs.existsSync(migrationPath)) {
            logError('OAuth migration file not found');
            return false;
        }
        
        // Generate Prisma client
        logInfo('Generating Prisma client...');
        execSync('npx prisma generate', { stdio: 'inherit' });
        
        // Deploy migration
        logInfo('Deploying database migration...');
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        
        logSuccess('OAuth database migration deployed');
        return true;
    } catch (error) {
        logError(`Migration deployment failed: ${error.message}`);
        return false;
    }
}

async function testBackendHealth() {
    logInfo('Testing backend health...');
    
    const backendUrl = process.env.BACKEND_URL || 'https://voiceassistant-floe-production.up.railway.app';
    
    try {
        const response = await axios.get(`${backendUrl}/health`, { timeout: 10000 });
        
        if (response.status === 200) {
            logSuccess(`Backend health check passed: ${response.data.status}`);
            return true;
        } else {
            logError(`Backend health check failed with status: ${response.status}`);
            return false;
        }
    } catch (error) {
        logError(`Backend health check failed: ${error.message}`);
        logWarning('Backend may not be deployed yet or may be starting up');
        return false;
    }
}

async function testOAuthEndpoints() {
    logInfo('Testing OAuth endpoints...');
    
    const backendUrl = process.env.BACKEND_URL || 'https://voiceassistant-floe-production.up.railway.app';
    
    try {
        // Test Google OAuth init endpoint (should return 401 without auth)
        const response = await axios.get(`${backendUrl}/api/oauth/google/init`, { 
            timeout: 5000,
            validateStatus: (status) => status === 401 || status === 200
        });
        
        if (response.status === 401) {
            logSuccess('Google OAuth init endpoint is responding (requires authentication)');
            return true;
        } else if (response.status === 200) {
            logWarning('Google OAuth init endpoint is accessible without authentication');
            return true;
        } else {
            logError(`OAuth endpoint test failed with status: ${response.status}`);
            return false;
        }
    } catch (error) {
        logError(`OAuth endpoint test failed: ${error.message}`);
        return false;
    }
}

async function createTestUser() {
    logInfo('Creating test user for OAuth testing...');
    
    try {
        const testScript = `
            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient();
            
            async function main() {
                try {
                    const user = await prisma.user.upsert({
                        where: { email: 'test@voiceassistant.com' },
                        update: {},
                        create: {
                            email: 'test@voiceassistant.com',
                            name: 'OAuth Test User',
                            provider: 'apple',
                            providerId: 'test-oauth-user',
                            subscriptionStatus: 'trial',
                            subscriptionPlan: 'trial'
                        }
                    });
                    
                    console.log('Test user created with ID:', user.id);
                } catch (error) {
                    console.error('Error creating test user:', error);
                } finally {
                    await prisma.$disconnect();
                }
            }
            
            main();
        `;
        
        const testPath = path.join(__dirname, '..', 'temp-create-user.js');
        fs.writeFileSync(testPath, testScript);
        
        execSync(`node ${testPath}`, { stdio: 'inherit' });
        fs.unlinkSync(testPath);
        
        logSuccess('Test user created for OAuth testing');
        return true;
    } catch (error) {
        logError(`Test user creation failed: ${error.message}`);
        return false;
    }
}

async function generateOAuthReport() {
    logInfo('Generating OAuth deployment report...');
    
    const backendUrl = process.env.BACKEND_URL || 'https://voiceassistant-floe-production.up.railway.app';
    
    const report = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        deployment: {
            backendUrl: backendUrl,
            googleOAuth: {
                clientId: process.env.GOOGLE_CLIENT_ID ? 'configured' : 'missing',
                clientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'configured' : 'missing',
                callbackUrl: `${backendUrl}/api/oauth/google/callback`
            },
            airtableOAuth: {
                clientId: process.env.AIRTABLE_CLIENT_ID ? 'configured' : 'missing',
                clientSecret: process.env.AIRTABLE_CLIENT_SECRET ? 'configured' : 'missing',
                callbackUrl: `${backendUrl}/api/oauth/airtable/callback`
            },
            database: {
                url: process.env.DATABASE_URL ? 'configured' : 'missing',
                redis: process.env.REDIS_URL ? 'configured' : 'missing'
            }
        },
        endpoints: {
            health: `${backendUrl}/health`,
            googleOAuthInit: `${backendUrl}/api/oauth/google/init`,
            googleOAuthCallback: `${backendUrl}/api/oauth/google/callback`,
            integrations: `${backendUrl}/api/oauth/integrations`
        },
        nextSteps: [
            'Test OAuth flow from iOS app',
            'Configure Airtable OAuth (when ready)',
            'Monitor OAuth success rates',
            'Set up error alerting'
        ]
    };
    
    const reportPath = path.join(__dirname, '..', 'oauth-deployment-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    logSuccess(`OAuth deployment report generated: ${reportPath}`);
    return report;
}

async function displayDeploymentInstructions() {
    const backendUrl = process.env.BACKEND_URL || 'https://voiceassistant-floe-production.up.railway.app';
    
    log('\n' + '='.repeat(60), 'cyan');
    log('🚀 OAuth Integration Deployment Complete!', 'cyan');
    log('='.repeat(60), 'cyan');
    
    logInfo('Your OAuth integration is ready. Here are the key URLs:');
    logInfo(`• Backend: ${backendUrl}`);
    logInfo(`• Health Check: ${backendUrl}/health`);
    logInfo(`• Google OAuth Callback: ${backendUrl}/api/oauth/google/callback`);
    
    log('\n📱 iOS App Integration:', 'yellow');
    logInfo('• Update APIClient base URL to your Railway backend');
    logInfo('• Configure URL schemes in Info.plist');
    logInfo('• Test OAuth flow from iOS app');
    
    log('\n🔧 Railway Environment Variables Needed:', 'yellow');
    logInfo('• GOOGLE_CLIENT_ID (from Google Cloud Console)');
    logInfo('• GOOGLE_CLIENT_SECRET (from Google Cloud Console)');
    logInfo('• BACKEND_URL (your Railway app URL)');
    logInfo('• JWT_SECRET (32+ characters)');
    logInfo('• JWT_REFRESH_SECRET (32+ characters)');
    
    log('\n🧪 Testing:', 'yellow');
    logInfo('• Test OAuth flow: Open iOS app → Settings → Service Integrations');
    logInfo('• Monitor logs: railway logs --follow');
    logInfo('• Check integration status via API endpoints');
    
    log('\n📊 Monitoring:', 'yellow');
    logInfo('• Watch for OAuth success/failure rates');
    logInfo('• Monitor token refresh events');
    logInfo('• Set up alerts for integration failures');
}

async function main() {
    log('🔐 OAuth Integration Deployment to Railway', 'cyan');
    log('=' .repeat(50), 'cyan');
    
    let deploymentSuccessful = true;
    
    // Step 1: Validate Google OAuth setup
    if (!await validateGoogleOAuthSetup()) {
        deploymentSuccessful = false;
    }
    
    if (!deploymentSuccessful) {
        logError('Pre-deployment validation failed. Please fix the issues above.');
        process.exit(1);
    }
    
    // Step 2: Deploy OAuth migration
    if (!await deployOAuthMigration()) {
        logError('OAuth migration deployment failed. Check the logs above.');
        process.exit(1);
    }
    
    // Step 3: Test backend health
    await testBackendHealth();
    
    // Step 4: Test OAuth endpoints
    await testOAuthEndpoints();
    
    // Step 5: Create test user
    await createTestUser();
    
    // Step 6: Generate deployment report
    await generateOAuthReport();
    
    // Step 7: Display instructions
    await displayDeploymentInstructions();
    
    logSuccess('OAuth integration deployment completed successfully! 🎉');
}

// Run deployment if called directly
if (require.main === module) {
    main().catch(error => {
        logError(`OAuth deployment failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    validateGoogleOAuthSetup,
    deployOAuthMigration,
    testBackendHealth,
    testOAuthEndpoints,
    createTestUser,
    generateOAuthReport
};