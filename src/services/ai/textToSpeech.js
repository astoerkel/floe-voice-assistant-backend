const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

class TextToSpeechService {
  constructor() {
    // In Cloud Run, use default credentials instead of keyFilename
    const clientConfig = {
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'floe-voice-assistant'
    };
    
    // Only add keyFilename if it exists and we're not in Cloud Run
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.K_SERVICE) {
      clientConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    
    this.client = new textToSpeech.TextToSpeechClient(clientConfig);
    
    // Default voice configurations
    this.defaultVoiceConfig = {
      languageCode: 'en-US',
      name: 'en-US-Journey-F',
      ssmlGender: 'FEMALE'
    };
    
    this.defaultAudioConfig = {
      audioEncoding: 'MP3',
      speakingRate: 1.0,
      pitch: 0.0,
      volumeGainDb: 0.0
    };
  }

  async synthesizeSpeech(text, options = {}) {
    try {
      const startTime = Date.now();
      
      // Merge options with defaults
      const voiceConfig = { ...this.defaultVoiceConfig, ...options.voice };
      const audioConfig = { ...this.defaultAudioConfig, ...options.audio };
      
      // Prepare the request
      const request = {
        input: { text },
        voice: voiceConfig,
        audioConfig
      };

      logger.info('Starting text-to-speech synthesis', {
        textLength: text.length,
        voiceConfig,
        audioConfig
      });

      // Perform the text-to-speech request
      const [response] = await this.client.synthesizeSpeech(request);
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Text-to-speech synthesis completed', {
        processingTime,
        audioSize: response.audioContent.length,
        voice: voiceConfig.name
      });

