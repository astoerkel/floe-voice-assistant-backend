const logger = require('./utils/logger');

/**
 * Initialize WebSocket connections for real-time communication
 * @param {Server} io - Socket.IO server instance
 */
function initializeWebSocket(io) {
  logger.info('Setting up WebSocket handlers...');
  
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);
    
    // Handle client authentication
    socket.on('authenticate', async (data) => {
      try {
        const { userId, token } = data;
        logger.info(`Authentication attempt for user ${userId}`);
        
        // Verify JWT token here if needed
        socket.userId = userId;
        socket.authenticated = true;
        
        socket.emit('authenticated', { success: true });
        logger.info(`User ${userId} authenticated successfully`);
      } catch (error) {
        logger.error('Authentication failed:', error);
        socket.emit('authentication_error', { error: error.message });
      }
    });
    
    // Handle voice processing status updates
    socket.on('voice_processing_status', (data) => {
      logger.info(`Voice processing status from ${socket.id}:`, data);
    });
    
    // Handle real-time sync requests
    socket.on('sync_request', async (data) => {
      try {
        logger.info(`Sync request from ${socket.id}:`, data);
        // Handle sync logic here
        socket.emit('sync_response', { success: true, data: {} });
      } catch (error) {
        logger.error('Sync request failed:', error);
        socket.emit('sync_error', { error: error.message });
      }
    });
    
    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
      socket.authenticated = false;
      socket.userId = null;
    });
    
    // Handle connection errors
    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });
    
    // Send welcome message
    socket.emit('connected', { 
      message: 'Connected to Voice Assistant backend',
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
  });
  
  // Handle server-level errors
  io.on('error', (error) => {
    logger.error('Socket.IO server error:', error);
  });
  
  logger.info('WebSocket handlers configured successfully');
}

module.exports = initializeWebSocket;