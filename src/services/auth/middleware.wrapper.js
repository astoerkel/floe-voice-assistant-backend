// Wrapper to use appropriate middleware based on environment
const logger = require('../../utils/logger');

logger.info(`Auth middleware wrapper loading for NODE_ENV: ${process.env.NODE_ENV}`);

if (process.env.NODE_ENV === 'production') {
  logger.info('Production environment detected - using production auth middleware');
  module.exports = require('../../middleware/auth.production');
} else {
  logger.info('Development environment detected - using development auth middleware');
  module.exports = require('./middleware');
}