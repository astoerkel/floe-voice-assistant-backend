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

// Skip database migrations for now - let app handle database connection gracefully
console.log('Skipping database migrations - app will handle DB connection gracefully');

// Start the application
try {
  console.log('Starting application server...');
  require('./src/app.js');
} catch (error) {
  console.error('Failed to start application:', error);
  console.error('Stack trace:', error.stack);
  // Don't exit immediately - let Cloud Run see the error
  setTimeout(() => {
    console.error('Exiting due to startup failure');
    process.exit(1);
  }, 5000);
}