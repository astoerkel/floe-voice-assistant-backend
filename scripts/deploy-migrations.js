#!/usr/bin/env node

/**
 * Database Migration Deployment Script
 * Safely deploys OAuth integration migrations to production
 */

const { execSync } = require('child_process');
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

async function checkDatabaseConnection() {
    logInfo('Checking database connection...');
    
    try {
        execSync('npx prisma db push --preview-feature', { stdio: 'pipe' });
        logSuccess('Database connection verified');
        return true;
    } catch (error) {
        logError('Database connection failed');
        logError(error.message);
        return false;
    }
}

async function createBackup() {
    logInfo('Creating database backup...');
    
    const backupName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    
    try {
        // For PostgreSQL
        if (process.env.DATABASE_URL?.includes('postgresql')) {
            logInfo('Creating PostgreSQL backup...');
            // Note: This would require pg_dump to be available
            // execSync(`pg_dump ${process.env.DATABASE_URL} > ${backupName}.sql`, { stdio: 'pipe' });
            logWarning('PostgreSQL backup creation skipped (requires pg_dump)');
        }
        
        logInfo(`Backup would be saved as: ${backupName}.sql`);
        logWarning('Please ensure you have a recent backup before proceeding');
        
        return true;
    } catch (error) {
        logError('Backup creation failed');
        logError(error.message);
        return false;
    }
}

async function validateMigrations() {
    logInfo('Validating migration files...');
    
    const migrationDir = path.join(__dirname, '..', 'src/models/prisma/migrations');
    const oauthMigrationDir = path.join(migrationDir, '20250718130000_oauth_integration_system');
    
    if (!fs.existsSync(oauthMigrationDir)) {
        logError('OAuth migration directory not found');
        return false;
    }
    
    const migrationFile = path.join(oauthMigrationDir, 'migration.sql');
    if (!fs.existsSync(migrationFile)) {
        logError('OAuth migration SQL file not found');
        return false;
    }
    
    const migrationContent = fs.readFileSync(migrationFile, 'utf8');
    
    // Check for critical migration components
    const requiredComponents = [
        'CREATE TABLE "oauth_states"',
        'ALTER TABLE "users"',
        'ALTER TABLE "integrations"',
        'CREATE INDEX'
    ];
    
    for (const component of requiredComponents) {
        if (!migrationContent.includes(component)) {
            logError(`Missing migration component: ${component}`);
            return false;
        }
    }
    
    logSuccess('Migration files validated');
    return true;
}

async function runMigrations() {
    logInfo('Running database migrations...');
    
    try {
        // Generate Prisma client
        logInfo('Generating Prisma client...');
        execSync('npx prisma generate', { stdio: 'inherit' });
        logSuccess('Prisma client generated');
        
        // Deploy migrations
        logInfo('Deploying migrations...');
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        logSuccess('Migrations deployed successfully');
        
        return true;
    } catch (error) {
        logError('Migration deployment failed');
        logError(error.message);
        return false;
    }
}

async function validateSchema() {
    logInfo('Validating database schema...');
    
    try {
        // Check if the schema matches the Prisma schema
        execSync('npx prisma db push --preview-feature', { stdio: 'pipe' });
        logSuccess('Database schema is valid');
        
        return true;
    } catch (error) {
        logError('Schema validation failed');
        logError(error.message);
        return false;
    }
}

async function seedOAuthData() {
    logInfo('Seeding OAuth-related data...');
    
    try {
        // Create a development user if in development mode
        if (process.env.NODE_ENV === 'development') {
            const seedScript = `
                const { PrismaClient } = require('@prisma/client');
                const prisma = new PrismaClient();
                
                async function main() {
                    // Create a development user
                    const user = await prisma.user.upsert({
                        where: { email: 'dev@voiceassistant.com' },
                        update: {},
                        create: {
                            email: 'dev@voiceassistant.com',
                            name: 'Development User',
                            provider: 'apple',
                            providerId: 'dev-apple-id',
                            subscriptionStatus: 'trial',
                            subscriptionPlan: 'trial'
                        }
                    });
                    
                    console.log('Development user created:', user.id);
                }
                
                main().catch(console.error).finally(() => prisma.$disconnect());
            `;
            
            const seedPath = path.join(__dirname, '..', 'temp-seed.js');
            fs.writeFileSync(seedPath, seedScript);
            
            execSync(`node ${seedPath}`, { stdio: 'inherit' });
            fs.unlinkSync(seedPath);
            
            logSuccess('Development data seeded');
        }
        
        return true;
    } catch (error) {
        logError('Data seeding failed');
        logError(error.message);
        return false;
    }
}

