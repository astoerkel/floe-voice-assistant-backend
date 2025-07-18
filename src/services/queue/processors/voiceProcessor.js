const logger = require('../../../utils/logger');
const { JOB_TYPES } = require('../config');
const coordinatorAgent = require('../../agents/coordinatorAgent');
const { prisma } = require('../../../config/database');

const processJob = async (job) => {
  const { name, data } = job;
  logger.info(`Processing voice job: ${name}`, { jobId: job.id });
  
  try {
    switch (name) {
      case JOB_TYPES.PROCESS_VOICE_COMMAND:
        return await processVoiceCommand(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  } catch (error) {
    logger.error(`Error processing voice job ${job.id}:`, error);
    throw error;
  }
};

const processVoiceCommand = async (data) => {
  const { userId, text, conversationId, integrations } = data;
  
  try {
    // Create voice command record
    const voiceCommand = await prisma.voiceCommand.create({
      data: {
        userId,
        transcription: text,
        conversationId,
        status: 'processing'
      }
    });
    
    // Process with coordinator agent
    const result = await coordinatorAgent.processCommand(
      text,
      userId,
      conversationId,
      integrations
    );
    
    // Update voice command with result
    await prisma.voiceCommand.update({
      where: { id: voiceCommand.id },
      data: {
        response: result.text,
        responseAudio: result.audio,
        status: 'completed',
        completedAt: new Date()
      }
    });
    
    // Save conversation message
    await prisma.conversationMessage.create({
      data: {
        conversationId,
        role: 'user',
        content: text
      }
    });
    
    await prisma.conversationMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: result.text,
        audioData: result.audio
      }
    });
    
    return {
      voiceCommandId: voiceCommand.id,
      response: result
    };
  } catch (error) {
    logger.error('Error processing voice command:', error);
    
    // Update status to failed
    if (data.voiceCommandId) {
      await prisma.voiceCommand.update({
        where: { id: data.voiceCommandId },
        data: {
          status: 'failed',
          error: error.message
        }
      });
    }
    
    throw error;
  }
};

module.exports = processJob;