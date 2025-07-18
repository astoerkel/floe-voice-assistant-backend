const logger = require('../utils/logger');

// Get project ID
const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCLOUD_PROJECT || 'floe-voice-assistant';

// Google Cloud Platform configuration
const gcpConfig = {
  projectId: projectId,
  region: process.env.GOOGLE_CLOUD_REGION || 'us-central1',
  
  // Cloud SQL configuration
  database: {
    connectionName: process.env.CLOUD_SQL_CONNECTION_NAME || 'floe-voice-assistant:us-central1:voice-assistant-postgres',
    socketPath: process.env.DB_SOCKET_PATH || '/cloudsql',
    useCloudSqlConnector: process.env.NODE_ENV === 'production'
  },
  
  // Redis configuration for Google Cloud Memorystore
  redis: {
    host: process.env.REDIS_HOST || '10.244.122.235',
    port: process.env.REDIS_PORT || 6379,
    useMemorystore: process.env.NODE_ENV === 'production'
  },
  
  // Cloud Storage configuration
  storage: {
    bucketName: process.env.GCS_BUCKET_NAME || `${projectId}-audio-files`,
    audioFilesPrefix: 'audio-files/',
    publicUrl: process.env.GCS_PUBLIC_URL
  },
  
  // Text-to-Speech configuration
  textToSpeech: {
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
  },
  
  // Secret Manager configuration
  secretManager: {
    enabled: process.env.NODE_ENV === 'production'
  },
  
  // Cloud Run configuration
  cloudRun: {
    port: process.env.PORT || 8080,
    timeout: process.env.CLOUD_RUN_TIMEOUT || 900,
    memory: process.env.CLOUD_RUN_MEMORY || '2Gi',
    cpu: process.env.CLOUD_RUN_CPU || '2',
    minInstances: process.env.CLOUD_RUN_MIN_INSTANCES || 1,
    maxInstances: process.env.CLOUD_RUN_MAX_INSTANCES || 100
  }
};

// Validate GCP configuration
const validateGcpConfig = () => {
  const errors = [];
  
  if (!gcpConfig.projectId) {
    errors.push('GOOGLE_CLOUD_PROJECT_ID is required');
  }
  
  if (gcpConfig.database.useCloudSqlConnector && !gcpConfig.database.connectionName) {
    errors.push('CLOUD_SQL_CONNECTION_NAME is required for Cloud SQL connections');
  }
  
  if (gcpConfig.redis.useMemorystore && !gcpConfig.redis.host) {
    errors.push('REDIS_HOST is required for Memorystore connections');
  }
  
  if (gcpConfig.textToSpeech.keyFilename && !require('fs').existsSync(gcpConfig.textToSpeech.keyFilename)) {
    errors.push('GOOGLE_APPLICATION_CREDENTIALS file does not exist');
  }
  
  if (errors.length > 0) {
    logger.error('GCP configuration validation failed:', errors);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`GCP configuration errors: ${errors.join(', ')}`);
    }
  }
  
  return errors.length === 0;
};

// Get the appropriate database URL based on environment
const getDatabaseUrl = () => {
  if (gcpConfig.database.useCloudSqlConnector) {
    // Use Cloud SQL connector for production
    const baseUrl = process.env.DATABASE_URL;
    if (baseUrl && baseUrl.includes('cloudsql')) {
      return baseUrl;
    }
    
    // Construct Cloud SQL URL
    const socketPath = `/cloudsql/${gcpConfig.database.connectionName}`;
    const dbName = process.env.DB_NAME || 'voiceassistant';
    const user = process.env.DB_USER || 'voiceassistant-user';
    const password = process.env.DB_PASSWORD;
    
    // For Cloud SQL, we need to specify the host parameter
    return `postgresql://${user}:${password}@localhost/${dbName}?host=${socketPath}`;
  }
  
  // Use regular DATABASE_URL for local development
  return process.env.DATABASE_URL;
};

// Get the appropriate Redis URL based on environment
const getRedisUrl = () => {
  // Always prefer REDIS_URL environment variable if available
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  
  // In production, always use Memorystore
  if (process.env.NODE_ENV === 'production') {
    return `redis://${gcpConfig.redis.host}:${gcpConfig.redis.port}`;
  }
  
  // For development, check if we should use memorystore
  if (gcpConfig.redis.useMemorystore) {
    return `redis://${gcpConfig.redis.host}:${gcpConfig.redis.port}`;
  }
  
  // Fallback to default Redis URL for local development
  return 'redis://localhost:6379';
};

module.exports = {
  gcpConfig,
  validateGcpConfig,
  getDatabaseUrl,
  getRedisUrl
};