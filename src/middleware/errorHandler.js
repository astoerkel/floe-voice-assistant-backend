const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(`${err.message} - ${req.method} ${req.path} - ${req.ip}`);
  
  // Log full error in development
  if (process.env.NODE_ENV === 'development') {
    logger.error(err.stack);
  }

  // Default error response
  let error = {
    message: err.message || 'Internal Server Error',
    status: err.status || 500
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    error.status = 400;
    error.message = 'Validation Error';
    error.details = err.details;
  }

  if (err.name === 'UnauthorizedError') {
    error.status = 401;
    error.message = 'Unauthorized';
  }

  if (err.name === 'JsonWebTokenError') {
    error.status = 401;
    error.message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    error.status = 401;
    error.message = 'Token expired';
  }

  if (err.code === 'ECONNREFUSED') {
    error.status = 503;
    error.message = 'Service unavailable';
  }

  // Don't send stack trace in production
  if (process.env.NODE_ENV === 'production') {
    delete error.stack;
  } else {
    error.stack = err.stack;
  }

  res.status(error.status).json({
    error: error.message,
    ...(error.details && { details: error.details }),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

module.exports = errorHandler;