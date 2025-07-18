const express = require('express');
const router = express.Router();
const { authenticateToken: authenticate, requireRole: authorize } = require('../services/auth/middleware');
const queueService = require('../services/queue');
const logger = require('../utils/logger');

// Get all queues status
router.get('/status', authenticate, async (req, res) => {
  try {
    const status = await queueService.getAllQueuesStatus();
    res.json({ success: true, queues: status });
  } catch (error) {
    logger.error('Error getting queue status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get queue status' 
    });
  }
});

// Get specific queue status
router.get('/status/:queueName', authenticate, async (req, res) => {
  try {
    const { queueName } = req.params;
    const status = await queueService.getQueueStatus(queueName);
    
    if (!status) {
      return res.status(404).json({ 
        success: false, 
        error: 'Queue not found' 
      });
    }
    
    res.json({ success: true, queue: status });
  } catch (error) {
    logger.error('Error getting queue status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get queue status' 
    });
  }
});

// Clean queue (admin only)
router.post('/clean/:queueName', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { queueName } = req.params;
    const { grace = 0, limit = 0, status = 'completed' } = req.body;
    
    await queueService.cleanQueue(queueName, grace, limit, status);
    
    res.json({ 
      success: true, 
      message: `Cleaned ${status} jobs from queue ${queueName}` 
    });
  } catch (error) {
    logger.error('Error cleaning queue:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clean queue' 
    });
  }
});

// Pause queue (admin only)
router.post('/pause/:queueName', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { queueName } = req.params;
    await queueService.pauseQueue(queueName);
    
    res.json({ 
      success: true, 
      message: `Paused queue ${queueName}` 
    });
  } catch (error) {
    logger.error('Error pausing queue:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to pause queue' 
    });
  }
});

// Resume queue (admin only)
router.post('/resume/:queueName', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { queueName } = req.params;
    await queueService.resumeQueue(queueName);
    
    res.json({ 
      success: true, 
      message: `Resumed queue ${queueName}` 
    });
  } catch (error) {
    logger.error('Error resuming queue:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to resume queue' 
    });
  }
});

// Add job to queue (internal use)
router.post('/job', authenticate, async (req, res) => {
  try {
    const { queueName, jobType, data, options } = req.body;
    
    if (!queueName || !jobType || !data) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: queueName, jobType, data' 
      });
    }
    
    const job = await queueService.addJob(queueName, jobType, data, options);
    
    if (!job) {
      return res.status(400).json({ 
        success: false, 
        error: 'Failed to add job to queue' 
      });
    }
    
    res.json({ 
      success: true, 
      job: {
        id: job.id,
        name: job.name,
        data: job.data,
        opts: job.opts
      }
    });
  } catch (error) {
    logger.error('Error adding job to queue:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add job to queue' 
    });
  }
});

// Trigger sync jobs
router.post('/sync/:type', authenticate, async (req, res) => {
  try {
    const { type } = req.params;
    const userId = req.user.id;
    
    let job;
    switch (type) {
      case 'emails':
        job = await queueService.syncEmails(userId);
        break;
      case 'calendar':
        job = await queueService.syncCalendar(userId);
        break;
      case 'tasks':
        job = await queueService.syncTasks(userId);
        break;
      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid sync type. Use: emails, calendar, or tasks' 
        });
    }
    
    res.json({ 
      success: true, 
      message: `${type} sync job queued`,
      jobId: job?.id
    });
  } catch (error) {
    logger.error(`Error triggering ${type} sync:`, error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to trigger ${type} sync` 
    });
  }
});

module.exports = router;