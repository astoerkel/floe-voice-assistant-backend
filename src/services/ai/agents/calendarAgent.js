const { ChatOpenAI } = require('@langchain/openai');
const { LLMChain } = require('langchain/chains');
const { PromptTemplate } = require('langchain/prompts');
const logger = require('../../../utils/logger');

class CalendarAgent {
  constructor(calendarService) {
    this.calendarService = calendarService;
    this.agentName = 'CalendarAgent';
    
    // Initialize LLM with same configuration as coordinator
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.3, // Lower temperature for more consistent calendar operations
      maxTokens: 1500,
      openAIApiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
      configuration: {
        baseURL: process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined,
        defaultHeaders: process.env.OPENROUTER_API_KEY ? {
          'HTTP-Referer': process.env.APP_URL || 'https://voiceassistant.com',
          'X-Title': 'Voice Assistant Calendar'
        } : {}
      }
    });

    logger.info('CalendarAgent initialized');
  }

  /**
   * Handle calendar-related requests
   */
  async handleRequest(userId, userInput, context, systemPrompt) {
    try {
      logger.info(`CalendarAgent handling request for user ${userId}: "${userInput}"`);

      // Check if calendar integration is available
      const isCalendarActive = await this.calendarService.isIntegrationActive(userId);
      
      if (!isCalendarActive) {
        return this.handleNoCalendarIntegration(userInput);
      }

      // Analyze the calendar intent and extract parameters
      const calendarIntent = await this.analyzeCalendarIntent(userInput, context);
      
      logger.debug(`Calendar intent analysis:`, calendarIntent);

      // Execute the appropriate calendar action
      let result;
      switch (calendarIntent.action) {
        case 'view_events':
          result = await this.handleViewEvents(userId, calendarIntent.parameters);
          break;
        case 'create_event':
          result = await this.handleCreateEvent(userId, calendarIntent.parameters);
          break;
        case 'update_event':
          result = await this.handleUpdateEvent(userId, calendarIntent.parameters);
          break;
        case 'delete_event':
          result = await this.handleDeleteEvent(userId, calendarIntent.parameters);
          break;
        case 'find_free_time':
          result = await this.handleFindFreeTime(userId, calendarIntent.parameters);
          break;
        case 'get_calendar_summary':
          result = await this.handleGetCalendarSummary(userId, calendarIntent.parameters);
          break;
        default:
          result = await this.handleGenericCalendarQuery(userId, userInput, context, systemPrompt);
      }

      // Generate voice-optimized response
      const response = await this.generateResponse(userInput, result, systemPrompt, context);

      return {
        text: response,
        agentUsed: this.agentName,
        action: calendarIntent.action,
        actions: result.actions || [],
        context: {
          calendarAction: calendarIntent.action,
          parameters: calendarIntent.parameters,
          result: result.summary || 'Calendar operation completed'
        }
      };

    } catch (error) {
      logger.error('Error in CalendarAgent:', error);
      return this.handleError(userInput, error);
    }
  }

  /**
   * Analyze calendar intent and extract parameters
   */
  async analyzeCalendarIntent(userInput, context) {
    try {
      const intentPrompt = PromptTemplate.fromTemplate(`
        Analyze this calendar-related request and extract the action and parameters.

        User Input: "{input}"
        
        Context: {context}

        Available Calendar Actions:
        - view_events: View existing calendar events
        - create_event: Create a new calendar event
        - update_event: Modify an existing event
        - delete_event: Remove an event
        - find_free_time: Find available time slots
        - get_calendar_summary: Get overview of calendar

        Extract and return JSON with:
        {{
          "action": "one of the above actions",
          "confidence": 0.0-1.0,
          "parameters": {{
            "title": "event title if creating/updating",
            "date": "specific date mentioned",
            "time": "specific time mentioned", 
            "duration": "duration in minutes",
            "location": "location if mentioned",
            "description": "additional details",
            "attendees": ["email addresses if mentioned"],
            "timeRange": {{
              "start": "start date for viewing events",
              "end": "end date for viewing events"
            }},
            "eventId": "event ID if updating/deleting specific event",
            "searchQuery": "search terms for finding events"
          }}
        }}

        Only include parameters that are explicitly mentioned or can be reasonably inferred.
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: intentPrompt
      });

      const result = await chain.call({
        input: userInput,
        context: JSON.stringify(context, null, 2)
      });

      try {
        const parsed = JSON.parse(result.text);
        return {
          action: parsed.action || 'view_events',
          confidence: parsed.confidence || 0.5,
          parameters: parsed.parameters || {}
        };
      } catch (parseError) {
        logger.warn('Failed to parse calendar intent, using fallback');
        return {
          action: 'view_events',
          confidence: 0.3,
          parameters: {}
        };
      }

    } catch (error) {
      logger.error('Error analyzing calendar intent:', error);
      return {
        action: 'view_events',
        confidence: 0.1,
        parameters: {}
      };
    }
  }

  /**
   * Handle viewing calendar events
   */
  async handleViewEvents(userId, parameters) {
    try {
      // Determine date range
      const { startDate, endDate } = this.parseDateRange(parameters);

      // Get events from calendar service
      const events = await this.calendarService.getCalendarEvents(userId, startDate, endDate);

      return {
        success: true,
        data: events,
        summary: `Found ${events.length} events`,
        actions: ['view_events'],
        details: {
          eventCount: events.length,
          dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString()
          },
          events: events.slice(0, 5) // Limit for voice response
        }
      };

    } catch (error) {
      logger.error('Error viewing events:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to retrieve calendar events'
      };
    }
  }

  /**
   * Handle creating calendar events
   */
  async handleCreateEvent(userId, parameters) {
    try {
      // Validate required parameters
      if (!parameters.title) {
        return {
          success: false,
          error: 'Event title is required',
          needsMoreInfo: true,
          missingInfo: ['title']
        };
      }

      // Parse and validate date/time
      const eventData = this.parseEventData(parameters);
      
      if (!eventData.startTime || !eventData.endTime) {
        return {
          success: false,
          error: 'Event date and time are required',
          needsMoreInfo: true,
          missingInfo: ['date', 'time']
        };
      }

      // Create the event
      const createdEvent = await this.calendarService.createCalendarEvent(userId, eventData);

      return {
        success: true,
        data: createdEvent,
        summary: `Created event "${createdEvent.title}"`,
        actions: ['create_event'],
        details: {
          eventId: createdEvent.id,
          title: createdEvent.title,
          startTime: createdEvent.startTime,
          endTime: createdEvent.endTime,
          location: createdEvent.location
        }
      };

    } catch (error) {
      logger.error('Error creating event:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to create calendar event'
      };
    }
  }

  /**
   * Handle updating calendar events
   */
  async handleUpdateEvent(userId, parameters) {
    try {
      if (!parameters.eventId && !parameters.searchQuery) {
        return {
          success: false,
          error: 'Event ID or search criteria required for updating',
          needsMoreInfo: true,
          missingInfo: ['eventId', 'searchQuery']
        };
      }

      // If we have a search query, find the event first
      let eventId = parameters.eventId;
      if (!eventId && parameters.searchQuery) {
        const events = await this.findEventsByQuery(userId, parameters.searchQuery);
        if (events.length === 0) {
          return {
            success: false,
            error: 'No events found matching your criteria'
          };
        }
        if (events.length > 1) {
          return {
            success: false,
            error: 'Multiple events found, please be more specific',
            data: events.slice(0, 3) // Show first 3 matches
          };
        }
        eventId = events[0].id;
      }

      // Prepare update data
      const updates = this.parseEventUpdates(parameters);
      
      // Update the event
      const updatedEvent = await this.calendarService.updateCalendarEvent(userId, eventId, updates);

      return {
        success: true,
        data: updatedEvent,
        summary: `Updated event "${updatedEvent.title}"`,
        actions: ['update_event'],
        details: {
          eventId: updatedEvent.id,
          title: updatedEvent.title,
          changes: Object.keys(updates)
        }
      };

    } catch (error) {
      logger.error('Error updating event:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to update calendar event'
      };
    }
  }

  /**
   * Handle deleting calendar events
   */
  async handleDeleteEvent(userId, parameters) {
    try {
      if (!parameters.eventId && !parameters.searchQuery) {
        return {
          success: false,
          error: 'Event ID or search criteria required for deletion',
          needsMoreInfo: true,
          missingInfo: ['eventId', 'searchQuery']
        };
      }

      // Find event if needed
      let eventId = parameters.eventId;
      let eventTitle = 'the event';
      
      if (!eventId && parameters.searchQuery) {
        const events = await this.findEventsByQuery(userId, parameters.searchQuery);
        if (events.length === 0) {
          return {
            success: false,
            error: 'No events found matching your criteria'
          };
        }
        if (events.length > 1) {
          return {
            success: false,
            error: 'Multiple events found, please be more specific',
            data: events.slice(0, 3)
          };
        }
        eventId = events[0].id;
        eventTitle = events[0].title;
      }

      // Delete the event
      const result = await this.calendarService.deleteCalendarEvent(userId, eventId);

      return {
        success: true,
        data: result,
        summary: `Deleted event "${eventTitle}"`,
        actions: ['delete_event'],
        details: {
          eventId: eventId,
          eventTitle: eventTitle
        }
      };

    } catch (error) {
      logger.error('Error deleting event:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to delete calendar event'
      };
    }
  }

  /**
   * Handle finding free time
   */
  async handleFindFreeTime(userId, parameters) {
    try {
      const date = this.parseDate(parameters.date) || new Date();
      const duration = parameters.duration || 60; // Default 1 hour

      const freeSlots = await this.calendarService.findFreeTime(userId, date, duration);

      return {
        success: true,
        data: freeSlots,
        summary: `Found ${freeSlots.length} free time slots`,
        actions: ['find_free_time'],
        details: {
          date: date.toDateString(),
          duration: duration,
          slotsFound: freeSlots.length,
          slots: freeSlots.slice(0, 3) // Limit for voice response
        }
      };

    } catch (error) {
      logger.error('Error finding free time:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to find free time slots'
      };
    }
  }

  /**
   * Handle getting calendar summary
   */
  async handleGetCalendarSummary(userId, parameters) {
    try {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 7); // Next 7 days

      const events = await this.calendarService.getCalendarEvents(userId, today, endDate);
      
      // Categorize events
      const todayEvents = events.filter(e => this.isSameDay(e.startTime, today));
      const upcomingEvents = events.filter(e => e.startTime > today);

      return {
        success: true,
        data: {
          todayEvents,
          upcomingEvents,
          totalEvents: events.length
        },
        summary: `You have ${todayEvents.length} events today and ${upcomingEvents.length} upcoming`,
        actions: ['get_calendar_summary'],
        details: {
          todayCount: todayEvents.length,
          upcomingCount: upcomingEvents.length,
          nextEvent: upcomingEvents[0] || null
        }
      };

    } catch (error) {
      logger.error('Error getting calendar summary:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to get calendar summary'
      };
    }
  }

  /**
   * Handle generic calendar queries using LLM
   */
  async handleGenericCalendarQuery(userId, userInput, context, systemPrompt) {
    try {
      // Get recent calendar data for context
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      
      const recentEvents = await this.calendarService.getCalendarEvents(userId, today, nextWeek);

      const queryPrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        CALENDAR CONTEXT:
        Recent Calendar Events: {events}

        USER QUERY: "{input}"

        Provide a helpful response about the user's calendar. Be specific and actionable.
        If you need to perform a calendar action, explain what you would do.
        Keep the response under 50 words and voice-optimized.
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: queryPrompt
      });

      const result = await chain.call({
        input: userInput,
        events: JSON.stringify(recentEvents.slice(0, 5), null, 2)
      });

      return {
        success: true,
        summary: 'Calendar query processed',
        data: { response: result.text.trim() }
      };

    } catch (error) {
      logger.error('Error handling generic calendar query:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to process calendar query'
      };
    }
  }

  /**
   * Handle case where calendar integration is not available
   */
  handleNoCalendarIntegration(userInput) {
    return {
      text: "I'd love to help with your calendar, but you'll need to connect your Google Calendar first. Would you like me to guide you through setting that up?",
      agentUsed: this.agentName,
      action: 'integration_required',
      actions: ['setup_calendar_integration'],
      context: {
        integrationNeeded: 'google_calendar',
        originalRequest: userInput
      }
    };
  }

  /**
   * Generate voice-optimized response
   */
  async generateResponse(userInput, result, systemPrompt, context) {
    try {
      const responsePrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        USER REQUEST: "{input}"
        
        CALENDAR OPERATION RESULT:
        Success: {success}
        Summary: {summary}
        Details: {details}
        Error: {error}

        Generate a voice-optimized response that:
        1. Acknowledges the request
        2. Reports the result clearly
        3. Suggests next actions if appropriate
        4. Keeps it under 50 words
        5. Uses natural, conversational language

        Response:
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: responsePrompt
      });

      const response = await chain.call({
        input: userInput,
        success: result.success,
        summary: result.summary || 'Operation completed',
        details: JSON.stringify(result.details || {}, null, 2),
        error: result.error || 'None'
      });

      return response.text.trim();

    } catch (error) {
      logger.error('Error generating response:', error);
      return result.success ? 
        (result.summary || 'Calendar operation completed successfully.') :
        (result.error || 'I had trouble with that calendar request. Please try again.');
    }
  }

  /**
   * Handle errors
   */
  handleError(userInput, error) {
    return {
      text: "I'm sorry, I had trouble with that calendar request. Please try again or be more specific about what you'd like me to do.",
      agentUsed: this.agentName,
      action: 'error',
      actions: [],
      context: {
        error: error.message,
        originalRequest: userInput
      }
    };
  }

  /**
   * Helper methods
   */
  parseDateRange(parameters) {
    const today = new Date();
    let startDate = today;
    let endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7); // Default to next 7 days

    if (parameters.timeRange) {
      if (parameters.timeRange.start) {
        startDate = this.parseDate(parameters.timeRange.start) || today;
      }
      if (parameters.timeRange.end) {
        endDate = this.parseDate(parameters.timeRange.end) || endDate;
      }
    } else if (parameters.date) {
      startDate = this.parseDate(parameters.date) || today;
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1); // Single day
    }

    return { startDate, endDate };
  }

  parseEventData(parameters) {
    const eventData = {
      title: parameters.title,
      description: parameters.description || '',
      location: parameters.location || '',
      attendees: parameters.attendees || []
    };

    // Parse date and time
    if (parameters.date && parameters.time) {
      const dateTime = this.parseDateTime(parameters.date, parameters.time);
      eventData.startTime = dateTime;
      
      // Calculate end time
      const duration = parameters.duration || 60; // Default 1 hour
      eventData.endTime = new Date(dateTime.getTime() + duration * 60 * 1000);
    }

    return eventData;
  }

  parseEventUpdates(parameters) {
    const updates = {};
    
    if (parameters.title) updates.title = parameters.title;
    if (parameters.description) updates.description = parameters.description;
    if (parameters.location) updates.location = parameters.location;
    if (parameters.attendees) updates.attendees = parameters.attendees;
    
    if (parameters.date && parameters.time) {
      const dateTime = this.parseDateTime(parameters.date, parameters.time);
      updates.startTime = dateTime;
      
      if (parameters.duration) {
        updates.endTime = new Date(dateTime.getTime() + parameters.duration * 60 * 1000);
      }
    }

    return updates;
  }

  parseDate(dateString) {
    if (!dateString) return null;
    
    // Handle natural language dates
    const today = new Date();
    const lower = dateString.toLowerCase();
    
    if (lower.includes('today')) return today;
    if (lower.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    if (lower.includes('next week')) {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    }
    
    // Try to parse as regular date
    const parsed = new Date(dateString);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  parseDateTime(dateString, timeString) {
    const date = this.parseDate(dateString);
    if (!date) return null;

    // Parse time
    const timeParts = timeString.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm)?/i);
    if (!timeParts) return date;

    let hours = parseInt(timeParts[1]);
    const minutes = parseInt(timeParts[2] || '0');
    const period = timeParts[3]?.toLowerCase();

    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  async findEventsByQuery(userId, query) {
    try {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setMonth(futureDate.getMonth() + 1); // Search next month

      const events = await this.calendarService.getCalendarEvents(userId, today, futureDate);
      
      // Simple text search in title and description
      const queryLower = query.toLowerCase();
      return events.filter(event => 
        event.title?.toLowerCase().includes(queryLower) ||
        event.description?.toLowerCase().includes(queryLower)
      );

    } catch (error) {
      logger.error('Error searching events:', error);
      return [];
    }
  }

  isSameDay(date1, date2) {
    return date1.toDateString() === date2.toDateString();
  }
}

module.exports = CalendarAgent;