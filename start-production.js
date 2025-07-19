#!/usr/bin/env node

// Production startup script with comprehensive error handling
console.log('=== PRODUCTION STARTUP ===');
console.log('Starting Voice Assistant Backend...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT || 8080);

// Check critical environment variables
const requiredEnvVars = {
  // Only check truly critical vars for startup
  PORT: process.env.PORT || '8080',
  NODE_ENV: process.env.NODE_ENV || 'production',
  API_KEY_ENV: process.env.API_KEY_ENV || process.env.API_KEY
};

// Optional but important env vars
const optionalEnvVars = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET || 'default-jwt-secret-' + Date.now()
};

// Log configuration status
console.log('\n=== Configuration Status ===');
Object.entries(requiredEnvVars).forEach(([key, value]) => {
  console.log(`${key}: ${value ? '✅ Set' : '❌ Missing'}`);
});

console.log('\n=== Optional Services ===');
Object.entries(optionalEnvVars).forEach(([key, value]) => {
  console.log(`${key}: ${value ? '✅ Set' : '⚠️  Not configured'}`);
});

// Set defaults for missing optional vars
Object.entries(optionalEnvVars).forEach(([key, value]) => {
  if (value && !process.env[key]) {
    process.env[key] = value;
  }
});

// Create necessary directories
const fs = require('fs');
const path = require('path');

const dataDir = '/app/data';
const audioDir = path.join(dataDir, 'audio');

try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✅ Created data directory');
  }
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
    console.log('✅ Created audio directory');
  }
} catch (error) {
  console.warn('⚠️  Could not create directories:', error.message);
  // Continue anyway - not critical
}

// Start the application with error handling
try {
  console.log('\n=== Starting Application ===');
  require('./src/app.js');
} catch (error) {
  console.error('❌ Failed to start application:', error);
  console.error('Stack trace:', error.stack);
  
  // Start minimal server as fallback
  console.log('\n=== Starting Minimal Fallback Server ===');
  try {
    require('./minimal-server.js');
  } catch (fallbackError) {
    console.error('❌ Fallback server also failed:', fallbackError);
    process.exit(1);
  }
}