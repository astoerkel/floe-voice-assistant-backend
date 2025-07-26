// Load environment variables
require('dotenv').config();

// Startup diagnostics
console.log('=== SERVER STARTUP ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT || 3000);
console.log('API_KEY_ENV:', process.env.API_KEY_ENV ? 'Set' : 'Not set');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set' : 'Not set');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const authenticateApiKey = require('./middleware/apiKeyAuth');
const jwtAuth = require('./middleware/sessionAuth'); // Renamed to jwtAuth
const { checkUsageLimit } = require('./middleware/usageLimiter');
const { connectRedis } = require('./config/redis');
const { connectDatabase } = require('./config/database');

// Import essential routes only
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const voiceRoutes = require('./routes/voice');
const oauthRoutes = require('./routes/oauth');
const diagnosticsRoutes = require('./routes/diagnostics');

// Import WebSocket handlers
const initializeWebSocket = require('./websocket');

const app = express();

// Trust proxy for Hetzner deployment
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "wss:", "ws:"],
    },
  },
}));

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'];
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Public health endpoint for unauthenticated access
app.get('/public/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'voice-assistant-backend'
  });
});

// API routes (essential only)
app.use('/api/auth', authRoutes); // Auth routes handle their own authentication
app.use('/api/user', authenticateApiKey, userRoutes); // User routes include JWT auth internally
app.use('/api/voice', authenticateApiKey, jwtAuth, checkUsageLimit, voiceRoutes);
app.use('/api/oauth', oauthRoutes); // OAuth routes handle their own authentication
app.use('/api/diagnostics', diagnosticsRoutes); // Diagnostics routes (no auth for debugging)

// Static file serving for audio files (only if directory exists)
const audioPath = process.env.AUDIO_PATH || '/app/data/audio';
const fs = require('fs');
if (fs.existsSync(audioPath)) {
  app.use('/audio', express.static(audioPath));
  logger.info(`Audio static files served from: ${audioPath}`);
} else {
  logger.warn(`Audio directory not found: ${audioPath}`);
}

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize database and Redis connections
async function initialize() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected successfully');

  } catch (error) {
    logger.error('Failed to initialize connections:', error);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

// Start server
const PORT = process.env.PORT || 3000;
const server = createServer(app);

// Initialize WebSocket
initializeWebSocket(server);

server.listen(PORT, '0.0.0.0', async () => {
  logger.info(`🚀 Voice Assistant Backend server running on port ${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🔗 CORS origins: ${corsOrigins.join(', ')}`);
  
  // Initialize connections
  await initialize();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

module.exports = app;