const Redis = require('ioredis');
const logger = require('../utils/logger');

// DO NOT initialize Redis at module load time
let redis = null;
let isRedisAvailable = false;
let redisConfig = null;

// Mock Redis client for fallback
const mockRedisClient = {
  get: async () => null,
  set: async () => 'OK',
  setex: async () => 'OK',
  del: async () => 1,
  exists: async () => 0,
  expire: async () => 1,
  ttl: async () => -1,
  keys: async () => [],
  flushall: async () => 'OK',
  ping: async () => 'PONG',
  quit: async () => 'OK',
  disconnect: async () => {},
  on: () => {}
};

/**
 * Get Redis configuration - called at connection time, not module load time
 */
function getRedisConfiguration() {
  // Log all Redis-related environment variables for debugging
  logger.info('Redis environment variables:', {
    REDIS_URL: process.env.REDIS_URL ? 'set' : 'not set',
    REDIS_HOST: process.env.REDIS_HOST || 'not set',
    REDIS_PORT: process.env.REDIS_PORT || 'not set',
    NODE_ENV: process.env.NODE_ENV
  });

  // Priority 1: Use REDIS_URL if available
  if (process.env.REDIS_URL) {
    logger.info('Using REDIS_URL from environment variable');
    return { 
      url: process.env.REDIS_URL,
      type: 'url'
    };
  }

  // Priority 2: In production, construct URL from host/port
  if (process.env.NODE_ENV === 'production') {
    const host = process.env.REDIS_HOST || '10.244.122.235';
    const port = process.env.REDIS_PORT || '6379';
    const url = `redis://${host}:${port}`;
    logger.info(`Using production Redis URL: ${url}`);
    return { 
      url,
      type: 'constructed'
    };
  }

  // Priority 3: Development/fallback
  logger.info('Using development Redis configuration');
  return { 
    url: 'redis://localhost:6379',
    type: 'development'
  };
}

const connectRedis = async () => {
  try {
    // Get configuration at connection time, not module load time
    redisConfig = getRedisConfiguration();
    
    logger.info('Attempting Redis connection with config:', {
      type: redisConfig.type,
      url: redisConfig.url
    });

    // Create Redis client with production-ready settings
    redis = new Redis(redisConfig.url, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: 10000,
      family: 4, // Force IPv4
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 100, 3000);
        logger.info(`Retrying Redis connection in ${delay}ms...`);
        return delay;
      }
    });

    // Set up event handlers
    redis.on('connect', () => {
      logger.info('Redis client connected successfully');
      isRedisAvailable = true;
    });

    redis.on('ready', () => {
      logger.info('Redis client ready');
      isRedisAvailable = true;
    });

    redis.on('error', (err) => {
      logger.error('Redis error:', err);
      isRedisAvailable = false;
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
      isRedisAvailable = false;
    });

    // Test the connection
    await redis.ping();
    logger.info('Redis ping successful');
    isRedisAvailable = true;
    
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    
    if (process.env.NODE_ENV === 'production') {
      // In production, this is critical - but let's try one more thing
      logger.error('Redis connection failed in production - attempting fallback to mock client');
      // Don't exit immediately - use mock client to keep service running
      redis = mockRedisClient;
      isRedisAvailable = false;
      logger.warn('Using mock Redis client in production - OAuth features will be limited');
    } else {
      // In development, use mock client
      logger.warn('Using mock Redis client for development');
      redis = mockRedisClient;
      isRedisAvailable = false;
    }
  }
};

const disconnectRedis = async () => {
  try {
    if (redis && redis.quit) {
      await redis.quit();
      logger.info('Disconnected from Redis');
    }
    isRedisAvailable = false;
  } catch (error) {
    logger.error('Error disconnecting from Redis:', error);
  }
};

module.exports = {
  redis,
  connectRedis,
  disconnectRedis,
  isRedisAvailable: () => isRedisAvailable
};