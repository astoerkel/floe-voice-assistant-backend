const logger = require('../../../utils/logger');

/**
 * Factory for creating Google service integrations with appropriate database configuration
 */
class GoogleIntegrationFactory {
  static createGmailService() {
    try {
      // Try to load Prisma version first
      require('../../../config/database').prisma;
      const GmailIntegration = require('./gmail');
      logger.info('Using Prisma-based Gmail integration');
      return new GmailIntegration();
    } catch (error) {
      // Fallback to production version
      logger.info('Using production Gmail integration (PostgreSQL direct)');
      const GmailIntegrationProduction = require('./gmail.production');
      return new GmailIntegrationProduction();
    }
  }

  static createCalendarService() {
    try {
      // Try to load Prisma version first
      require('../../../config/database').prisma;
      const GoogleCalendarIntegration = require('./calendar');
      logger.info('Using Prisma-based Calendar integration');
      return new GoogleCalendarIntegration();
    } catch (error) {
      // Fallback to production version
      logger.info('Using production Calendar integration (PostgreSQL direct)');
      const GoogleCalendarIntegrationProduction = require('./calendar.production');
      return new GoogleCalendarIntegrationProduction();
    }
  }
}

module.exports = GoogleIntegrationFactory;