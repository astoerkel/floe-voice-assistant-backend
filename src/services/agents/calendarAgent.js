const { Tool } = require('langchain/tools');
const { prisma } = require('../../config/database');
const logger = require('../../utils/logger');

class CalendarAgent {
  constructor() {
    this.agentName = 'calendar';
    this.tools = this.createTools();
  }

  createTools() {
    return [
      new Tool({
        name: 'get_calendar_events',
        description: 'Get calendar events for a specific date range',
        func: async (input) => {
          try {
            const { userId, startDate, endDate } = JSON.parse(input);
            return await this.getCalendarEvents(userId, startDate, endDate);
          } catch (error) {
            logger.error('Get calendar events tool error:', error);
            return `Error getting calendar events: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'create_calendar_event',
        description: 'Create a new calendar event',
        func: async (input) => {
          try {
            const eventData = JSON.parse(input);
            return await this.createCalendarEvent(eventData);
          } catch (error) {
            logger.error('Create calendar event tool error:', error);
            return `Error creating calendar event: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'update_calendar_event',
        description: 'Update an existing calendar event',
        func: async (input) => {
          try {
            const { eventId, updates } = JSON.parse(input);
            return await this.updateCalendarEvent(eventId, updates);
          } catch (error) {
            logger.error('Update calendar event tool error:', error);
            return `Error updating calendar event: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'delete_calendar_event',
        description: 'Delete a calendar event',
        func: async (input) => {
          try {
            const { eventId } = JSON.parse(input);
            return await this.deleteCalendarEvent(eventId);
          } catch (error) {
            logger.error('Delete calendar event tool error:', error);
            return `Error deleting calendar event: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'find_free_time',
        description: 'Find available time slots in the calendar',
        func: async (input) => {
          try {
            const { userId, date, duration } = JSON.parse(input);
            return await this.findFreeTime(userId, date, duration);
          } catch (error) {
            logger.error('Find free time tool error:', error);
            return `Error finding free time: ${error.message}`;
          }
        }
      })
    ];
  }

  async processCommand(userId, input, context = {}) {
    try {
      logger.info(`Calendar agent processing command for user ${userId}:`, {
        input: input.substring(0, 100)
      });

      // Parse the intent and extract relevant information
      const intent = await this.parseCalendarIntent(input);
      
      let response;
      switch (intent.type) {
        case 'get_events':
          response = await this.handleGetEvents(userId, intent, context);
          break;
        case 'create_event':
          response = await this.handleCreateEvent(userId, intent, context);
          break;
        case 'update_event':
          response = await this.handleUpdateEvent(userId, intent, context);
          break;
        case 'delete_event':
          response = await this.handleDeleteEvent(userId, intent, context);
          break;
        case 'find_free_time':
          response = await this.handleFindFreeTime(userId, intent, context);
          break;
        default:
          response = await this.handleGeneralCalendarQuery(userId, input, context);
      }

      logger.info(`Calendar agent completed processing for user ${userId}`);
      return response;
    } catch (error) {
      logger.error('Calendar agent processing failed:', error);
      return {
        text: "I'm having trouble with your calendar request. Could you please try again?",
        actions: [],
        suggestions: ['Check your calendar', 'Schedule a meeting', 'Find free time']
      };
    }
  }

  async parseCalendarIntent(input) {
    const lowerInput = input.toLowerCase();
    
    // Get events patterns
    if (lowerInput.includes('show') || lowerInput.includes('what') || lowerInput.includes('list')) {
      if (lowerInput.includes('today')) {
        return { type: 'get_events', timeframe: 'today' };
      } else if (lowerInput.includes('tomorrow')) {
        return { type: 'get_events', timeframe: 'tomorrow' };
      } else if (lowerInput.includes('week')) {
        return { type: 'get_events', timeframe: 'week' };
      } else if (lowerInput.includes('month')) {
        return { type: 'get_events', timeframe: 'month' };
      } else {
        return { type: 'get_events', timeframe: 'today' };
      }
    }
    
    // Create event patterns
    if (lowerInput.includes('schedule') || lowerInput.includes('book') || lowerInput.includes('create') || lowerInput.includes('add')) {
      return { type: 'create_event', input };
    }
    
    // Update event patterns
    if (lowerInput.includes('update') || lowerInput.includes('change') || lowerInput.includes('modify')) {
      return { type: 'update_event', input };
    }
    
    // Delete event patterns
    if (lowerInput.includes('delete') || lowerInput.includes('remove') || lowerInput.includes('cancel')) {
      return { type: 'delete_event', input };
    }
    
    // Find free time patterns
    if (lowerInput.includes('free') || lowerInput.includes('available') || lowerInput.includes('open')) {
      return { type: 'find_free_time', input };
    }
    
    return { type: 'general', input };
  }

  async handleGetEvents(userId, intent, context) {
    try {
      const { startDate, endDate } = this.getDateRange(intent.timeframe);
      const events = await this.getCalendarEvents(userId, startDate, endDate);
      
      if (events.length === 0) {
        return {
          text: `You have no events ${intent.timeframe === 'today' ? 'today' : `for ${intent.timeframe}`}.`,
          actions: [],
          suggestions: ['Schedule a meeting', 'Check tomorrow', 'Find free time']
        };
      }
      
      const eventList = events.map(event => 
        `${event.title} at ${this.formatTime(event.startTime)}`
      ).join(', ');
      
      return {
        text: `Here are your events ${intent.timeframe === 'today' ? 'today' : `for ${intent.timeframe}`}: ${eventList}`,
        actions: events.map(event => ({
          type: 'view_event',
          eventId: event.id,
          title: event.title
        })),
        suggestions: ['Schedule another meeting', 'Find free time', 'Check availability']
      };
    } catch (error) {
      logger.error('Handle get events failed:', error);
      return {
        text: "I couldn't retrieve your calendar events. Please try again.",
        actions: [],
        suggestions: ['Check your calendar', 'Try again later']
      };
    }
  }

  async handleCreateEvent(userId, intent, context) {
    try {
      // Parse event details from input
      const eventDetails = await this.parseEventDetails(intent.input);
      
      if (!eventDetails.title || !eventDetails.startTime) {
        return {
          text: "I need more information to create this event. Please provide a title and time.",
          actions: [],
          suggestions: ['Try: "Schedule a meeting with John at 2 PM tomorrow"']
        };
      }
      
      const event = await this.createCalendarEvent({
        userId,
        ...eventDetails
      });
      
      return {
        text: `I've created "${event.title}" for ${this.formatDateTime(event.startTime)}.`,
        actions: [{
          type: 'view_event',
          eventId: event.id,
          title: event.title
        }],
        suggestions: ['Add another event', 'Set reminder', 'Invite attendees']
      };
    } catch (error) {
      logger.error('Handle create event failed:', error);
      return {
        text: "I couldn't create the event. Please try again with more details.",
        actions: [],
        suggestions: ['Try: "Schedule a meeting with John at 2 PM tomorrow"']
      };
    }
  }

  async handleUpdateEvent(userId, intent, context) {
    try {
      // This would typically involve more complex parsing to identify which event to update
      return {
        text: "To update an event, please specify which event you'd like to change and what modifications you need.",
        actions: [],
        suggestions: ['Show my events first', 'Be more specific', 'Cancel event instead']
      };
    } catch (error) {
      logger.error('Handle update event failed:', error);
      return {
        text: "I couldn't update the event. Please try again.",
        actions: [],
        suggestions: ['Show my events', 'Try again']
      };
    }
  }

  async handleDeleteEvent(userId, intent, context) {
    try {
      return {
        text: "To cancel an event, please specify which event you'd like to cancel.",
        actions: [],
        suggestions: ['Show my events first', 'Be more specific']
      };
    } catch (error) {
      logger.error('Handle delete event failed:', error);
      return {
        text: "I couldn't cancel the event. Please try again.",
        actions: [],
        suggestions: ['Show my events', 'Try again']
      };
    }
  }

  async handleFindFreeTime(userId, intent, context) {
    try {
      const today = new Date();
      const freeSlots = await this.findFreeTime(userId, today, 60); // 60 minutes
      
      if (freeSlots.length === 0) {
        return {
          text: "I couldn't find any free time slots today. Would you like me to check tomorrow?",
          actions: [],
          suggestions: ['Check tomorrow', 'Check this week', 'Shorter meeting']
        };
      }
      
      const slotList = freeSlots.slice(0, 3).map(slot => 
        this.formatTime(slot.startTime)
      ).join(', ');
      
      return {
        text: `Here are some available time slots: ${slotList}`,
        actions: freeSlots.slice(0, 3).map(slot => ({
          type: 'schedule_time',
          startTime: slot.startTime,
          endTime: slot.endTime
        })),
        suggestions: ['Schedule meeting', 'Check different day', 'Different duration']
      };
    } catch (error) {
      logger.error('Handle find free time failed:', error);
      return {
        text: "I couldn't find free time slots. Please try again.",
        actions: [],
        suggestions: ['Check calendar', 'Try again later']
      };
    }
  }

  async handleGeneralCalendarQuery(userId, input, context) {
    return {
      text: "I can help you with your calendar. You can ask me to show your events, schedule meetings, or find free time.",
      actions: [],
      suggestions: ['Show today\'s events', 'Schedule a meeting', 'Find free time']
    };
  }

  // Calendar data management methods
  async getCalendarEvents(userId, startDate, endDate) {
    try {
      // Check if Google Calendar integration is active
      // In production, this would fetch real events from Google Calendar API
      // For now, return empty array to avoid mock data issues
      logger.warn(`Calendar integration not yet implemented for user ${userId}`);
      return [];
    } catch (error) {
      logger.error('Get calendar events failed:', error);
      return [];
    }
  }

  async createCalendarEvent(eventData) {
    try {
      // Google Calendar integration not yet implemented
      logger.warn(`Calendar event creation not yet implemented for user ${eventData.userId}`);
      throw new Error('Calendar integration not available. Please set up Google Calendar integration first.');
    } catch (error) {
      logger.error('Create calendar event failed:', error);
      throw error;
    }
  }

  async updateCalendarEvent(eventId, updates) {
    try {
      // Mock implementation
      logger.info('Calendar event updated:', { eventId, updates });
      return { id: eventId, ...updates };
    } catch (error) {
      logger.error('Update calendar event failed:', error);
      throw error;
    }
  }

  async deleteCalendarEvent(eventId) {
    try {
      // Mock implementation
      logger.info('Calendar event deleted:', eventId);
      return { deleted: true, eventId };
    } catch (error) {
      logger.error('Delete calendar event failed:', error);
      throw error;
    }
  }

  async findFreeTime(userId, date, durationMinutes) {
    try {
      // Mock implementation - find free time slots
      const startOfDay = new Date(date);
      startOfDay.setHours(9, 0, 0, 0); // 9 AM
      
      const endOfDay = new Date(date);
      endOfDay.setHours(17, 0, 0, 0); // 5 PM
      
      const freeSlots = [];
      let currentTime = new Date(startOfDay);
      
      while (currentTime < endOfDay) {
        const slotEnd = new Date(currentTime.getTime() + durationMinutes * 60 * 1000);
        
        if (slotEnd <= endOfDay) {
          freeSlots.push({
            startTime: new Date(currentTime),
            endTime: new Date(slotEnd)
          });
        }
        
        currentTime = new Date(currentTime.getTime() + durationMinutes * 60 * 1000);
      }
      
      return freeSlots.slice(0, 10); // Return first 10 slots
    } catch (error) {
      logger.error('Find free time failed:', error);
      return [];
    }
  }

  // Utility methods
  parseEventDetails(input) {
    // Simple parsing - in a real implementation, this would use NLP
    const eventDetails = {
      title: null,
      startTime: null,
      endTime: null,
      location: null,
      attendees: []
    };
    
    // Extract title (very basic)
    if (input.includes('meeting with')) {
      const match = input.match(/meeting with ([^at]+)/i);
      if (match) {
        eventDetails.title = `Meeting with ${match[1].trim()}`;
      }
    } else if (input.includes('schedule')) {
      const match = input.match(/schedule (.+?) at/i);
      if (match) {
        eventDetails.title = match[1].trim();
      }
    }
    
    // Extract time (very basic)
    if (input.includes('at')) {
      const match = input.match(/at (\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i);
      if (match) {
        eventDetails.startTime = this.parseTime(match[1]);
      }
    }
    
    return eventDetails;
  }

  parseTime(timeStr) {
    // Simple time parsing - in a real implementation, this would be more robust
    const now = new Date();
    const timeParts = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    
    if (!timeParts) return null;
    
    let hours = parseInt(timeParts[1]);
    const minutes = parseInt(timeParts[2]) || 0;
    const ampm = timeParts[3]?.toLowerCase();
    
    if (ampm === 'pm' && hours !== 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    
    const result = new Date(now);
    result.setHours(hours, minutes, 0, 0);
    
    // If time is in the past, assume it's tomorrow
    if (result < now) {
      result.setDate(result.getDate() + 1);
    }
    
    return result;
  }

  getDateRange(timeframe) {
    const now = new Date();
    const startDate = new Date(now);
    const endDate = new Date(now);
    
    switch (timeframe) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'tomorrow':
        startDate.setDate(startDate.getDate() + 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(endDate.getDate() + 1);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(endDate.getDate() + 7);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
    }
    
    return { startDate, endDate };
  }

  formatTime(date) {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }

  formatDateTime(date) {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  getStats() {
    return {
      agentName: this.agentName,
      toolsAvailable: this.tools.length,
      lastProcessedAt: new Date().toISOString()
    };
  }
}

module.exports = new CalendarAgent();