#!/usr/bin/env node

/**
 * Deployment Validation Script
 * Validates that all required environment variables and dependencies are properly configured
 * for OAuth integration deployment
 */

const fs = require('fs');
const path = require('path');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
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

// Required environment variables
const requiredEnvVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'AIRTABLE_CLIENT_ID',
    'AIRTABLE_CLIENT_SECRET',
    'BACKEND_URL',
    'OPENAI_API_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS_JSON'
];

// Optional but recommended environment variables
const optionalEnvVars = [
    'FRONTEND_URL',
    'APPLE_CLIENT_ID',
    'APPLE_TEAM_ID',
    'APPLE_KEY_ID',
    'APPLE_PRIVATE_KEY',
    'ANTHROPIC_API_KEY',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX_REQUESTS'
];

// Required files
const requiredFiles = [
    'src/models/prisma/schema.prisma',
    'src/services/oauth/googleOAuth.js',
    'src/services/oauth/airtableOAuth.js',
    'src/controllers/oauth.controller.js',
    'src/routes/oauth.js',
    'src/app.js'
];

// OAuth-specific migrations
const requiredMigrations = [
    'src/models/prisma/migrations/20250718130000_oauth_integration_system/migration.sql'
];

async function validateEnvironmentVariables() {
    logInfo('Validating environment variables...');
    
    const missingRequired = [];
    const missingOptional = [];
    
    // Check required variables
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            missingRequired.push(envVar);
        } else {
            logSuccess(`${envVar} is set`);
        }
    }
    
    // Check optional variables
    for (const envVar of optionalEnvVars) {
        if (!process.env[envVar]) {
            missingOptional.push(envVar);
        } else {
            logSuccess(`${envVar} is set`);
        }
    }
    
    if (missingRequired.length > 0) {
        logError(`Missing required environment variables: ${missingRequired.join(', ')}`);
        return false;
    }
    
    if (missingOptional.length > 0) {
        logWarning(`Missing optional environment variables: ${missingOptional.join(', ')}`);
    }
    
    return true;
}

async function validateFiles() {
    logInfo('Validating required files...');
    
    const missingFiles = [];
    
    for (const file of requiredFiles) {
        const filePath = path.join(__dirname, '..', file);
        if (!fs.existsSync(filePath)) {
            missingFiles.push(file);
        } else {
            logSuccess(`${file} exists`);
        }
    }
    
    if (missingFiles.length > 0) {
        logError(`Missing required files: ${missingFiles.join(', ')}`);
        return false;
    }
    
    return true;
}

async function validateMigrations() {
    logInfo('Validating database migrations...');
    
    const missingMigrations = [];
    
    for (const migration of requiredMigrations) {
        const migrationPath = path.join(__dirname, '..', migration);
        if (!fs.existsSync(migrationPath)) {
            missingMigrations.push(migration);
        } else {
            logSuccess(`${migration} exists`);
        }
    }
    
    if (missingMigrations.length > 0) {
        logError(`Missing required migrations: ${missingMigrations.join(', ')}`);
        return false;
    }
    
    return true;
}

async function validateOAuthConfiguration() {
    logInfo('Validating OAuth configuration...');
    
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const airtableClientId = process.env.AIRTABLE_CLIENT_ID;
    const backendUrl = process.env.BACKEND_URL;
    
    let validationPassed = true;
    
    // Validate Google OAuth configuration
    if (googleClientId && !googleClientId.includes('.apps.googleusercontent.com')) {
        logWarning('Google Client ID format may be incorrect - should end with .apps.googleusercontent.com');
    }
    
    // Validate callback URLs
    if (backendUrl) {
        const expectedGoogleCallback = `${backendUrl}/api/oauth/google/callback`;
        const expectedAirtableCallback = `${backendUrl}/api/oauth/airtable/callback`;
        
        logInfo(`Expected Google OAuth callback URL: ${expectedGoogleCallback}`);
        logInfo(`Expected Airtable OAuth callback URL: ${expectedAirtableCallback}`);
        
        logWarning('Please verify these callback URLs are configured in your OAuth applications');
    }
    
    // Validate JWT secrets
    const jwtSecret = process.env.JWT_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    
    if (jwtSecret && jwtSecret.length < 32) {
        logError('JWT_SECRET should be at least 32 characters long');
        validationPassed = false;
    }
    
    if (jwtRefreshSecret && jwtRefreshSecret.length < 32) {
        logError('JWT_REFRESH_SECRET should be at least 32 characters long');
        validationPassed = false;
    }
    
    return validationPassed;
}

