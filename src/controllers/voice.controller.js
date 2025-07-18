const coordinatorAgent = require('../services/agents/coordinatorAgent');
const speechToText = require('../services/ai/speechToText');
const textToSpeech = require('../services/ai/textToSpeech');
const speechAnalytics = require('../services/analytics/speechAnalytics');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { body, validationResult } = require('express-validator');
const queueService = require('../services/queue');

class VoiceController {
  // Process text-only command (primary method for Apple Speech Framework)
  async processText(req, res) {
    const startTime = Date.now();
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { text, context = {}, platform = 'ios' } = req.body;
      const userId = req.user.id;
      
      // Validate input
      if (!text || text.trim().length === 0) {
        return res.status(400).json({
          error: 'Text is required',
          suggestion: 'Provide transcribed text from Apple Speech Framework'
        });
      }
      
      if (text.length > 1000) {
        return res.status(400).json({
          error: 'Text too long',
          maxLength: 1000
        });
      }

      // Add platform-specific context
      const enhancedContext = {
        ...context,
        platform,
        userId,
        transcriptionMethod: 'apple_speech',
        sessionId: context.sessionId || `session_${Date.now()}_${userId}`
      };

      // Process with AI
      const result = await coordinatorAgent.processVoiceCommand(userId, text, enhancedContext);

      // Generate voice response
      const audioResponse = await this.generateVoiceResponse(
        result.response,
        platform,
        context.languageCode || 'en-US',
        userId
      );

      const processingTime = Date.now() - startTime;

      // Track analytics
      await speechAnalytics.trackTranscriptionMethod(
        userId,
        'apple_speech',
        result.success,
        processingTime,
        platform
      );

      res.json({
        success: result.success,
        processingTime,
        transcriptionMethod: 'apple_speech',
        text: text,
        intent: result.intent,
        confidence: result.confidence,
        agentUsed: result.agentUsed,
        executionTime: result.executionTime,
        response: result.response,
        audioResponse,
        actions: result.actions || [],
        suggestions: result.suggestions || [],
        sessionId: enhancedContext.sessionId,
        updates: {
          hapticPattern: this.getHapticPattern(result.intent)
        }
      });
      
    } catch (error) {
      logger.error('Text processing error:', error);
      res.status(500).json({
        error: error.message,
        processingTime: Date.now() - startTime,
        fallbackSuggestion: 'Try using audio upload endpoint'
      });
    }
  }

  // Process voice command from audio file (fallback method)
  async processVoiceAudio(req, res) {
    const startTime = Date.now();
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const userId = req.user.id;
      const { sessionId, metadata = {}, platform = 'ios', reason = 'fallback' } = req.body;
      
      // Log fallback usage
      logger.info(`Whisper fallback used. Reason: ${reason}, Platform: ${platform}, User: ${userId}`);
      
      if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      // Transcribe audio to text
      const transcriptionStart = Date.now();
      const transcriptionResult = await speechToText.transcribeAudio(req.file.buffer, {
        language: metadata.language || 'en'
      });
      const transcriptionTime = Date.now() - transcriptionStart;

      // Track transcription analytics
      await speechAnalytics.trackTranscriptionMethod(
        userId,
        'whisper',
        transcriptionResult.success,
        transcriptionTime,
        platform,
        req.file.buffer.length
      );

      if (!transcriptionResult.success) {
        return res.status(500).json({ 
          error: 'Audio transcription failed',
          message: transcriptionResult.error 
        });
      }

      // Process the transcribed text
      const context = {
        sessionId,
        userId,
        audioTranscription: {
          confidence: transcriptionResult.confidence,
          language: transcriptionResult.language,
          processingTime: transcriptionResult.processingTime
        },
        ...metadata
      };

      const result = await coordinatorAgent.processVoiceCommand(userId, transcriptionResult.text, context);

      // Generate audio response
      let audioResponse = null;
      if (result.success && result.response) {
        const ttsResult = await textToSpeech.synthesizeSpeech(result.response, {
          voice: {
            languageCode: metadata.responseLanguage || 'en-US',
            name: metadata.voiceName || 'en-US-Journey-F'
          }
        });
        
        if (ttsResult.success) {
          audioResponse = {
            audioBase64: ttsResult.audioBase64,
            audioSize: ttsResult.audioSize,
            voiceConfig: ttsResult.voiceConfig
          };
        }
      }

      const totalProcessingTime = Date.now() - startTime;

      res.json({
        success: result.success,
        processingTime: totalProcessingTime,
        transcriptionTime,
        transcriptionMethod: 'whisper',
        transcription: {
          text: transcriptionResult.text,
          confidence: transcriptionResult.confidence,
          language: transcriptionResult.language
        },
        response: result.response,
        audioResponse,
        intent: result.intent,
        confidence: result.confidence,
        agentUsed: result.agentUsed,
        executionTime: result.executionTime,
        actions: result.actions || [],
        suggestions: result.suggestions || [],
        sessionId,
        updates: {
          hapticPattern: this.getHapticPattern(result.intent)
        }
      });
    } catch (error) {
      logger.error('Voice audio processing failed:', error);
      res.status(500).json({ 
        error: 'Voice audio processing failed',
        message: error.message 
      });
    }
  }

  // Process voice command from text
  async processVoiceCommand(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { text, sessionId, metadata = {}, generateAudio = true } = req.body;
      const userId = req.user.id;

      const context = {
        sessionId,
        userId,
        ...metadata
      };

      const result = await coordinatorAgent.processVoiceCommand(userId, text, context);

      // Generate audio response if requested
      let audioResponse = null;
      if (generateAudio && result.success && result.response) {
        const ttsResult = await textToSpeech.synthesizeSpeech(result.response, {
          voice: {
            languageCode: metadata.responseLanguage || 'en-US',
            name: metadata.voiceName || 'en-US-Journey-F'
          }
        });
        
        if (ttsResult.success) {
          audioResponse = {
            audioBase64: ttsResult.audioBase64,
            audioSize: ttsResult.audioSize,
            voiceConfig: ttsResult.voiceConfig
          };
        }
      }

      res.json({
        success: result.success,
        response: result.response,
        audioResponse,
        intent: result.intent,
        confidence: result.confidence,
        agentUsed: result.agentUsed,
        executionTime: result.executionTime,
        actions: result.actions || [],
        suggestions: result.suggestions || [],
        sessionId
      });
    } catch (error) {
      logger.error('Voice processing failed:', error);
      res.status(500).json({ 
        error: 'Voice processing failed',
        message: error.message 
      });
    }
  }

  // Transcribe audio to text
  async transcribeAudio(req, res) {
    try {
      const userId = req.user.id;
      const { language = 'en' } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      const result = await speechToText.transcribeAudio(req.file.buffer, {
        language,
        response_format: 'json'
      });

      if (result.success) {
        res.json({
          success: true,
          text: result.text,
          confidence: result.confidence,
          language: result.language,
          processingTime: result.processingTime
        });
      } else {
        res.status(500).json({ 
          error: 'Transcription failed',
          message: result.error 
        });
      }
    } catch (error) {
      logger.error('Audio transcription failed:', error);
      res.status(500).json({ 
        error: 'Audio transcription failed',
        message: error.message 
      });
    }
  }

  // Convert text to speech
  async synthesizeSpeech(req, res) {
    try {
      const { text, voice = {}, audio = {} } = req.body;
      const userId = req.user.id;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const result = await textToSpeech.synthesizeSpeech(text, {
        voice: {
          languageCode: voice.languageCode || 'en-US',
          name: voice.name || 'en-US-Journey-F',
          ssmlGender: voice.ssmlGender || 'FEMALE'
        },
        audio: {
          audioEncoding: audio.audioEncoding || 'MP3',
          speakingRate: audio.speakingRate || 1.0,
          pitch: audio.pitch || 0.0
        }
      });

      if (result.success) {
        res.json({
          success: true,
          audioBase64: result.audioBase64,
          audioSize: result.audioSize,
          voiceConfig: result.voiceConfig,
          audioConfig: result.audioConfig,
          processingTime: result.processingTime
        });
      } else {
        res.status(500).json({ 
          error: 'Speech synthesis failed',
          message: result.error 
        });
      }
    } catch (error) {
      logger.error('Speech synthesis failed:', error);
      res.status(500).json({ 
        error: 'Speech synthesis failed',
        message: error.message 
      });
    }
  }

  // Get available voices
  async getAvailableVoices(req, res) {
    try {
      const { languageCode = 'en-US' } = req.query;
      
      const result = await textToSpeech.getAvailableVoices(languageCode);
      
      if (result.success) {
        res.json({
          success: true,
          voices: result.voices,
          languageCode: result.languageCode
        });
      } else {
        res.status(500).json({ 
          error: 'Failed to get available voices',
          message: result.error 
        });
      }
    } catch (error) {
      logger.error('Failed to get available voices:', error);
      res.status(500).json({ 
        error: 'Failed to get available voices',
        message: error.message 
      });
    }
  }

  // Get voice command history
  async getVoiceHistory(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 20, offset = 0, intent } = req.query;

      const where = { userId };
      if (intent) {
        where.intent = intent;
      }

      const commands = await prisma.voiceCommand.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
        select: {
          id: true,
          text: true,
          intent: true,
          agentUsed: true,
          response: true,
          status: true,
          executionTime: true,
          createdAt: true,
          metadata: true
        }
      });

      const total = await prisma.voiceCommand.count({ where });

      res.json({
        success: true,
        commands,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Failed to get voice history:', error);
      res.status(500).json({ error: 'Failed to get voice history' });
    }
  }

  // Get conversation history
  async getConversationHistory(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 20 } = req.query;

      const conversations = await coordinatorAgent.getConversationHistory(userId, parseInt(limit));

      res.json({
        success: true,
        conversations
      });
    } catch (error) {
      logger.error('Failed to get conversation history:', error);
      res.status(500).json({ error: 'Failed to get conversation history' });
    }
  }

  // Clear conversation history
  async clearConversationHistory(req, res) {
    try {
      const userId = req.user.id;
      const result = await coordinatorAgent.clearConversationHistory(userId);

      if (result.success) {
        res.json({ success: true, message: 'Conversation history cleared' });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      logger.error('Failed to clear conversation history:', error);
      res.status(500).json({ error: 'Failed to clear conversation history' });
    }
  }

  // Get user context
  async getUserContext(req, res) {
    try {
      const userId = req.user.id;
      const context = await coordinatorAgent.getUserContext(userId);

      res.json({
        success: true,
        context
      });
    } catch (error) {
      logger.error('Failed to get user context:', error);
      res.status(500).json({ error: 'Failed to get user context' });
    }
  }

  // Get voice processing statistics
  async getVoiceStats(req, res) {
    try {
      const userId = req.user.id;
      
      const stats = await prisma.voiceCommand.groupBy({
        by: ['intent', 'agentUsed', 'status'],
        where: { userId },
        _count: true,
        _avg: { executionTime: true }
      });

      const totalCommands = await prisma.voiceCommand.count({ where: { userId } });
      
      const last30Days = await prisma.voiceCommand.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      });

      res.json({
        success: true,
        stats: {
          totalCommands,
          last30Days,
          breakdown: stats,
          coordinatorStats: coordinatorAgent.getStats()
        }
      });
    } catch (error) {
      logger.error('Failed to get voice stats:', error);
      res.status(500).json({ error: 'Failed to get voice stats' });
    }
  }

  async getTranscriptionAnalytics(req, res) {
    try {
      const userId = req.user.id;
      const { timeframe = '7d' } = req.query;
      
      // Get user's transcription stats
      const userStats = await speechAnalytics.getTranscriptionStats(userId, timeframe);
      
      // Get platform usage (only for admin users)
      const platformUsage = req.user.role === 'admin' ? 
        await speechAnalytics.getPlatformUsage(timeframe) : [];
      
      // Get method performance
      const applePerformance = await speechAnalytics.getMethodPerformance('apple_speech', timeframe);
      const whisperPerformance = await speechAnalytics.getMethodPerformance('whisper', timeframe);
      
      // Get fallback usage
      const fallbackUsage = await speechAnalytics.getFallbackUsage(timeframe);
      
      res.json({
        success: true,
        analytics: {
          userStats,
          platformUsage,
          methodPerformance: {
            apple_speech: applePerformance,
            whisper: whisperPerformance
          },
          fallbackUsage
        }
      });
    } catch (error) {
      logger.error('Failed to get transcription analytics:', error);
      res.status(500).json({ error: 'Failed to get transcription analytics' });
    }
  }

  // Process voice command asynchronously using queue
  async processVoiceCommandAsync(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { text, sessionId, metadata = {} } = req.body;
      const userId = req.user.id;

      // Get user's integrations
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          integrations: {
            where: { active: true }
          }
        }
      });

      // Create conversation if sessionId provided
      let conversationId = null;
      if (sessionId) {
        const conversation = await prisma.conversation.upsert({
          where: { sessionId },
          update: { updatedAt: new Date() },
          create: {
            userId,
            sessionId,
            title: text.substring(0, 50) + '...'
          }
        });
        conversationId = conversation.id;
      }

      // Queue the voice processing job
      const job = await queueService.processVoiceCommand({
        userId,
        text,
        conversationId,
        integrations: user.integrations,
        metadata
      });

      res.json({
        success: true,
        jobId: job.id,
        message: 'Voice command queued for processing',
        status: 'queued',
        estimatedTime: '2-5 seconds'
      });
    } catch (error) {
      logger.error('Async voice processing failed:', error);
      res.status(500).json({ 
        error: 'Async voice processing failed',
        message: error.message 
      });
    }
  }

  // Process voice audio asynchronously using queue
  async processVoiceAudioAsync(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const userId = req.user.id;
      const { sessionId, metadata = {} } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      // Queue the transcription job
      const job = await queueService.transcribeAudio({
        userId,
        audioBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        language: metadata.language || 'en',
        sessionId,
        metadata
      });

      res.json({
        success: true,
        jobId: job.id,
        message: 'Audio transcription queued',
        status: 'queued',
        estimatedTime: '3-7 seconds'
      });
    } catch (error) {
      logger.error('Async audio processing failed:', error);
      res.status(500).json({ 
        error: 'Async audio processing failed',
        message: error.message 
      });
    }
  }

  // Get job status
  async getJobStatus(req, res) {
    try {
      const { jobId } = req.params;
      const userId = req.user.id;

      // TODO: Implement job status checking
      // This would require storing job metadata in database
      // For now, return a mock response
      res.json({
        success: true,
        jobId,
        status: 'processing',
        progress: 50,
        message: 'Job status checking not yet implemented'
      });
    } catch (error) {
      logger.error('Failed to get job status:', error);
      res.status(500).json({ error: 'Failed to get job status' });
    }
  }

  // Stream voice processing (placeholder for future implementation)
  async streamStart(req, res) {
    try {
      const { platform, context = {} } = req.body;
      const userId = req.user.id;

      // Create stream session
      const sessionId = `stream_${Date.now()}_${userId}`;
      const session = {
        userId,
        platform,
        context,
        startTime: new Date(),
        partialResults: []
      };

      // Store in Redis (if available)
      // TODO: Implement Redis storage for session
      
      res.json({
        success: true,
        sessionId,
        message: 'Stream session created'
      });
    } catch (error) {
      logger.error('Stream start failed:', error);
      res.status(500).json({ error: 'Stream start failed' });
    }
  }

  async streamProcess(req, res) {
    try {
      const { sessionId, text, isFinal = false } = req.body;
      const userId = req.user.id;

      if (isFinal) {
        // Process final command
        const result = await coordinatorAgent.processVoiceCommand(userId, text, {
          sessionId,
          transcriptionMethod: 'apple_speech',
          platform: 'ios'
        });

        // Generate audio response
        const audioResponse = await this.generateVoiceResponse(
          result.response,
          'ios',
          'en-US',
          userId
        );

        res.json({
          success: true,
          final: true,
          text: text,
          intent: result.intent,
          response: result.response,
          audioResponse,
          updates: {
            hapticPattern: this.getHapticPattern(result.intent)
          }
        });
      } else {
        // Handle partial results
        res.json({
          success: true,
          partial: true,
          text: text
        });
      }
    } catch (error) {
      logger.error('Stream process failed:', error);
      res.status(500).json({ error: 'Stream process failed' });
    }
  }

  async streamChunk(req, res) {
    try {
      const { sessionId, chunk } = req.body;
      
      // TODO: Process audio chunk
      res.json({
        success: true,
        sessionId,
        message: 'Chunk received'
      });
    } catch (error) {
      logger.error('Stream chunk failed:', error);
      res.status(500).json({ error: 'Stream chunk failed' });
    }
  }

  async streamEnd(req, res) {
    try {
      const { sessionId } = req.body;
      
      // TODO: Finalize stream processing
      res.json({
        success: true,
        sessionId,
        message: 'Stream ended'
      });
    } catch (error) {
      logger.error('Stream end failed:', error);
      res.status(500).json({ error: 'Stream end failed' });
    }
  }

  // Helper Methods
  
  // Generate voice response using TTS
  async generateVoiceResponse(text, platform, languageCode, userId) {
    try {
      const voiceName = this.getVoiceName(platform, languageCode);
      
      const ttsResult = await textToSpeech.synthesizeSpeech(text, {
        voice: {
          languageCode,
          name: voiceName
        },
        audioConfig: {
          speakingRate: platform === 'watchos' ? 1.1 : 1.0, // Slightly faster for watch
          pitch: 0.0,
          volumeGainDb: 0.0
        }
      });
      
      if (ttsResult.success) {
        return {
          audioBase64: ttsResult.audioBase64,
          audioSize: ttsResult.audioSize,
          voiceConfig: ttsResult.voiceConfig
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Voice response generation failed:', error);
      return null;
    }
  }
  
  // Platform-specific voice selection
  getVoiceName(platform, languageCode) {
    const voices = {
      'en-US': {
        ios: 'en-US-Neural2-F',
        watchos: 'en-US-Neural2-C', // Clearer for small speakers
        web: 'en-US-Neural2-F'
      },
      'en-GB': {
        ios: 'en-GB-Neural2-A',
        watchos: 'en-GB-Neural2-B',
        web: 'en-GB-Neural2-A'
      }
    };
    
    return voices[languageCode]?.[platform] || voices['en-US'][platform] || 'en-US-Neural2-F';
  }
  
  // Haptic feedback patterns
  getHapticPattern(intent) {
    const patterns = {
      'calendar.create': 'success',
      'calendar.update': 'light',
      'email.send': 'medium',
      'task.create': 'light',
      'weather.query': 'light',
      'error': 'error',
      'default': 'light'
    };
    
    return patterns[intent] || patterns.default;
  }
}

// Validation middleware
const processVoiceValidation = [
  body('text').notEmpty().withMessage('Text is required'),
  body('sessionId').optional().isString().withMessage('Session ID must be a string'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  body('generateAudio').optional().isBoolean().withMessage('Generate audio must be boolean')
];

const processVoiceAudioValidation = [
  body('sessionId').optional().isString().withMessage('Session ID must be a string'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  body('platform').optional().isString().withMessage('Platform must be a string'),
  body('reason').optional().isString().withMessage('Reason must be a string')
];

const processTextValidation = [
  body('text').notEmpty().withMessage('Text is required'),
  body('context').optional().isObject().withMessage('Context must be an object'),
  body('platform').optional().isString().withMessage('Platform must be a string')
];

const synthesizeSpeechValidation = [
  body('text').notEmpty().withMessage('Text is required'),
  body('voice').optional().isObject().withMessage('Voice config must be an object'),
  body('audio').optional().isObject().withMessage('Audio config must be an object')
];

const controller = new VoiceController();

module.exports = {
  controller,
  processVoiceValidation,
  processVoiceAudioValidation,
  processTextValidation,
  synthesizeSpeechValidation
};