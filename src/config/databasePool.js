const { Pool } = require('pg');
const logger = require('../utils/logger');

// Get database URL from environment or GCP configuration
const getDatabaseUrl = () => {
  // First check for direct DATABASE_URL
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Check for individual PostgreSQL connection parameters
  if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME) {
    const { DB_HOST, DB_PORT = '5432', DB_USER, DB_PASSWORD, DB_NAME } = process.env;
    return `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
  }

  // Try to get from GCP configuration if available
  try {
    const { getDatabaseUrl: getGcpDatabaseUrl } = require('./gcp');
    return getGcpDatabaseUrl();
  } catch (error) {
    logger.warn('GCP configuration not available:', error.message);
  }

  return null;
};

// Create PostgreSQL connection pool
const createPool = () => {
  const databaseUrl = getDatabaseUrl();
  
  if (!databaseUrl) {
    logger.warn('No database configuration found');
    return null;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait when connecting a new client
  });

  // Handle pool errors
  pool.on('error', (err, client) => {
    logger.error('Unexpected error on idle client', err);
  });

  // Test the connection
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      logger.error('Database connection test failed:', err);
    } else {
      logger.info('Database connection successful:', res.rows[0].now);
    }
  });

  return pool;
};

// Create and export the pool
const pool = createPool();

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (pool) {
    logger.info('Closing database pool...');
    await pool.end();
  }
});

module.exports = pool;