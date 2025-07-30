const logger = require('../utils/logger');

class OAuthControllerFactory {
    static createController() {
        // Always use direct database controller in production to avoid Prisma
        if (process.env.NODE_ENV === 'production') {
            logger.info('Production: Using direct database OAuth controller (PostgreSQL only)');
            return require('./oauth.controller.direct');
        }
        
        try {
            // Check if Prisma is available in development
            require('../config/database').prisma;
            logger.info('Development: Using OAuth controller with Prisma support');
            const OAuthController = require('./oauth.controller');
            return OAuthController;
        } catch (error) {
            // Prisma not available, use direct database version
            logger.info('Using direct database OAuth controller (PostgreSQL only)');
            return require('./oauth.controller.direct');
        }
    }
}

module.exports = OAuthControllerFactory;