async function validateDependencies() {
    logInfo('Validating dependencies...');
    
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
        logError('package.json not found');
        return false;
    }
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Check for OAuth-specific dependencies
    const oauthDependencies = [
        'googleapis',
        'airtable',
        'apple-signin-auth',
        'jsonwebtoken',
        'axios',
        '@prisma/client',
        'prisma'
    ];
    
    const missingDependencies = [];
    
    for (const dep of oauthDependencies) {
        if (!packageJson.dependencies[dep] && !packageJson.devDependencies[dep]) {
            missingDependencies.push(dep);
        } else {
            logSuccess(`${dep} is installed`);
        }
    }
    
    if (missingDependencies.length > 0) {
        logError(`Missing OAuth dependencies: ${missingDependencies.join(', ')}`);
        return false;
    }
    
    return true;
}

async function validatePrismaSchema() {
    logInfo('Validating Prisma schema...');
    
    const schemaPath = path.join(__dirname, '..', 'src/models/prisma/schema.prisma');
    
    if (!fs.existsSync(schemaPath)) {
        logError('Prisma schema not found');
        return false;
    }
    
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    
    // Check for OAuth-specific models
    const requiredModels = ['Integration', 'OAuthState', 'User'];
    const requiredFields = ['accessToken', 'refreshToken', 'tokenType', 'expiresAt'];
    
    let validationPassed = true;
    
    for (const model of requiredModels) {
        if (!schemaContent.includes(`model ${model}`)) {
            logError(`Missing model: ${model}`);
            validationPassed = false;
        } else {
            logSuccess(`Model ${model} found`);
        }
    }
    
    for (const field of requiredFields) {
        if (!schemaContent.includes(field)) {
            logError(`Missing field: ${field}`);
            validationPassed = false;
        } else {
            logSuccess(`Field ${field} found`);
        }
    }
    
    return validationPassed;
}

async function generateDeploymentReport() {
    logInfo('Generating deployment report...');
    
    const report = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        backendUrl: process.env.BACKEND_URL || 'not set',
        oauthProviders: {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID ? 'configured' : 'not configured',
                clientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'configured' : 'not configured'
            },
            airtable: {
                clientId: process.env.AIRTABLE_CLIENT_ID ? 'configured' : 'not configured',
                clientSecret: process.env.AIRTABLE_CLIENT_SECRET ? 'configured' : 'not configured'
            }
        },
        database: {
            url: process.env.DATABASE_URL ? 'configured' : 'not configured',
            redis: process.env.REDIS_URL ? 'configured' : 'not configured'
        },
        security: {
            jwtSecret: process.env.JWT_SECRET ? 'configured' : 'not configured',
            jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ? 'configured' : 'not configured'
        }
    };
    
    const reportPath = path.join(__dirname, '..', 'deployment-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    logSuccess(`Deployment report generated: ${reportPath}`);
    return report;
}

async function main() {
    log('🚀 OAuth Integration Deployment Validation', 'cyan');
    log('=' .repeat(50), 'cyan');
    
    let allValidationsPassed = true;
    
    // Run all validations
    const validations = [
        { name: 'Environment Variables', fn: validateEnvironmentVariables },
        { name: 'Required Files', fn: validateFiles },
        { name: 'Database Migrations', fn: validateMigrations },
        { name: 'OAuth Configuration', fn: validateOAuthConfiguration },
        { name: 'Dependencies', fn: validateDependencies },
        { name: 'Prisma Schema', fn: validatePrismaSchema }
    ];
    
    for (const validation of validations) {
        try {
            const result = await validation.fn();
            if (!result) {
                allValidationsPassed = false;
            }
        } catch (error) {
            logError(`Error during ${validation.name} validation: ${error.message}`);
            allValidationsPassed = false;
        }
        
        log(''); // Empty line for readability
    }
    
    // Generate deployment report
    await generateDeploymentReport();
    
    // Final result
    log('=' .repeat(50), 'cyan');
    if (allValidationsPassed) {
        logSuccess('All validations passed! ✨');
        logInfo('Your OAuth integration is ready for deployment.');
        logInfo('Next steps:');
        logInfo('1. Deploy to Railway: railway up');
        logInfo('2. Run migrations: npx prisma migrate deploy');
        logInfo('3. Test OAuth flows with real providers');
        process.exit(0);
    } else {
        logError('Some validations failed. Please fix the issues above before deploying.');
        process.exit(1);
    }
}

// Run validation if called directly
if (require.main === module) {
    main().catch(error => {
        logError(`Validation script failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    validateEnvironmentVariables,
    validateFiles,
    validateMigrations,
    validateOAuthConfiguration,
    validateDependencies,
    validatePrismaSchema,
    generateDeploymentReport
};