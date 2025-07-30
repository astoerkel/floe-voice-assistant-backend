const { google } = require('googleapis');
const db = require('../../../config/databasePool');
const logger = require('../../../utils/logger');
const GoogleOAuthService = require('../../oauth/googleOAuth.production');

class GoogleCalendarIntegrationProduction {
  constructor() {
    this.serviceName = 'google_calendar';
    this.googleOAuthService = new GoogleOAuthService();
  }

  async listEvents(userId, options = {}) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      const timeMin = options.timeMin || new Date().toISOString();
      const timeMax = options.timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const maxResults = options.maxResults || 10;

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      });

      return response.data.items.map(event => ({
        id: event.id,
        summary: event.summary || 'No title',
        description: event.description,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location,
        attendees: event.attendees?.map(a => ({
          email: a.email,
          displayName: a.displayName,
          responseStatus: a.responseStatus
        })) || [],
        status: event.status,
        htmlLink: event.htmlLink
      }));
    } catch (error) {
      logger.error('Calendar API error:', error);
      if (error.code === 401) {
        throw new Error('Google authentication expired. Please reconnect.');
      }
      throw error;
    }
  }

  async createEvent(userId, eventData) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      const event = {
        summary: eventData.summary,
        description: eventData.description,
        start: eventData.start || {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || 'America/New_York'
        },
        end: eventData.end || {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || 'America/New_York'
        },
        location: eventData.location,
        attendees: eventData.attendees?.map(email => 
          typeof email === 'string' ? { email } : email
        ) || [],
        reminders: eventData.reminders || {
          useDefault: true
        }
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        sendNotifications: true
      });

      return {
        id: response.data.id,
        htmlLink: response.data.htmlLink,
        summary: response.data.summary,
        start: response.data.start,
        end: response.data.end
      };
    } catch (error) {
      logger.error('Calendar create error:', error);
      throw error;
    }
  }

  async updateEvent(userId, eventId, updates) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      // Filter out undefined values
      const cleanUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = value;
        }
        return acc;
      }, {});

      const response = await calendar.events.patch({
        calendarId: 'primary',
        eventId: eventId,
        resource: cleanUpdates
      });

      return response.data;
    } catch (error) {
      logger.error('Calendar update error:', error);
      throw error;
    }
  }

  async deleteEvent(userId, eventId) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId
      });

      return { success: true };
    } catch (error) {
      logger.error('Calendar delete error:', error);
      throw error;
    }
  }

  async getEvent(userId, eventId) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      const response = await calendar.events.get({
        calendarId: 'primary',
        eventId: eventId
      });

      return response.data;
    } catch (error) {
      logger.error('Calendar get event error:', error);
      throw error;
    }
  }

  async searchEvents(userId, query, options = {}) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      const response = await calendar.events.list({
        calendarId: 'primary',
        q: query,
        timeMin: options.timeMin || new Date().toISOString(),
        timeMax: options.timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: options.maxResults || 10
      });

      return response.data.items;
    } catch (error) {
      logger.error('Calendar search error:', error);
      throw error;
    }
  }

  async getUpcomingEvents(userId, count = 10) {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    return this.listEvents(userId, {
      timeMin: now.toISOString(),
      timeMax: endOfDay.toISOString(),
      maxResults: count
    });
  }

  async getTodayEvents(userId) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    return this.listEvents(userId, {
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      maxResults: 50
    });
  }

  async isIntegrationActive(userId) {
    try {
      const result = await db.query(
        'SELECT google_services_connected FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0 || !result.rows[0].google_services_connected) {
        logger.info(`Calendar integration not active for user ${userId}`);
        return false;
      }

      // Try to get authenticated client to verify tokens work
      try {
        await this.googleOAuthService.getAuthenticatedClient(userId);
        logger.info(`Calendar integration verified active for user ${userId}`);
        return true;
      } catch (error) {
        logger.error(`Calendar integration token validation failed for user ${userId}:`, error.message);
        // Mark as inactive if tokens don't work
        await db.query(
          'UPDATE users SET google_services_connected = false WHERE id = $1',
          [userId]
        );
        return false;
      }
    } catch (error) {
      logger.error('Failed to check integration status:', error);
      return false;
    }
  }

  getStats() {
    return {
      serviceName: this.serviceName,
      isConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      supportedOperations: [
        'listEvents',
        'createEvent',
        'updateEvent',
        'deleteEvent',
        'getEvent',
        'searchEvents',
        'getUpcomingEvents',
        'getTodayEvents'
      ]
    };
  }
}

module.exports = GoogleCalendarIntegrationProduction;