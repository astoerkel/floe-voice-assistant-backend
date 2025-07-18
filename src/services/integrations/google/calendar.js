const { google } = require('googleapis');
const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');

class GoogleCalendarIntegration {
  constructor() {
    this.serviceName = 'google_calendar';
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    this.calendar = google.calendar({
      version: 'v3',
      auth: this.oauth2Client
    });
  }

  async setupIntegration(userId, authCode) {
    try {
      // Exchange authorization code for tokens
      const { tokens } = await this.oauth2Client.getToken(authCode);
      
      // Store tokens in database
      await prisma.integration.upsert({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          isActive: true,
          metadata: {
            scope: tokens.scope,
            tokenType: tokens.token_type
          }
        },
        create: {
          userId,
          type: this.serviceName,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          isActive: true,
          metadata: {
            scope: tokens.scope,
            tokenType: tokens.token_type
          }
        }
      });

      logger.info(`Google Calendar integration setup for user ${userId}`);
      return { success: true, message: 'Google Calendar integration configured successfully' };
    } catch (error) {
      logger.error('Google Calendar integration setup failed:', error);
      return { success: false, error: error.message };
    }
  }

  async getAuthUrl(userId) {
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: userId // Include user ID in state for security
    });

    return authUrl;
  }

  async getAccessToken(userId) {
    try {
      const integration = await prisma.integration.findUnique({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        }
      });

      if (!integration || !integration.isActive) {
        throw new Error('Google Calendar integration not found or inactive');
      }

      // Check if token needs refresh
      if (integration.expiresAt && new Date() >= integration.expiresAt) {
        await this.refreshToken(userId, integration);
        // Fetch updated integration
        return await this.getAccessToken(userId);
      }

      this.oauth2Client.setCredentials({
        access_token: integration.accessToken,
        refresh_token: integration.refreshToken
      });

      return integration.accessToken;
    } catch (error) {
      logger.error('Failed to get access token:', error);
      throw error;
    }
  }

  async refreshToken(userId, integration) {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: integration.refreshToken
      });

      const { tokens } = await this.oauth2Client.refreshAccessToken();

      // Update tokens in database
      await prisma.integration.update({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        },
        data: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || integration.refreshToken,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null
        }
      });

      logger.info(`Refreshed Google Calendar token for user ${userId}`);
    } catch (error) {
      logger.error('Failed to refresh token:', error);
      throw error;
    }
  }

  async getCalendarEvents(userId, startDate, endDate) {
    try {
      await this.getAccessToken(userId);

      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.data.items.map(event => ({
        id: event.id,
        title: event.summary,
        description: event.description,
        startTime: new Date(event.start.dateTime || event.start.date),
        endTime: new Date(event.end.dateTime || event.end.date),
        location: event.location,
        attendees: event.attendees?.map(attendee => ({
          email: attendee.email,
          name: attendee.displayName,
          responseStatus: attendee.responseStatus
        })) || [],
        isAllDay: !event.start.dateTime,
        status: event.status,
        created: new Date(event.created),
        updated: new Date(event.updated)
      }));

      logger.info(`Retrieved ${events.length} calendar events for user ${userId}`);
      return events;
    } catch (error) {
      logger.error('Failed to get calendar events:', error);
      throw error;
    }
  }

  async createCalendarEvent(userId, eventData) {
    try {
      await this.getAccessToken(userId);

      const event = {
        summary: eventData.title,
        description: eventData.description,
        start: {
          dateTime: eventData.startTime.toISOString(),
          timeZone: eventData.timeZone || 'UTC'
        },
        end: {
          dateTime: eventData.endTime.toISOString(),
          timeZone: eventData.timeZone || 'UTC'
        },
        location: eventData.location,
        attendees: eventData.attendees?.map(email => ({ email })) || []
      };

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event
      });

      const createdEvent = {
        id: response.data.id,
        title: response.data.summary,
        startTime: new Date(response.data.start.dateTime),
        endTime: new Date(response.data.end.dateTime),
        location: response.data.location,
        attendees: response.data.attendees || []
      };

      logger.info(`Created calendar event ${createdEvent.id} for user ${userId}`);
      return createdEvent;
    } catch (error) {
      logger.error('Failed to create calendar event:', error);
      throw error;
    }
  }

  async updateCalendarEvent(userId, eventId, updates) {
    try {
      await this.getAccessToken(userId);

      const event = {};
      
      if (updates.title) event.summary = updates.title;
      if (updates.description) event.description = updates.description;
      if (updates.startTime) {
        event.start = {
          dateTime: updates.startTime.toISOString(),
          timeZone: updates.timeZone || 'UTC'
        };
      }
      if (updates.endTime) {
        event.end = {
          dateTime: updates.endTime.toISOString(),
          timeZone: updates.timeZone || 'UTC'
        };
      }
      if (updates.location) event.location = updates.location;
      if (updates.attendees) {
        event.attendees = updates.attendees.map(email => ({ email }));
      }

      const response = await this.calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        resource: event
      });

      logger.info(`Updated calendar event ${eventId} for user ${userId}`);
      return {
        id: response.data.id,
        title: response.data.summary,
        startTime: new Date(response.data.start.dateTime),
        endTime: new Date(response.data.end.dateTime)
      };
    } catch (error) {
      logger.error('Failed to update calendar event:', error);
      throw error;
    }
  }

  async deleteCalendarEvent(userId, eventId) {
    try {
      await this.getAccessToken(userId);

      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId
      });

      logger.info(`Deleted calendar event ${eventId} for user ${userId}`);
      return { success: true, eventId };
    } catch (error) {
      logger.error('Failed to delete calendar event:', error);
      throw error;
    }
  }

  async findFreeTime(userId, date, durationMinutes) {
    try {
      await this.getAccessToken(userId);

      const startOfDay = new Date(date);
      startOfDay.setHours(9, 0, 0, 0); // 9 AM

      const endOfDay = new Date(date);
      endOfDay.setHours(17, 0, 0, 0); // 5 PM

      // Get busy times
      const response = await this.calendar.freebusy.query({
        resource: {
          timeMin: startOfDay.toISOString(),
          timeMax: endOfDay.toISOString(),
          items: [{ id: 'primary' }]
        }
      });

      const busyTimes = response.data.calendars.primary.busy.map(busy => ({
        start: new Date(busy.start),
        end: new Date(busy.end)
      }));

      // Find free slots
      const freeSlots = [];
      let currentTime = new Date(startOfDay);

      while (currentTime < endOfDay) {
        const slotEnd = new Date(currentTime.getTime() + durationMinutes * 60 * 1000);
        
        if (slotEnd > endOfDay) break;

        // Check if this slot conflicts with any busy time
        const isConflict = busyTimes.some(busy => 
          (currentTime >= busy.start && currentTime < busy.end) ||
          (slotEnd > busy.start && slotEnd <= busy.end) ||
          (currentTime < busy.start && slotEnd > busy.end)
        );

        if (!isConflict) {
          freeSlots.push({
            startTime: new Date(currentTime),
            endTime: new Date(slotEnd)
          });
        }

        currentTime = new Date(currentTime.getTime() + 15 * 60 * 1000); // 15-minute intervals
      }

      logger.info(`Found ${freeSlots.length} free time slots for user ${userId}`);
      return freeSlots;
    } catch (error) {
      logger.error('Failed to find free time:', error);
      throw error;
    }
  }

  async getCalendarList(userId) {
    try {
      await this.getAccessToken(userId);

      const response = await this.calendar.calendarList.list();
      
      const calendars = response.data.items.map(calendar => ({
        id: calendar.id,
        name: calendar.summary,
        description: calendar.description,
        timeZone: calendar.timeZone,
        accessRole: calendar.accessRole,
        isPrimary: calendar.primary || false
      }));

      logger.info(`Retrieved ${calendars.length} calendars for user ${userId}`);
      return calendars;
    } catch (error) {
      logger.error('Failed to get calendar list:', error);
      throw error;
    }
  }

  async isIntegrationActive(userId) {
    try {
      const integration = await prisma.integration.findUnique({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        }
      });

      return integration && integration.isActive;
    } catch (error) {
      logger.error('Failed to check integration status:', error);
      return false;
    }
  }

  async deactivateIntegration(userId) {
    try {
      await prisma.integration.update({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        },
        data: {
          isActive: false
        }
      });

      logger.info(`Deactivated Google Calendar integration for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to deactivate integration:', error);
      return { success: false, error: error.message };
    }
  }

  getStats() {
    return {
      serviceName: this.serviceName,
      isConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      supportedOperations: [
        'getCalendarEvents',
        'createCalendarEvent',
        'updateCalendarEvent',
        'deleteCalendarEvent',
        'findFreeTime',
        'getCalendarList'
      ]
    };
  }
}

module.exports = GoogleCalendarIntegration;