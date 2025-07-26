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

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');
const subscriptionsRoutes = require('./routes/subscriptions');
const voiceRoutes = require('./routes/voice');
const calendarRoutes = require('./routes/calendar');
const emailRoutes = require('./routes/email');
const tasksRoutes = require('./routes/tasks');
const integrationsRoutes = require('./routes/integrations');
const syncRoutes = require('./routes/sync');
const queueRoutes = require('./routes/queue');
const oauthRoutes = require('./routes/oauth');
const diagnosticsRoutes = require('./routes/diagnostics');

// Import WebSocket handlers
const initializeWebSocket = require('./websocket');

const app = express();

// Trust proxy for Hetzner deployment
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins for mobile app connections
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  allowEIO4: true
});

// Initialize connections asynchronously to not block server startup
Promise.all([
  connectDatabase().catch(err => {
    logger.error('Database connection failed:', err);
    console.log('Continuing without database connection');
  }),
  connectRedis().catch(err => {
    logger.error('Redis connection failed:', err);
    console.log('Continuing without Redis connection');
  })
]).then(() => {
  logger.info('All connections initialized');
}).catch(err => {
  logger.error('Connection initialization error:', err);
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

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

// API routes (with authentication)
app.use('/api/auth', authRoutes); // Auth routes handle their own authentication
app.use('/api/user', userRoutes); // User routes include JWT auth internally
app.use('/api/admin', authenticateApiKey, adminRoutes); // Admin routes include JWT auth and role check internally
app.use('/api/analytics', authenticateApiKey, analyticsRoutes); // Analytics routes include JWT auth internally
app.use('/api/subscriptions', authenticateApiKey, subscriptionsRoutes); // Subscriptions routes include JWT auth internally
app.use('/api/voice', authenticateApiKey, jwtAuth, checkUsageLimit, voiceRoutes);
app.use('/api/calendar', authenticateApiKey, calendarRoutes);
app.use('/api/email', authenticateApiKey, emailRoutes);
app.use('/api/tasks', authenticateApiKey, tasksRoutes);
app.use('/api/integrations', authenticateApiKey, integrationsRoutes);
app.use('/api/sync', authenticateApiKey, syncRoutes);
app.use('/api/queue', authenticateApiKey, queueRoutes);
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

// Initialize WebSocket (with error handling)
try {
  initializeWebSocket(io);
  logger.info('WebSocket initialized successfully');
} catch (error) {
  logger.error('WebSocket initialization failed:', error);
  // Continue without WebSocket - REST API will still work
}

// Error handling middleware (should be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;

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

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Voice Assistant Backend running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Server successfully listening on 0.0.0.0:${PORT}`);
});

module.exports = app;