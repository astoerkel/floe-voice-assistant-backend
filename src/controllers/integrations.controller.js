const GoogleCalendarService = require('../services/integrations/google/calendar');
const GmailService = require('../services/integrations/google/gmail');
const airtableService = require('../services/integrations/airtable/tasks'); // This is already an instance
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

class IntegrationsController {
    constructor() {
        this.calendarService = new GoogleCalendarService();
        this.gmailService = new GmailService();
        this.airtableService = airtableService; // Use the exported instance directly
    }
    
    // Calendar endpoints
    async getCalendarEvents(req, res) {
        try {
            const { timeMin, timeMax, maxResults = 25 } = req.query;
            
            const events = await this.calendarService.listEvents(req.user.id, {
                timeMin: timeMin || new Date().toISOString(),
                timeMax,
                maxResults: parseInt(maxResults)
            });
            
            res.json({
                success: true,
                events: events
            });
        } catch (error) {
            logger.error('Get calendar events error:', error);
            res.status(500).json({
                error: 'Failed to fetch calendar events',
                message: error.message
            });
        }
    }
    
    async createCalendarEvent(req, res) {
        try {
            const { summary, start, end, description, attendees } = req.body;
            
            if (!summary || !start || !end) {
                return res.status(400).json({
                    error: 'Missing required fields: summary, start, end'
                });
            }
            
            const event = await this.calendarService.createEvent(req.user.id, {
                summary,
                description,
                start: { dateTime: start },
                end: { dateTime: end },
                attendees: attendees || []
            });
            
            res.json({
                success: true,
                event: event
            });
        } catch (error) {
            logger.error('Create calendar event error:', error);
            res.status(500).json({
                error: 'Failed to create calendar event',
                message: error.message
            });
        }
    }
    
    async updateCalendarEvent(req, res) {
        try {
            const { eventId } = req.params;
            const { summary, start, end, description, attendees } = req.body;
            
            const event = await this.calendarService.updateEvent(req.user.id, eventId, {
                summary,
                description,
                start: start ? { dateTime: start } : undefined,
                end: end ? { dateTime: end } : undefined,
                attendees: attendees
            });
            
            res.json({
                success: true,
                event: event
            });
        } catch (error) {
            logger.error('Update calendar event error:', error);
            res.status(500).json({
                error: 'Failed to update calendar event',
                message: error.message
            });
        }
    }
    
    async deleteCalendarEvent(req, res) {
        try {
            const { eventId } = req.params;
            
            await this.calendarService.deleteEvent(req.user.id, eventId);
            
            res.json({
                success: true,
                message: 'Calendar event deleted successfully'
            });
        } catch (error) {
            logger.error('Delete calendar event error:', error);
            res.status(500).json({
                error: 'Failed to delete calendar event',
                message: error.message
            });
        }
    }
    
    // Email endpoints
    async getEmails(req, res) {
        try {
            const { q, maxResults = 10 } = req.query;
            
            const emails = await this.gmailService.listMessages(req.user.id, {
                q,
                maxResults: parseInt(maxResults)
            });
            
            res.json({
                success: true,
                emails: emails
            });
        } catch (error) {
            logger.error('Get emails error:', error);
            res.status(500).json({
                error: 'Failed to fetch emails',
                message: error.message
            });
        }
    }
    
    async getEmail(req, res) {
        try {
            const { emailId } = req.params;
            
            const email = await this.gmailService.getMessage(req.user.id, emailId);
            
            res.json({
                success: true,
                email: email
            });
        } catch (error) {
            logger.error('Get email error:', error);
            res.status(500).json({
                error: 'Failed to fetch email',
                message: error.message
            });
        }
    }
    
    async sendEmail(req, res) {
        try {
            const { to, subject, body, html } = req.body;
            
            if (!to || !subject || !body) {
                return res.status(400).json({
                    error: 'Missing required fields: to, subject, body'
                });
            }
            
            const result = await this.gmailService.sendEmail(req.user.id, {
                to,
                subject,
                body,
                html
            });
            
            res.json({
                success: true,
                messageId: result.id
            });
        } catch (error) {
            logger.error('Send email error:', error);
            res.status(500).json({
                error: 'Failed to send email',
                message: error.message
            });
        }
    }
    
