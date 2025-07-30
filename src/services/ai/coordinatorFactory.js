const logger = require('../../utils/logger');
const EnhancedLangChainCoordinator = require('./enhancedCoordinatorProduction');

/**
 * Factory for creating the enhanced coordinator with appropriate database configuration
 */
class CoordinatorFactory {
  static async createCoordinator() {
    let dbConfig = null;

    try {
      // First, try to load Prisma (development setup)
      const { prisma } = require('../../config/database');
      dbConfig = { prisma };
      logger.info('Using Prisma database configuration');
    } catch (error) {
      logger.info('Prisma not available, looking for PostgreSQL pool configuration');
      
      // Try to load production database configuration
      try {
        // Check for production database path
        const productionDbPath = '/opt/simple-voice-backend/src/config/database.js';
        const fs = require('fs');
        
        if (fs.existsSync(productionDbPath)) {
          const pool = require(productionDbPath);
          dbConfig = { pool };
          logger.info('Using production PostgreSQL pool configuration');
        } else {
          // Try local database configuration
          const localPool = require('../../config/databasePool');
          dbConfig = { pool: localPool };
          logger.info('Using local PostgreSQL pool configuration');
        }
      } catch (poolError) {
        logger.warn('No database configuration found, coordinator will run without database');
        dbConfig = null;
      }
    }

    // Create and return the coordinator
    return new EnhancedLangChainCoordinator(dbConfig);
  }

  /**
   * Create coordinator with explicit database configuration
   */
  static createCoordinatorWithDb(dbConfig) {
    return new EnhancedLangChainCoordinator(dbConfig);
  }
}

module.exports = CoordinatorFactory;