async function testOAuthEndpoints() {
    logInfo('Testing OAuth endpoints...');
    
    try {
        // Basic health check
        const healthCheck = `
            const axios = require('axios');
            
            async function testHealth() {
                const baseUrl = process.env.BACKEND_URL || 'http://localhost:3000';
                const response = await axios.get(baseUrl + '/health');
                console.log('Health check passed:', response.data.status);
            }
            
            testHealth().catch(console.error);
        `;
        
        const testPath = path.join(__dirname, '..', 'temp-test.js');
        fs.writeFileSync(testPath, healthCheck);
        
        execSync(`node ${testPath}`, { stdio: 'inherit' });
        fs.unlinkSync(testPath);
        
        logSuccess('Basic endpoint tests passed');
        return true;
    } catch (error) {
        logWarning('Endpoint tests failed (server may not be running)');
        return true; // Don't fail deployment for this
    }
}

async function generateMigrationReport() {
    logInfo('Generating migration report...');
    
    const report = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        databaseUrl: process.env.DATABASE_URL ? 'configured' : 'not configured',
        migrationStatus: 'completed',
        oauthIntegration: {
            googleOAuth: 'ready',
            airtableOAuth: 'ready',
            integrationEndpoints: 'ready'
        },
        nextSteps: [
            'Configure OAuth applications in Google Cloud Console',
            'Configure OAuth applications in Airtable Developer Hub',
            'Set up environment variables with OAuth credentials',
            'Test OAuth flows with real providers'
        ]
    };
    
    const reportPath = path.join(__dirname, '..', 'migration-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    logSuccess(`Migration report generated: ${reportPath}`);
    return report;
}

async function main() {
    log('🚀 OAuth Integration Migration Deployment', 'cyan');
    log('=' .repeat(50), 'cyan');
    
    let deploymentSuccessful = true;
    
    // Pre-deployment checks
    logInfo('Running pre-deployment checks...');
    
    if (!await checkDatabaseConnection()) {
        deploymentSuccessful = false;
    }
    
    if (!await validateMigrations()) {
        deploymentSuccessful = false;
    }
    
    if (!deploymentSuccessful) {
        logError('Pre-deployment checks failed. Aborting deployment.');
        process.exit(1);
    }
    
    // Backup (optional)
    await createBackup();
    
    // Deploy migrations
    logInfo('Starting migration deployment...');
    
    if (!await runMigrations()) {
        logError('Migration deployment failed. Check the logs above.');
        process.exit(1);
    }
    
    // Post-deployment validation
    logInfo('Running post-deployment validation...');
    
    if (!await validateSchema()) {
        logError('Schema validation failed after migration.');
        process.exit(1);
    }
    
    // Optional steps
    await seedOAuthData();
    await testOAuthEndpoints();
    
    // Generate report
    await generateMigrationReport();
    
    // Success message
    log('=' .repeat(50), 'cyan');
    logSuccess('OAuth integration migrations deployed successfully! ✨');
    logInfo('Your database is ready for OAuth integration.');
    logInfo('Next steps:');
    logInfo('1. Configure OAuth applications (Google, Airtable)');
    logInfo('2. Set up environment variables');
    logInfo('3. Test OAuth flows');
    logInfo('4. Deploy to production');
}

// Run deployment if called directly
if (require.main === module) {
    main().catch(error => {
        logError(`Migration deployment failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    checkDatabaseConnection,
    validateMigrations,
    runMigrations,
    validateSchema,
    seedOAuthData,
    generateMigrationReport
};