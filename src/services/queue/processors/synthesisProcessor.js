const logger = require('../../../utils/logger');
const { JOB_TYPES } = require('../config');
const textToSpeech = require('../../ai/textToSpeech');
const { prisma } = require('../../../config/database');

const processJob = async (job) => {
  const { name, data } = job;
  logger.info(`Processing synthesis job: ${name}`, { jobId: job.id });
  
  try {
    switch (name) {
      case JOB_TYPES.SYNTHESIZE_SPEECH:
        return await synthesizeSpeech(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  } catch (error) {
    logger.error(`Error processing synthesis job ${job.id}:`, error);
    throw error;
  }
};

const synthesizeSpeech = async (data) => {
  const { 
    text, 
    voice = 'en-GB-Chirp3-HD-Sulafat', 
    speed = 1.0, 
    pitch = 0,
    format = 'mp3',
    conversationId,
    messageId
  } = data;
  
  try {
    // Synthesize speech
    const audioResult = await textToSpeech.synthesize(text, {
      voice,
      speed,
      pitch,
      format
    });
    
    // Update message with audio if messageId provided
    if (messageId) {
      await prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          audioData: audioResult.audioContent
        }
      });
    }
    
    return {
      audioContent: audioResult.audioContent,
      format: audioResult.format,
      duration: audioResult.duration,
      voice: audioResult.voice
    };
  } catch (error) {
    logger.error('Error synthesizing speech:', error);
    throw error;
  }
};

module.exports = processJob;