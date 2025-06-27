const { google } = require('googleapis');
const logger = require('../utils/logger');
const settings = require('../config/settings');

class CalendarService {
  constructor() {
    this.calendar = null;
    this.auth = null;
    this.initialize();
  }

  async initialize() {
    try {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        logger.warn('Google Calendar credentials not configured. Calendar sync will be disabled.');
        return;
      }

      // Create OAuth2 client
      this.auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
      );

      // Set refresh token if available
      if (process.env.GOOGLE_REFRESH_TOKEN) {
        this.auth.setCredentials({
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });
      }

      // Initialize Calendar API
      this.calendar = google.calendar({ version: 'v3', auth: this.auth });

      logger.info('Google Calendar service initialized');

    } catch (error) {
      logger.error('Failed to initialize Google Calendar service:', error);
    }
  }

  async createEvent(eventDetails) {
    try {
      if (!this.calendar) {
        throw new Error('Google Calendar not initialized');
      }

      const event = {
        summary: eventDetails.summary,
        description: eventDetails.description || '',
        start: {
          dateTime: eventDetails.start.dateTime,
          timeZone: eventDetails.start.timeZone || settings.teacher.timezone
        },
        end: {
          dateTime: eventDetails.end.dateTime,
          timeZone: eventDetails.end.timeZone || settings.teacher.timezone
        },
        attendees: eventDetails.attendees || [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 24 hours before
            { method: 'popup', minutes: 30 } // 30 minutes before
          ]
        },
        colorId: '9', // Blue color for lessons
        visibility: 'private'
      };

      // Add meeting link if provided
      if (eventDetails.meetingLink) {
        event.description += `\n\nMeeting Link: ${eventDetails.meetingLink}`;
        event.conferenceData = {
          createRequest: {
            requestId: `lesson-${Date.now()}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        };
      }

      const response = await this.calendar.events.insert({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'all'
      });

      logger.calendarLog('event_created', {
        eventId: response.data.id,
        summary: event.summary,
        startTime: event.start.dateTime
      });

      return response.data;

    } catch (error) {
      logger.error('Error creating calendar event:', error);
      throw new Error('Failed to create calendar event');
    }
  }

  async updateEvent(eventId, eventDetails) {
    try {
      if (!this.calendar) {
        throw new Error('Google Calendar not initialized');
      }

      // Get existing event first
      const existingEvent = await this.calendar.events.get({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        eventId: eventId
      });

      // Update the event
      const updatedEvent = {
        ...existingEvent.data,
        summary: eventDetails.summary || existingEvent.data.summary,
        description: eventDetails.description || existingEvent.data.description,
        start: eventDetails.start || existingEvent.data.start,
        end: eventDetails.end || existingEvent.data.end
      };

      const response = await this.calendar.events.update({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        eventId: eventId,
        resource: updatedEvent,
        sendUpdates: 'all'
      });

      logger.calendarLog('event_updated', {
        eventId: eventId,
        summary: updatedEvent.summary
      });

      return response.data;

    } catch (error) {
      logger.error('Error updating calendar event:', error);
      throw new Error('Failed to update calendar event');
    }
  }

  async deleteEvent(eventId) {
    try {
      if (!this.calendar) {
        throw new Error('Google Calendar not initialized');
      }

      await this.calendar.events.delete({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        eventId: eventId,
        sendUpdates: 'all'
      });

      logger.calendarLog('event_deleted', { eventId });

      return true;

    } catch (error) {
      logger.error('Error deleting calendar event:', error);
      throw new Error('Failed to delete calendar event');
    }
  }

  async getEvent(eventId) {
    try {
      if (!this.calendar) {
        throw new Error('Google Calendar not initialized');
      }

      const response = await this.calendar.events.get({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        eventId: eventId
      });

      return response.data;

    } catch (error) {
      logger.error('Error getting calendar event:', error);
      throw new Error('Failed to get calendar event');
    }
  }

  async listEvents(timeMin, timeMax, maxResults = 100) {
    try {
      if (!this.calendar) {
        throw new Error('Google Calendar not initialized');
      }

      const response = await this.calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      });

      return response.data.items || [];

    } catch (error) {
      logger.error('Error listing calendar events:', error);
      throw new Error('Failed to list calendar events');
    }
  }

  async checkAvailability(startTime, endTime) {
    try {
      if (!this.calendar) {
        return true; // Assume available if calendar not configured
      }

      const events = await this.listEvents(
        new Date(startTime),
        new Date(endTime),
        10
      );

      // Check if any events overlap with the requested time
      const conflicts = events.filter(event => {
        if (!event.start.dateTime || !event.end.dateTime) {
          return false; // Skip all-day events
        }

        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        const requestStart = new Date(startTime);
        const requestEnd = new Date(endTime);

        // Check for time overlap
        return (requestStart < eventEnd && requestEnd > eventStart);
      });

      return conflicts.length === 0;

    } catch (error) {
      logger.error('Error checking calendar availability:', error);
      return true; // Assume available on error
    }
  }

  async getFreeBusyInfo(timeMin, timeMax) {
    try {
      if (!this.calendar) {
        return [];
      }

      const response = await this.calendar.freebusy.query({
        resource: {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          items: [
            {
              id: process.env.GOOGLE_CALENDAR_ID || 'primary'
            }
          ]
        }
      });

      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      return response.data.calendars[calendarId]?.busy || [];

    } catch (error) {
      logger.error('Error getting free/busy information:', error);
      return [];
    }
  }

  async syncCalendarEvents() {
    try {
      if (!this.calendar) {
        logger.warn('Calendar sync skipped - Google Calendar not configured');
        return;
      }

      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + 30); // Next 30 days

      const events = await this.listEvents(now, futureDate);
      
      logger.calendarLog('calendar_synced', {
        eventCount: events.length,
        syncTime: now.toISOString()
      });

      return events;

    } catch (error) {
      logger.error('Error syncing calendar events:', error);
      throw error;
    }
  }

  async createMeetingLink() {
    try {
      // This would integrate with Google Meet or other video conferencing
      // For now, return a placeholder
      return {
        meetingUrl: 'https://meet.google.com/placeholder',
        meetingId: 'placeholder-meeting-id'
      };

    } catch (error) {
      logger.error('Error creating meeting link:', error);
      return null;
    }
  }

  // Helper method to format event for notifications
  formatEventForNotification(event) {
    const startTime = new Date(event.start.dateTime || event.start.date);
    const endTime = new Date(event.end.dateTime || event.end.date);

    return {
      id: event.id,
      title: event.summary,
      start: startTime,
      end: endTime,
      duration: Math.round((endTime - startTime) / (1000 * 60)), // minutes
      description: event.description,
      location: event.location,
      attendees: event.attendees?.map(a => ({
        email: a.email,
        name: a.displayName || a.email,
        status: a.responseStatus
      })) || []
    };
  }

  // Check if calendar service is available
  isAvailable() {
    return this.calendar !== null;
  }

  // Get authorization URL for setup
  getAuthUrl() {
    if (!this.auth) {
      return null;
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly'
    ];

    return this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  // Exchange authorization code for tokens
  async getTokens(authCode) {
    try {
      if (!this.auth) {
        throw new Error('OAuth client not initialized');
      }

      const { tokens } = await this.auth.getToken(authCode);
      this.auth.setCredentials(tokens);

      logger.info('Google Calendar tokens obtained successfully');
      
      return tokens;

    } catch (error) {
      logger.error('Error getting Google Calendar tokens:', error);
      throw error;
    }
  }
}

module.exports = new CalendarService(); 