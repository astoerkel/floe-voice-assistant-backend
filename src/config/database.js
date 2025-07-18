const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const { getDatabaseUrl } = require('./gcp');

// Get the appropriate database URL based on environment
const databaseUrl = getDatabaseUrl();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
  log: process.env.NODE_ENV === 'development' ? 
    [{ level: 'query', emit: 'event' }] : 
    [{ level: 'error', emit: 'event' }],
});

// Event handlers for logging
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug(`Query: ${e.query} - Params: ${e.params} - Duration: ${e.duration}ms`);
  });
}

prisma.$on('error', (e) => {
  logger.error('Database error:', e);
});

const connectDatabase = async () => {
  if (!databaseUrl) {
    logger.warn('DATABASE_URL not found, skipping database connection');
    return;
  }
  
  let retries = 5;
  while (retries > 0) {
    try {
      await prisma.$connect();
      logger.info('Connected to PostgreSQL database');
      logger.info(`Database connection: ${databaseUrl.replace(/:[^:@]*@/, ':***@')}`);
      return;
    } catch (error) {
      logger.error(`Failed to connect to database (${retries} retries left):`, error.message);
      retries--;
      if (retries > 0) {
        logger.info('Retrying database connection in 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  
  logger.error('Failed to connect to database after all retries');
  if (process.env.NODE_ENV === 'production') {
    logger.error('Continuing without database connection...');
    // Don't exit - let the health check fail if needed
  }
};

const disconnectDatabase = async () => {
  try {
    await prisma.$disconnect();
    logger.info('Disconnected from database');
  } catch (error) {
    logger.error('Error disconnecting from database:', error);
  }
};

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase
};