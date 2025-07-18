const jwt = require('jsonwebtoken');
const coordinatorAgent = require('../services/agents/coordinatorAgent');
const speechToText = require('../services/ai/speechToText');
const textToSpeech = require('../services/ai/textToSpeech');
const logger = require('../utils/logger');

class WebSocketManager {
  constructor() {
    this.authenticatedSockets = new Map();
    this.voiceStreams = new Map();
  }

  initialize(io) {
    io.on('connection', (socket) => {
      logger.info(`WebSocket client connected: ${socket.id}`);
      
      // Authentication handler
      socket.on('authenticate', async (data) => {
        try {
          const { token } = data;
          
          if (!token) {
            socket.emit('auth-error', { error: 'Authentication token required' });
            return;
          }

          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const userId = decoded.userId;
          
          // Store authenticated socket
          this.authenticatedSockets.set(socket.id, {
            userId,
            socket,
            connectedAt: new Date()
          });

          socket.emit('authenticated', { 
            success: true, 
            userId,
            message: 'WebSocket authenticated successfully' 
          });
          
          logger.info(`WebSocket authenticated for user ${userId}: ${socket.id}`);
        } catch (error) {
          logger.error('WebSocket authentication failed:', error);
          socket.emit('auth-error', { error: 'Invalid authentication token' });
        }
      });

      // Voice command handler
      socket.on('voice-command', async (data) => {
        try {
          const socketInfo = this.authenticatedSockets.get(socket.id);
          
          if (!socketInfo) {
            socket.emit('voice-error', { error: 'Not authenticated' });
            return;
          }

          const { text, sessionId, metadata = {} } = data;
          const userId = socketInfo.userId;
          
          logger.info(`Voice command received from user ${userId}: ${text?.substring(0, 50)}`);
          
          // Emit processing status
          socket.emit('voice-processing', { 
            status: 'processing', 
            sessionId,
            message: 'Processing your voice command...' 
          });

          // Process the voice command
          const context = {
            sessionId,
            userId,
            websocket: true,
            ...metadata
          };

          const result = await coordinatorAgent.processVoiceCommand(userId, text, context);
          
          // Emit result
          if (result.success) {
            socket.emit('voice-response', {
              sessionId,
              success: true,
              response: result.response,
              intent: result.intent,
              confidence: result.confidence,
              agentUsed: result.agentUsed,
              executionTime: result.executionTime,
              actions: result.actions,
              suggestions: result.suggestions
            });

            // Generate audio response if requested
            if (metadata.generateAudio) {
              const ttsResult = await textToSpeech.synthesizeSpeech(result.response);
              if (ttsResult.success) {
                socket.emit('voice-audio-response', {
                  sessionId,
                  audioBase64: ttsResult.audioBase64,
                  audioSize: ttsResult.audioSize
                });
              }
            }
          } else {
            socket.emit('voice-error', {
              sessionId,
              error: result.error || 'Failed to process voice command'
            });
          }
        } catch (error) {
          logger.error('Voice command processing failed:', error);
          socket.emit('voice-error', { error: 'Internal server error' });
        }
      });

      // Voice streaming handlers
      socket.on('voice-stream-start', (data) => {
        try {
          const socketInfo = this.authenticatedSockets.get(socket.id);
          
          if (!socketInfo) {
            socket.emit('voice-error', { error: 'Not authenticated' });
            return;
          }

          const { sessionId } = data;
          
          // Initialize voice stream
          this.voiceStreams.set(sessionId, {
            userId: socketInfo.userId,
            socketId: socket.id,
            chunks: [],
            startTime: Date.now()
          });

          socket.emit('voice-stream-ready', { sessionId });
          logger.info(`Voice stream started for user ${socketInfo.userId}: ${sessionId}`);
        } catch (error) {
          logger.error('Voice stream start failed:', error);
          socket.emit('voice-error', { error: 'Failed to start voice stream' });
        }
      });

      socket.on('voice-stream-chunk', (data) => {
        try {
          const { sessionId, chunk } = data;
          const stream = this.voiceStreams.get(sessionId);
          
          if (!stream) {
            socket.emit('voice-error', { error: 'Voice stream not found' });
            return;
          }

          // Add chunk to stream
          stream.chunks.push(chunk);
          
          // Emit acknowledgment
          socket.emit('voice-chunk-received', { sessionId, chunkIndex: stream.chunks.length });
        } catch (error) {
          logger.error('Voice stream chunk failed:', error);
          socket.emit('voice-error', { error: 'Failed to process voice chunk' });
        }
      });

      socket.on('voice-stream-end', async (data) => {
        try {
          const { sessionId } = data;
          const stream = this.voiceStreams.get(sessionId);
          
          if (!stream) {
            socket.emit('voice-error', { error: 'Voice stream not found' });
            return;
          }

          // Combine all chunks
          const audioBuffer = Buffer.concat(stream.chunks);
          
          // Clean up stream
          this.voiceStreams.delete(sessionId);
          
          // Process audio
          socket.emit('voice-processing', { 
            status: 'transcribing', 
            sessionId,
            message: 'Transcribing audio...' 
          });

          const transcriptionResult = await speechToText.transcribeAudio(audioBuffer);
          
          if (transcriptionResult.success) {
            // Process the transcribed text
            socket.emit('voice-processing', { 
              status: 'processing', 
              sessionId,
              message: 'Processing transcribed text...' 
            });

            const result = await coordinatorAgent.processVoiceCommand(
              stream.userId, 
              transcriptionResult.text, 
              { sessionId, websocket: true }
            );
            
            // Emit final result
            socket.emit('voice-response', {
              sessionId,
              success: result.success,
              transcription: {
                text: transcriptionResult.text,
                confidence: transcriptionResult.confidence
              },
              response: result.response,
              intent: result.intent,
              agentUsed: result.agentUsed,
              executionTime: result.executionTime,
              actions: result.actions,
              suggestions: result.suggestions
            });
          } else {
            socket.emit('voice-error', {
              sessionId,
              error: 'Failed to transcribe audio'
            });
          }
        } catch (error) {
          logger.error('Voice stream end failed:', error);
          socket.emit('voice-error', { error: 'Failed to process voice stream' });
        }
      });

      // Conversation handlers
      socket.on('get-conversation-history', async (data) => {
        try {
          const socketInfo = this.authenticatedSockets.get(socket.id);
          
          if (!socketInfo) {
            socket.emit('conversation-error', { error: 'Not authenticated' });
            return;
          }

          const { limit = 20 } = data;
          const conversations = await coordinatorAgent.getConversationHistory(socketInfo.userId, limit);
          
          socket.emit('conversation-history', {
            success: true,
            conversations
          });
        } catch (error) {
          logger.error('Get conversation history failed:', error);
          socket.emit('conversation-error', { error: 'Failed to get conversation history' });
        }
      });

      socket.on('clear-conversation-history', async (data) => {
        try {
          const socketInfo = this.authenticatedSockets.get(socket.id);
          
          if (!socketInfo) {
            socket.emit('conversation-error', { error: 'Not authenticated' });
            return;
          }

          const result = await coordinatorAgent.clearConversationHistory(socketInfo.userId);
          
          socket.emit('conversation-cleared', {
            success: result.success,
            message: result.success ? 'Conversation history cleared' : result.error
          });
        } catch (error) {
          logger.error('Clear conversation history failed:', error);
          socket.emit('conversation-error', { error: 'Failed to clear conversation history' });
        }
      });

      // Status and health handlers
      socket.on('get-status', (data) => {
        try {
          const socketInfo = this.authenticatedSockets.get(socket.id);
          
          if (!socketInfo) {
            socket.emit('status-error', { error: 'Not authenticated' });
            return;
          }

          socket.emit('status', {
            success: true,
            status: 'connected',
            userId: socketInfo.userId,
            connectedAt: socketInfo.connectedAt,
            serverTime: new Date(),
            activeStreams: this.voiceStreams.size
          });
        } catch (error) {
          logger.error('Get status failed:', error);
          socket.emit('status-error', { error: 'Failed to get status' });
        }
      });

      socket.on('ping', (data) => {
        socket.emit('pong', { 
          timestamp: new Date(),
          data: data || {} 
        });
      });

      // Disconnect handler
      socket.on('disconnect', () => {
        try {
          const socketInfo = this.authenticatedSockets.get(socket.id);
          
          if (socketInfo) {
            logger.info(`WebSocket client disconnected: ${socket.id} (user: ${socketInfo.userId})`);
          } else {
            logger.info(`WebSocket client disconnected: ${socket.id} (unauthenticated)`);
          }
          
          // Clean up
          this.authenticatedSockets.delete(socket.id);
          
          // Clean up any active voice streams
          for (const [sessionId, stream] of this.voiceStreams.entries()) {
            if (stream.socketId === socket.id) {
              this.voiceStreams.delete(sessionId);
              logger.info(`Cleaned up voice stream: ${sessionId}`);
            }
          }
        } catch (error) {
          logger.error('Disconnect cleanup failed:', error);
        }
      });
    });
  }

  // Utility methods
  getConnectedUsers() {
    const users = new Set();
    for (const [socketId, info] of this.authenticatedSockets) {
      users.add(info.userId);
    }
    return Array.from(users);
  }

  getSocketsForUser(userId) {
    const sockets = [];
    for (const [socketId, info] of this.authenticatedSockets) {
      if (info.userId === userId) {
        sockets.push(info.socket);
      }
    }
    return sockets;
  }

  broadcastToUser(userId, event, data) {
    const sockets = this.getSocketsForUser(userId);
    sockets.forEach(socket => {
      socket.emit(event, data);
    });
  }

  getStats() {
    return {
      connectedSockets: this.authenticatedSockets.size,
      activeStreams: this.voiceStreams.size,
      connectedUsers: this.getConnectedUsers().length
    };
  }
}

const webSocketManager = new WebSocketManager();

const initializeWebSocket = (io) => {
  webSocketManager.initialize(io);
};

module.exports = initializeWebSocket;