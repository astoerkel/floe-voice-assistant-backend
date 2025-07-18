const logger = require('../../../utils/logger');
const { JOB_TYPES } = require('../config');
const speechToText = require('../../ai/speechToText');
const { prisma } = require('../../../config/database');

const processJob = async (job) => {
  const { name, data } = job;
  logger.info(`Processing transcription job: ${name}`, { jobId: job.id });
  
  try {
    switch (name) {
      case JOB_TYPES.TRANSCRIBE_AUDIO:
        return await transcribeAudio(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  } catch (error) {
    logger.error(`Error processing transcription job ${job.id}:`, error);
    throw error;
  }
};

const transcribeAudio = async (data) => {
  const { userId, audioBuffer, mimeType, language = 'en', conversationId } = data;
  
  try {
    // Transcribe audio
    const transcription = await speechToText.transcribe(audioBuffer, {
      mimeType,
      language
    });
    
    // Save transcription if conversationId provided
    if (conversationId) {
      await prisma.conversationMessage.create({
        data: {
          conversationId,
          role: 'user',
          content: transcription.text,
          audioData: audioBuffer
        }
      });
    }
    
    return {
      text: transcription.text,
      confidence: transcription.confidence,
      language: transcription.language,
      duration: transcription.duration
    };
  } catch (error) {
    logger.error('Error transcribing audio:', error);
    throw error;
  }
};

module.exports = processJob;