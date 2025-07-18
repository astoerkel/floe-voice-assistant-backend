#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('Starting Voice Assistant Backend (Simple Mode)...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT || 3000);

// Skip migrations if they're causing issues
const skipMigrations = process.env.SKIP_MIGRATIONS === 'true';

if (!skipMigrations) {
    // Only run essential migration commands with timeout
    try {
        console.log('Generating Prisma client...');
        execSync('npx prisma generate', { 
            stdio: 'inherit',
            timeout: 30000 // 30 second timeout
        });
        console.log('✅ Prisma client generated successfully');
    } catch (error) {
        console.log('⚠️  Prisma client generation failed, continuing...');
    }

    try {
        console.log('Checking database connection...');
        execSync('npx prisma db pull --print', { 
            stdio: 'pipe',
            timeout: 10000 // 10 second timeout
        });
        console.log('✅ Database connection verified');
    } catch (error) {
        console.log('⚠️  Database connection check failed, continuing...');
    }
} else {
    console.log('⚠️  Skipping all migrations (SKIP_MIGRATIONS=true)');
}

// Start the application
try {
    console.log('Starting application server...');
    require('./src/app.js');
} catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
}