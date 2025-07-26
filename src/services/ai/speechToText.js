const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const logger = require('../../utils/logger');

class SpeechToTextService {
  constructor() {
    // Only initialize OpenAI if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    } else {
      logger.info('OpenAI API key not provided - Whisper transcription will be disabled');
      this.openai = null;
    }
  }

  async transcribeAudio(audioBuffer, options = {}) {
    try {
      // Check if OpenAI is available
      if (!this.openai) {
        logger.warn('OpenAI not available - cannot transcribe audio');
        return {
          text: '',
          confidence: 0,
          processingTime: 0,
          source: 'unavailable',
          error: 'OpenAI Whisper not configured'
        };
      }

      const startTime = Date.now();
      
      // Default options
      const defaultOptions = {
        model: 'whisper-1',
        language: 'en',
        response_format: 'json',
        temperature: 0
      };

      const transcriptionOptions = { ...defaultOptions, ...options };

      // Create temporary file for OpenAI API
      const tempDir = process.env.TEMP_DIR || '/tmp';
      const tempFilePath = path.join(tempDir, `audio_${Date.now()}.wav`);
      
      // Write audio buffer to temporary file
      fs.writeFileSync(tempFilePath, audioBuffer);

      logger.info('Starting audio transcription', {
        fileSize: audioBuffer.length,
        options: transcriptionOptions
      });

      // Transcribe using OpenAI Whisper
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: transcriptionOptions.model,
        language: transcriptionOptions.language,
        response_format: transcriptionOptions.response_format,
        temperature: transcriptionOptions.temperature
      });

      // Clean up temporary file
      fs.unlinkSync(tempFilePath);

      const processingTime = Date.now() - startTime;
      
      logger.info('Audio transcription completed', {
        processingTime,
        textLength: transcription.text?.length || 0,
        confidence: transcription.confidence || 'unknown'
      });

      return {
        success: true,
        text: transcription.text,
        confidence: transcription.confidence,
        language: transcription.language || transcriptionOptions.language,
        processingTime,
        model: transcriptionOptions.model
      };
    } catch (error) {
      logger.error('Speech-to-text transcription failed:', error);
      
      // Clean up temporary file if it exists
      try {
        const tempDir = process.env.TEMP_DIR || '/tmp';
        const tempFilePath = path.join(tempDir, `audio_${Date.now()}.wav`);
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        logger.error('Failed to clean up temporary file:', cleanupError);
      }

      return {
        success: false,
        error: error.message,
        text: '',
        confidence: 0,
        processingTime: 0
      };
    }
  }

  async transcribeFromFile(filePath, options = {}) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Audio file not found: ${filePath}`);
      }

      const audioBuffer = fs.readFileSync(filePath);
      return await this.transcribeAudio(audioBuffer, options);
    } catch (error) {
      logger.error('File transcription failed:', error);
      return {
        success: false,
        error: error.message,
        text: '',
        confidence: 0,
        processingTime: 0
      };
    }
  }

  async transcribeFromBase64(base64Audio, options = {}) {
    try {
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(base64Audio, 'base64');
      return await this.transcribeAudio(audioBuffer, options);
    } catch (error) {
      logger.error('Base64 transcription failed:', error);
      return {
        success: false,
        error: error.message,
        text: '',
        confidence: 0,
        processingTime: 0
      };
    }
  }

  async batchTranscribe(audioBuffers, options = {}) {
    try {
      const results = [];
      
      for (let i = 0; i < audioBuffers.length; i++) {
        const result = await this.transcribeAudio(audioBuffers[i], {
          ...options,
          batchIndex: i
        });
        results.push(result);
      }

      const successCount = results.filter(r => r.success).length;
      const totalProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0);

      logger.info('Batch transcription completed', {
        totalFiles: audioBuffers.length,
        successCount,
        failureCount: audioBuffers.length - successCount,
        totalProcessingTime
      });

      return {
        success: true,
        results,
        summary: {
          totalFiles: audioBuffers.length,
          successCount,
          failureCount: audioBuffers.length - successCount,
          totalProcessingTime
        }
      };
    } catch (error) {
      logger.error('Batch transcription failed:', error);
      return {
        success: false,
        error: error.message,
        results: [],
        summary: null
      };
    }
  }

  getSupportedLanguages() {
    return [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
      'ar', 'hi', 'th', 'vi', 'tr', 'pl', 'nl', 'sv', 'da', 'no',
      'fi', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sr', 'sl', 'et',
      'lv', 'lt', 'mt', 'cy', 'is', 'mk', 'sq', 'lv', 'eu', 'gl',
      'ca', 'ast', 'an', 'oc', 'br', 'co', 'wa', 'li', 'lb', 'rm',
      'fur', 'lld', 'sc', 'vec', 'nap', 'scn', 'lij', 'pms', 'rgn'
    ];
  }

  validateAudioFormat(audioBuffer) {
    try {
      // Check for common audio format headers
      const header = audioBuffer.slice(0, 12);
      
      // WAV format
      if (header.slice(0, 4).toString() === 'RIFF' && header.slice(8, 12).toString() === 'WAVE') {
        return { valid: true, format: 'wav' };
      }
      
      // MP3 format
      if (header.slice(0, 3).toString() === 'ID3' || (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0)) {
        return { valid: true, format: 'mp3' };
      }
      
      // M4A/AAC format
      if (header.slice(4, 8).toString() === 'ftyp') {
        return { valid: true, format: 'm4a' };
      }
      
      // OGG format
      if (header.slice(0, 4).toString() === 'OggS') {
        return { valid: true, format: 'ogg' };
      }
      
      // FLAC format
      if (header.slice(0, 4).toString() === 'fLaC') {
        return { valid: true, format: 'flac' };
      }
      
      return { valid: false, format: 'unknown' };
    } catch (error) {
      logger.error('Audio format validation failed:', error);
      return { valid: false, format: 'unknown', error: error.message };
    }
  }

  async getTranscriptionStats(userId, timeRange = '24h') {
    try {
      // This would typically query the database for user statistics
      // For now, return mock data
      return {
        totalTranscriptions: 0,
        totalAudioTime: 0,
        averageConfidence: 0,
        topLanguages: ['en'],
        timeRange
      };
    } catch (error) {
      logger.error('Failed to get transcription stats:', error);
      return null;
    }
  }
}

module.exports = new SpeechToTextService();