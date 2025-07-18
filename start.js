#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('Starting Voice Assistant Backend...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT || 8080);

// Log Redis configuration for debugging
console.log('Redis Configuration:');
console.log('- REDIS_URL:', process.env.REDIS_URL ? 'Set (hidden)' : 'Not set');
console.log('- REDIS_HOST:', process.env.REDIS_HOST || 'Not set');
console.log('- REDIS_PORT:', process.env.REDIS_PORT || 'Not set');

// Run database migrations
try {
  console.log('Running database migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('Database migrations completed successfully');
} catch (error) {
  console.error('Database migration failed:', error.message);
  console.log('Continuing with startup despite migration failure...');
  // Don't exit on migration failure - the database might already be migrated
}

// Start the application
try {
  console.log('Starting application server...');
  require('./src/app.js');
} catch (error) {
  console.error('Failed to start application:', error);
  process.exit(1);
}