      return {
        success: true,
        audioContent: response.audioContent,
        audioBase64: response.audioContent.toString('base64'),
        voiceConfig,
        audioConfig,
        processingTime,
        audioSize: response.audioContent.length
      };
    } catch (error) {
      logger.error('Text-to-speech synthesis failed:', error);
      return {
        success: false,
        error: error.message,
        audioContent: null,
        audioBase64: null,
        processingTime: 0
      };
    }
  }

  async synthesizeSSML(ssmlText, options = {}) {
    try {
      const startTime = Date.now();
      
      // Merge options with defaults
      const voiceConfig = { ...this.defaultVoiceConfig, ...options.voice };
      const audioConfig = { ...this.defaultAudioConfig, ...options.audio };
      
      // Prepare the request with SSML
      const request = {
        input: { ssml: ssmlText },
        voice: voiceConfig,
        audioConfig
      };

      logger.info('Starting SSML text-to-speech synthesis', {
        ssmlLength: ssmlText.length,
        voiceConfig,
        audioConfig
      });

      // Perform the text-to-speech request
      const [response] = await this.client.synthesizeSpeech(request);
      
      const processingTime = Date.now() - startTime;
      
      logger.info('SSML text-to-speech synthesis completed', {
        processingTime,
        audioSize: response.audioContent.length,
        voice: voiceConfig.name
      });

      return {
        success: true,
        audioContent: response.audioContent,
        audioBase64: response.audioContent.toString('base64'),
        voiceConfig,
        audioConfig,
        processingTime,
        audioSize: response.audioContent.length
      };
    } catch (error) {
      logger.error('SSML text-to-speech synthesis failed:', error);
      return {
        success: false,
        error: error.message,
        audioContent: null,
        audioBase64: null,
        processingTime: 0
      };
    }
  }

  async synthesizeToFile(text, filePath, options = {}) {
    try {
      const result = await this.synthesizeSpeech(text, options);
      
      if (!result.success) {
        return result;
      }

      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write audio file
      fs.writeFileSync(filePath, result.audioContent);
      
      logger.info('Audio file saved successfully', {
        filePath,
        audioSize: result.audioSize
      });

      return {
        ...result,
        filePath,
        fileSize: result.audioSize
      };
    } catch (error) {
      logger.error('Failed to save audio file:', error);
      return {
        success: false,
        error: error.message,
        filePath: null,
        fileSize: 0
      };
    }
  }

  async batchSynthesize(texts, options = {}) {
    try {
      const results = [];
      
      for (let i = 0; i < texts.length; i++) {
        const result = await this.synthesizeSpeech(texts[i], {
          ...options,
          batchIndex: i
        });
        results.push(result);
      }

      const successCount = results.filter(r => r.success).length;
      const totalProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0);
      const totalAudioSize = results.reduce((sum, r) => sum + (r.audioSize || 0), 0);

      logger.info('Batch text-to-speech synthesis completed', {
        totalTexts: texts.length,
        successCount,
        failureCount: texts.length - successCount,
        totalProcessingTime,
        totalAudioSize
      });

      return {
        success: true,
        results,
        summary: {
          totalTexts: texts.length,
          successCount,
          failureCount: texts.length - successCount,
          totalProcessingTime,
          totalAudioSize
        }
      };
    } catch (error) {
      logger.error('Batch text-to-speech synthesis failed:', error);
      return {
        success: false,
        error: error.message,
        results: [],
        summary: null
      };
    }
  }

  async getAvailableVoices(languageCode = 'en-US') {
    try {
      const [response] = await this.client.listVoices({
        languageCode
      });

      const voices = response.voices.map(voice => ({
        name: voice.name,
        languageCode: voice.languageCodes[0],
        ssmlGender: voice.ssmlGender,
        naturalSampleRateHertz: voice.naturalSampleRateHertz
      }));

      logger.info('Retrieved available voices', {
        languageCode,
        voiceCount: voices.length
      });

      return {
        success: true,
        voices,
        languageCode
      };
    } catch (error) {
      logger.error('Failed to get available voices:', error);
      return {
        success: false,
        error: error.message,
        voices: [],
        languageCode
      };
    }
  }

  createSSMLWithEmphasis(text, emphasis = 'moderate') {
    return `<speak><emphasis level="${emphasis}">${text}</emphasis></speak>`;
  }

  createSSMLWithBreaks(text, pauseTime = '1s') {
    return `<speak>${text}<break time="${pauseTime}"/></speak>`;
  }

  createSSMLWithProsody(text, options = {}) {
    const { rate = 'medium', pitch = 'medium', volume = 'medium' } = options;
    return `<speak><prosody rate="${rate}" pitch="${pitch}" volume="${volume}">${text}</prosody></speak>`;
  }

  createConversationalSSML(text, emotion = 'neutral') {
    const emotionMap = {
      neutral: '',
      happy: '<prosody rate="medium" pitch="+2st">',
      sad: '<prosody rate="slow" pitch="-2st">',
      excited: '<prosody rate="fast" pitch="+5st">',
      calm: '<prosody rate="slow" pitch="-1st">'
    };

    const openTag = emotionMap[emotion] || '';
    const closeTag = openTag ? '</prosody>' : '';
    
    return `<speak>${openTag}${text}${closeTag}</speak>`;
  }

  async synthesizeWithEmotion(text, emotion = 'neutral', options = {}) {
    const ssmlText = this.createConversationalSSML(text, emotion);
    return await this.synthesizeSSML(ssmlText, options);
  }

  validateText(text) {
    if (!text || typeof text !== 'string') {
      return { valid: false, error: 'Text must be a non-empty string' };
    }
    
    if (text.length > 5000) {
      return { valid: false, error: 'Text is too long (max 5000 characters)' };
    }
    
    return { valid: true };
  }

  async getUsageStats(userId, timeRange = '24h') {
    try {
      // This would typically query the database for user statistics
      // For now, return mock data
      return {
        totalSyntheses: 0,
        totalCharacters: 0,
        totalAudioTime: 0,
        topVoices: ['en-US-Journey-F'],
        timeRange
      };
    } catch (error) {
      logger.error('Failed to get usage stats:', error);
      return null;
    }
  }

  getSupportedLanguages() {
    return [
      'en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IN',
      'es-ES', 'es-US', 'fr-FR', 'fr-CA', 'de-DE',
      'it-IT', 'pt-BR', 'pt-PT', 'ru-RU', 'ja-JP',
      'ko-KR', 'zh-CN', 'zh-TW', 'ar-XA', 'hi-IN',
      'th-TH', 'vi-VN', 'tr-TR', 'pl-PL', 'nl-NL',
      'sv-SE', 'da-DK', 'no-NO', 'fi-FI', 'cs-CZ',
      'sk-SK', 'hu-HU', 'ro-RO', 'bg-BG', 'hr-HR',
      'sr-RS', 'sl-SI', 'et-EE', 'lv-LV', 'lt-LT',
      'mt-MT', 'cy-GB', 'is-IS', 'mk-MK', 'sq-AL'
    ];
  }

  getRecommendedVoice(language = 'en-US', gender = 'female') {
    const voiceMap = {
      'en-US': {
        female: 'en-US-Journey-F',
        male: 'en-US-Journey-M'
      },
      'en-GB': {
        female: 'en-GB-Journey-F',
        male: 'en-GB-Journey-M'
      },
      'es-US': {
        female: 'es-US-Journey-F',
        male: 'es-US-Journey-M'
      },
      'fr-FR': {
        female: 'fr-FR-Journey-F',
        male: 'fr-FR-Journey-M'
      },
      'de-DE': {
        female: 'de-DE-Journey-F',
        male: 'de-DE-Journey-M'
      }
    };

    const languageVoices = voiceMap[language] || voiceMap['en-US'];
    return languageVoices[gender.toLowerCase()] || languageVoices.female;
  }
}

module.exports = new TextToSpeechService();