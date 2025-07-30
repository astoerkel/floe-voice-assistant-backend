#!/usr/bin/env node

// JWT Authentication Debug Script
// Run this on the server to diagnose JWT issues

require('dotenv').config();
const jwt = require('jsonwebtoken');

console.log('=== JWT AUTHENTICATION DIAGNOSTICS ===');
console.log('Timestamp:', new Date().toISOString());
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log();

// 1. Check Environment Variables
console.log('1. ENVIRONMENT VARIABLES CHECK:');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? `Set (${process.env.JWT_SECRET.length} chars)` : 'NOT SET');
console.log('JWT_REFRESH_SECRET:', process.env.JWT_REFRESH_SECRET ? `Set (${process.env.JWT_REFRESH_SECRET.length} chars)` : 'NOT SET');
console.log('JWT_EXPIRATION:', process.env.JWT_EXPIRATION || 'NOT SET (using default 15m)');
console.log('REFRESH_TOKEN_EXPIRATION:', process.env.REFRESH_TOKEN_EXPIRATION || 'NOT SET (using default 7d)');
console.log();

// 2. Test JWT Service Initialization
console.log('2. JWT SERVICE INITIALIZATION:');
try {
  const jwtService = require('./src/services/auth/jwt');
  console.log('✅ JWT Service loaded successfully');
  
  // Test token generation
  const testUserId = 'test-user-123';
  console.log('Generating test tokens for user:', testUserId);
  
  const tokens = jwtService.generateTokens(testUserId);
  console.log('✅ Token generation successful');
  console.log('Access Token length:', tokens.accessToken.length);
  console.log('Refresh Token length:', tokens.refreshToken.length);
  
  // Test token verification
  console.log();
  console.log('3. TOKEN VERIFICATION TEST:');
  
  try {
    const decoded = jwtService.verifyAccessToken(tokens.accessToken);
    console.log('✅ Access token verification successful');
    console.log('Decoded payload:', JSON.stringify(decoded, null, 2));
  } catch (verifyError) {
    console.log('❌ Access token verification failed:', verifyError.message);
  }
  
  try {
    const decodedRefresh = jwtService.verifyRefreshToken(tokens.refreshToken);
    console.log('✅ Refresh token verification successful');
    console.log('Decoded refresh payload:', JSON.stringify(decodedRefresh, null, 2));
  } catch (verifyError) {
    console.log('❌ Refresh token verification failed:', verifyError.message);
  }
  
} catch (initError) {
  console.log('❌ JWT Service initialization failed:', initError.message);
  console.log('Stack:', initError.stack);
}

console.log();

// 3. Test Database Connection
console.log('4. DATABASE CONNECTION TEST:');
try {
  const { prisma } = require('./src/config/database');
  
  // Test a simple query
  prisma.user.findMany({ take: 1 })
    .then(() => {
      console.log('✅ Database connection successful');
    })
    .catch(dbError => {
      console.log('❌ Database connection failed:', dbError.message);
    })
    .finally(() => {
      prisma.$disconnect();
    });
    
} catch (dbInitError) {
  console.log('❌ Database initialization failed:', dbInitError.message);
}

// 4. Test Sample JWT Token Parsing
console.log();
console.log('5. SAMPLE TOKEN PARSING TEST:');

// Create a sample token that matches what iOS might send
const samplePayload = {
  userId: 'sample-user-id',
  type: 'access',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (15 * 60), // 15 minutes
  iss: 'voice-assistant-backend',
  sub: 'sample-user-id'
};

if (process.env.JWT_SECRET) {
  try {
    const sampleToken = jwt.sign(samplePayload, process.env.JWT_SECRET);
    console.log('Sample token created:', sampleToken.substring(0, 50) + '...');
    
    // Test parsing the token
    const parsed = jwt.verify(sampleToken, process.env.JWT_SECRET);
    console.log('✅ Sample token parsing successful');
    console.log('Parsed payload:', JSON.stringify(parsed, null, 2));
    
    // Test with Bearer prefix (how iOS sends it)
    const authHeader = `Bearer ${sampleToken}`;
    const extractedToken = authHeader.split(' ')[1];
    console.log('✅ Bearer token extraction successful');
    console.log('Extracted token matches:', extractedToken === sampleToken);
    
  } catch (sampleError) {
    console.log('❌ Sample token test failed:', sampleError.message);
  }
}

console.log();
console.log('6. MIDDLEWARE TEST SIMULATION:');

// Simulate the middleware logic
const mockReq = {
  headers: {
    'authorization': process.env.JWT_SECRET ? `Bearer ${jwt.sign(samplePayload, process.env.JWT_SECRET)}` : undefined
  }
};

console.log('Mock request authorization header:', mockReq.headers.authorization ? 'Present' : 'Missing');

if (mockReq.headers.authorization) {
  const authHeader = mockReq.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  console.log('Token extracted from header:', token ? 'Yes' : 'No');
  
  if (token) {
    try {
      // This is the exact logic from jwtAuth.js
      const jwtService = require('./src/services/auth/jwt');
      const decoded = jwtService.verifyAccessToken(token);
      console.log('✅ Middleware simulation successful');
      console.log('Would proceed to database lookup for userId:', decoded.userId);
    } catch (middlewareError) {
      console.log('❌ Middleware simulation failed:', middlewareError.message);
    }
  }
}

console.log();
console.log('=== DIAGNOSTICS COMPLETE ===');
console.log();
console.log('RECOMMENDATIONS:');
console.log('1. Ensure JWT_SECRET and JWT_REFRESH_SECRET are properly set in production environment');
console.log('2. Verify database connection is working');
console.log('3. Check that iOS app is sending Authorization header as "Bearer <token>"');
console.log('4. Verify user exists in database and isActive = true');
console.log('5. Check server logs for specific error messages during authentication');