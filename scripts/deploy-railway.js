#!/usr/bin/env node

/**
 * Railway Deployment Script
 * This script handles deploying the VoiceAssistant backend to Railway
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Railway deployment...');

// Check if railway CLI is installed
try {
    execSync('railway --version', { stdio: 'pipe' });
    console.log('✅ Railway CLI is installed');
} catch (error) {
    console.error('❌ Railway CLI is not installed. Please install it first:');
    console.error('   npm install -g @railway/cli');
    process.exit(1);
}

// Check if we're in the right directory
const packageJsonPath = path.join(__dirname, '..', 'package.json');
if (!fs.existsSync(packageJsonPath)) {
    console.error('❌ Package.json not found. Are you in the right directory?');
    process.exit(1);
}

try {
    // Link to Railway project if not already linked
    console.log('🔗 Linking to Railway project...');
    try {
        execSync('railway status', { stdio: 'pipe' });
        console.log('✅ Already linked to Railway project');
    } catch (error) {
        console.log('⚠️  Not linked to Railway project, please link manually:');
        console.log('   railway link');
        process.exit(1);
    }

    // Set environment variables
    console.log('⚙️  Setting environment variables...');
    const envVars = {
        NODE_ENV: 'production',
        SKIP_MIGRATIONS: 'false'
    };

    for (const [key, value] of Object.entries(envVars)) {
        try {
            execSync(`railway variables set ${key}="${value}"`, { stdio: 'pipe' });
            console.log(`✅ Set ${key}=${value}`);
        } catch (error) {
            console.log(`⚠️  Failed to set ${key}, continuing...`);
        }
    }

    // Deploy to Railway
    console.log('🚀 Deploying to Railway...');
    execSync('railway up --detach', { stdio: 'inherit' });
    console.log('✅ Deployment initiated');

    // Wait a bit and check status
    console.log('⏱️  Waiting for deployment to complete...');
    setTimeout(() => {
        try {
            execSync('railway status', { stdio: 'inherit' });
        } catch (error) {
            console.log('⚠️  Status check failed, but deployment may still be in progress');
        }
    }, 5000);

    console.log('🎉 Railway deployment completed!');
    console.log('Check your Railway dashboard for deployment status.');

} catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
}