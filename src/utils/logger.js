const winston = require('winston');

// Create transports array based on environment
const transports = [];

// Always use console transport in production (Cloud Run logs stdout/stderr)
if (process.env.NODE_ENV === 'production') {
  transports.push(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )
  }));
} else {
  // Development: use both console and file transports
  transports.push(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
  
  // Only write to files in development
  try {
    transports.push(new winston.transports.File({ filename: 'error.log', level: 'error' }));
    transports.push(new winston.transports.File({ filename: 'combined.log' }));
  } catch (e) {
    console.warn('Could not create file transports:', e.message);
  }
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'voice-assistant-backend' },
  transports: transports
});

module.exports = logger;