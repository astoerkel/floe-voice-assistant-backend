require('dotenv').config();
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
const { connectRedis } = require('./config/redis');
const { connectDatabase } = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
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

// Trust proxy for Railway deployment
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ["http://localhost:3000"],
    credentials: true
  }
});

// Initialize connections
connectDatabase();
connectRedis();

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
app.use('/api/voice', authenticateApiKey, voiceRoutes);
app.use('/api/calendar', authenticateApiKey, calendarRoutes);
app.use('/api/email', authenticateApiKey, emailRoutes);
app.use('/api/tasks', authenticateApiKey, tasksRoutes);
app.use('/api/integrations', authenticateApiKey, integrationsRoutes);
app.use('/api/sync', authenticateApiKey, syncRoutes);
app.use('/api/queue', authenticateApiKey, queueRoutes);
app.use('/api/oauth', oauthRoutes); // OAuth routes handle their own authentication
app.use('/api/diagnostics', diagnosticsRoutes); // Diagnostics routes (no auth for debugging)

// Static file serving for audio files
app.use('/audio', express.static(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/app/data/audio'));

// Initialize WebSocket
initializeWebSocket(io);

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

server.listen(PORT, () => {
  logger.info(`Voice Assistant Backend running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});

module.exports = app;