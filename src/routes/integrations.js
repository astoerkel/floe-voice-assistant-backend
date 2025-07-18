const express = require('express');
const router = express.Router();
const integrationsController = require('../controllers/integrations.controller');
const { authenticateToken } = require('../services/auth/middleware');

// Calendar endpoints
router.get('/calendar/events', authenticateToken, integrationsController.getCalendarEvents);
router.post('/calendar/events', authenticateToken, integrationsController.createCalendarEvent);
router.put('/calendar/events/:eventId', authenticateToken, integrationsController.updateCalendarEvent);
router.delete('/calendar/events/:eventId', authenticateToken, integrationsController.deleteCalendarEvent);

// Email endpoints
router.get('/email/messages', authenticateToken, integrationsController.getEmails);
router.get('/email/messages/:emailId', authenticateToken, integrationsController.getEmail);
router.post('/email/send', authenticateToken, integrationsController.sendEmail);
router.post('/email/messages/:emailId/reply', authenticateToken, integrationsController.replyToEmail);

// Task endpoints
router.get('/tasks', authenticateToken, integrationsController.getTasks);
router.get('/tasks/:taskId', authenticateToken, integrationsController.getTask);
router.post('/tasks', authenticateToken, integrationsController.createTask);
router.put('/tasks/:taskId', authenticateToken, integrationsController.updateTask);
router.delete('/tasks/:taskId', authenticateToken, integrationsController.deleteTask);

// Integration status (allow unauthenticated requests)
router.get('/:type/status', integrationsController.getIntegrationStatus);

module.exports = router;