    async replyToEmail(req, res) {
        try {
            const { emailId } = req.params;
            const { body, html } = req.body;
            
            if (!body) {
                return res.status(400).json({
                    error: 'Missing required field: body'
                });
            }
            
            const result = await this.gmailService.replyToEmail(req.user.id, emailId, {
                body,
                html
            });
            
            res.json({
                success: true,
                messageId: result.id
            });
        } catch (error) {
            logger.error('Reply to email error:', error);
            res.status(500).json({
                error: 'Failed to reply to email',
                message: error.message
            });
        }
    }
    
    // Task endpoints
    async getTasks(req, res) {
        try {
            const { status, category, priority } = req.query;
            
            const tasks = await this.airtableService.listTasks(req.user.id, {
                status,
                category,
                priority
            });
            
            res.json({
                success: true,
                tasks: tasks
            });
        } catch (error) {
            logger.error('Get tasks error:', error);
            res.status(500).json({
                error: 'Failed to fetch tasks',
                message: error.message
            });
        }
    }
    
    async getTask(req, res) {
        try {
            const { taskId } = req.params;
            
            const task = await this.airtableService.getTask(req.user.id, taskId);
            
            res.json({
                success: true,
                task: task
            });
        } catch (error) {
            logger.error('Get task error:', error);
            res.status(500).json({
                error: 'Failed to fetch task',
                message: error.message
            });
        }
    }
    
    async createTask(req, res) {
        try {
            const { title, description, priority, category, context, dueDate } = req.body;
            
            if (!title) {
                return res.status(400).json({
                    error: 'Title is required'
                });
            }
            
            const task = await this.airtableService.createTask(req.user.id, {
                title,
                description,
                priority: priority || 'Normal',
                category: category || 'Personal',
                context: context || '@anywhere',
                dueDate
            });
            
            res.json({
                success: true,
                task: task
            });
        } catch (error) {
            logger.error('Create task error:', error);
            res.status(500).json({
                error: 'Failed to create task',
                message: error.message
            });
        }
    }
    
    async updateTask(req, res) {
        try {
            const { taskId } = req.params;
            const { title, description, priority, category, context, dueDate, status } = req.body;
            
            const task = await this.airtableService.updateTask(req.user.id, taskId, {
                title,
                description,
                priority,
                category,
                context,
                dueDate,
                status
            });
            
            res.json({
                success: true,
                task: task
            });
        } catch (error) {
            logger.error('Update task error:', error);
            res.status(500).json({
                error: 'Failed to update task',
                message: error.message
            });
        }
    }
    
    async deleteTask(req, res) {
        try {
            const { taskId } = req.params;
            
            await this.airtableService.deleteTask(req.user.id, taskId);
            
            res.json({
                success: true,
                message: 'Task deleted successfully'
            });
        } catch (error) {
            logger.error('Delete task error:', error);
            res.status(500).json({
                error: 'Failed to delete task',
                message: error.message
            });
        }
    }
    
    // Integration status endpoints
    async getIntegrationStatus(req, res) {
        try {
            const { type } = req.params;
            
            // If user is not authenticated, return not connected status
            if (!req.user || !req.user.id) {
                return res.json({
                    success: true,
                    integration: {
                        type: type,
                        isActive: false,
                        isConnected: false,
                        status: 'not_authenticated'
                    }
                });
            }
            
            const integration = await prisma.integration.findUnique({
                where: {
                    userId_type: {
                        userId: req.user.id,
                        type: type
                    }
                },
                select: {
                    id: true,
                    type: true,
                    isActive: true,
                    lastSyncAt: true,
                    createdAt: true,
                    expiresAt: true,
                    syncErrors: true
                }
            });
            
            if (!integration) {
                return res.json({
                    success: true,
                    integration: {
                        type: type,
                        isActive: false,
                        isConnected: false,
                        status: 'not_connected'
                    }
                });
            }
            
            res.json({
                success: true,
                integration: integration
            });
        } catch (error) {
            logger.error('Get integration status error:', error);
            res.status(500).json({
                error: 'Failed to get integration status',
                message: error.message
            });
        }
    }
}

module.exports = new IntegrationsController();