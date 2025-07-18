const logger = require('../../../utils/logger');
const { JOB_TYPES } = require('../config');
const langchainService = require('../../ai/langchain');
const coordinatorAgent = require('../../agents/coordinatorAgent');
const { prisma } = require('../../../config/database');

const processJob = async (job) => {
  const { name, data } = job;
  logger.info(`Processing AI job: ${name}`, { jobId: job.id });
  
  try {
    switch (name) {
      case JOB_TYPES.PROCESS_AI_REQUEST:
        return await processAIRequest(data);
      case JOB_TYPES.BATCH_AI_PROCESSING:
        return await batchAIProcessing(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  } catch (error) {
    logger.error(`Error processing AI job ${job.id}:`, error);
    throw error;
  }
};

const processAIRequest = async (data) => {
  const { userId, prompt, conversationId, model = 'gpt-4', temperature = 0.7 } = data;
  
  try {
    // Get user context
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        integrations: {
          where: { active: true }
        }
      }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Process with coordinator agent if conversationId provided
    if (conversationId) {
      const result = await coordinatorAgent.processCommand(
        prompt,
        userId,
        conversationId,
        user.integrations
      );
      
      // Save conversation messages
      await prisma.conversationMessage.create({
        data: {
          conversationId,
          role: 'user',
          content: prompt
        }
      });
      
      await prisma.conversationMessage.create({
        data: {
          conversationId,
          role: 'assistant',
          content: result.text
        }
      });
      
      return result;
    }
    
    // Otherwise use direct LangChain processing
    const response = await langchainService.chat({
      messages: [{ role: 'user', content: prompt }],
      model,
      temperature,
      userId
    });
    
    return {
      text: response.content,
      model: response.model,
      usage: response.usage
    };
  } catch (error) {
    logger.error('Error processing AI request:', error);
    throw error;
  }
};

const batchAIProcessing = async (data) => {
  const { requests } = data;
  const results = [];
  
  try {
    // Process requests in batches
    const batchSize = 5;
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (request) => {
          try {
            const response = await langchainService.chat({
              messages: [{ role: 'user', content: request.prompt }],
              model: request.model || 'gpt-4',
              temperature: request.temperature || 0.7,
              userId: request.userId
            });
            
            return {
              requestId: request.id,
              success: true,
              response: {
                text: response.content,
                model: response.model,
                usage: response.usage
              }
            };
          } catch (error) {
            logger.error(`Error processing batch request ${request.id}:`, error);
            return {
              requestId: request.id,
              success: false,
              error: error.message
            };
          }
        })
      );
      
      results.push(...batchResults);
      
      // Add delay between batches to avoid rate limits
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Log batch processing results
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    logger.info(`Batch AI processing completed: ${successCount} successful, ${failureCount} failed`);
    
    return {
      total: requests.length,
      successful: successCount,
      failed: failureCount,
      results
    };
  } catch (error) {
    logger.error('Error in batch AI processing:', error);
    throw error;
  }
};

module.exports = processJob;