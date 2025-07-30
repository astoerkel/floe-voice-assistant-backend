const logger = require('../utils/logger');

const { Pool } = require('pg');

// Create a dedicated pool for auth middleware
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://voiceapp:securepassword123@localhost:5432/voiceappdb',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test the connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    logger.error('Production auth middleware: Database connection failed', err);
  } else {
    logger.info('Production auth middleware: Database connected', res.rows[0].now);
  }
});

// Get JWT service based on environment
const getJWTService = () => {
  if (process.env.NODE_ENV === 'production') {
    return require('../services/auth/jwt.production');
  } else {
    return require('../services/auth/jwt');
  }
};

const jwtService = getJWTService();

// Middleware to authenticate the request using JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      logger.error('No Authorization header found', { path: req.path });
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'JWT token required in Authorization header'
      });
    }

    // Reject mock tokens in production
    if (process.env.NODE_ENV === 'production' && 
        (token === 'mock_access_token_for_development' || token.startsWith('mock_'))) {
      logger.warn('SECURITY: Mock token rejected in production environment', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Mock tokens are not allowed in production'
      });
    }

    let decoded;
    try {
      decoded = jwtService.verifyAccessToken(token);
      logger.info('Production optionalAuth: Token verified successfully', { userId: decoded.userId });
    } catch (verifyError) {
      logger.warn('Production optionalAuth: Token verification failed', { 
        error: verifyError.message,
        errorName: verifyError.name 
      });
      throw verifyError;
    }
    
    // Fetch user from database
    const result = await pool.query(
      'SELECT id, email, name, last_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    logger.info('Production optionalAuth: Database query result', { 
      rowCount: result.rows.length,
      userId: decoded.userId 
    });

    if (result.rows.length === 0) {
      logger.error('User not found for token', { userId: decoded.userId });
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    // Convert snake_case to camelCase for compatibility
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      lastActive: user.last_active
    };

    // Update last active time
    await pool.query(
      'UPDATE users SET last_active = NOW() WHERE id = $1',
      [user.id]
    );

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'The provided token is invalid.'
      });
    }
    
    return res.status(401).json({ 
      error: 'Authentication failed',
      message: 'Failed to authenticate request'
    });
  }
};

// Optional authentication middleware - doesn't fail if no token present
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    logger.info('Production optionalAuth: Authorization header:', authHeader ? 'present' : 'absent');
    
    if (!token) {
      logger.info('Production optionalAuth: No token found');
      req.user = null;
      return next();
    }
    
    logger.info('Production optionalAuth: Token found, verifying...');
    
    // Reject mock tokens in production
    if (process.env.NODE_ENV === 'production' && 
        (token === 'mock_access_token_for_development' || token.startsWith('mock_'))) {
      logger.warn('SECURITY: Mock token rejected in production environment (optional auth)', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      req.user = null;
      return next();
    }
    
    let decoded;
    try {
      decoded = jwtService.verifyAccessToken(token);
      logger.info('Production optionalAuth: Token verified successfully', { userId: decoded.userId });
    } catch (verifyError) {
      logger.warn('Production optionalAuth: Token verification failed', { 
        error: verifyError.message,
        errorName: verifyError.name 
      });
      throw verifyError;
    }
    
    // Fetch user from database
    const result = await pool.query(
      'SELECT id, email, name, last_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    logger.info('Production optionalAuth: Database query result', { 
      rowCount: result.rows.length,
      userId: decoded.userId 
    });
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      
      logger.info('Production optionalAuth: User found and active', { 
        userId: user.id,
        email: user.email 
      });
      
      // Convert snake_case to camelCase for compatibility
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        lastActive: user.last_active
      };
      
      logger.info('Production optionalAuth: req.user set', { 
        reqUserId: req.user.id 
      });
      
      // Update last active time
      await pool.query(
        'UPDATE users SET last_active = NOW() WHERE id = $1',
        [user.id]
      );
    } else {
      logger.info('Production optionalAuth: User not found or inactive', { 
        rowCount: result.rows.length,
        isActive: 'N/A' 
      });
      req.user = null;
    }
    
    next();
  } catch (error) {
    logger.error('Production optionalAuth error:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  optionalAuth
};