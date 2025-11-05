import { createDAVClient } from 'tsdav';

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
}

export class CalDAVService {
  private client: any = null;
  private serverUrl: string;
  private username: string;
  private password: string;
  private calendarFilter: string;

  constructor() {
    this.serverUrl = import.meta.env.VITE_CALDAV_SERVER_URL || '';
    this.username = import.meta.env.VITE_CALDAV_USERNAME || '';
    this.password = import.meta.env.VITE_CALDAV_PASSWORD || '';
    this.calendarFilter = import.meta.env.VITE_CALDAV_CALENDAR_FILTER || '';
  }

  async connect() {
    if (!this.serverUrl || !this.username || !this.password) {
      throw new Error('CalDAV credentials not configured. Please set VITE_CALDAV_* environment variables.');
    }

    try {
      this.client = await createDAVClient({
        serverUrl: this.serverUrl,
        credentials: {
          username: this.username,
          password: this.password,
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });
      console.log('Connected to CalDAV server');
    } catch (error) {
      console.error('Failed to connect to CalDAV server:', error);
      
      // Check if it's a CORS error
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('CORS Error: Direct CalDAV access blocked by browser. Try using a backend proxy or CORS browser extension.');
      }
      
      throw error;
    }
  }

  async fetchEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    if (!this.serverUrl || !this.username || !this.password) {
      throw new Error('CalDAV credentials not configured');
    }

    try {
      // Use backend proxy instead of direct CalDAV calls to avoid CORS
      const params = new URLSearchParams({
        serverUrl: this.serverUrl,
        username: this.username,
        password: this.password,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      // Add calendar filter if specified
      if (this.calendarFilter) {
        params.append('calendarFilter', this.calendarFilter);
      }

      const response = await fetch(`/api/calendar/events?${params}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const events = this.parseCalendarObjects(data.events);
      
      console.log(`Loaded ${events.length} events from CalDAV via proxy`);
      return this.sortEvents(events);
    } catch (error) {
      console.error('Failed to fetch calendar events:', error);
      throw error;
    }
  }

  private parseCalendarObjects(calendarObjects: any[]): CalendarEvent[] {
    const events: CalendarEvent[] = [];

    for (const obj of calendarObjects) {
      try {
        // Parse iCal data
        const icalData = obj.data;
        const icalEvents = this.parseICalData(icalData);
        events.push(...icalEvents);
      } catch (error) {
        console.warn('Failed to parse calendar object:', error);
      }
    }

    return events;
  }

  private parseICalData(icalData: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const lines = icalData.split('\n');
    
    let currentEvent: Partial<CalendarEvent> = {};
    let inEvent = false;

    for (let line of lines) {
      line = line.trim();

      if (line === 'BEGIN:VEVENT') {
        inEvent = true;
        currentEvent = {};
      } else if (line === 'END:VEVENT' && inEvent) {
        if (currentEvent.title && currentEvent.start) {
          events.push({
            id: currentEvent.id || Math.random().toString(36),
            title: currentEvent.title,
            start: currentEvent.start,
            end: currentEvent.end,
            allDay: currentEvent.allDay || false,
          });
        }
        inEvent = false;
      } else if (inEvent) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':');

        if (key === 'SUMMARY') {
          currentEvent.title = value;
        } else if (key.startsWith('DTSTART')) {
          currentEvent.start = this.parseDateTime(value, key.includes('VALUE=DATE'));
          if (key.includes('VALUE=DATE')) {
            currentEvent.allDay = true;
          }
        } else if (key.startsWith('DTEND')) {
          currentEvent.end = this.parseDateTime(value, key.includes('VALUE=DATE'));
        } else if (key === 'UID') {
          currentEvent.id = value;
        }
      }
    }

    return events;
  }

  private parseDateTime(dateTimeString: string, isDateOnly: boolean = false): Date {
    if (isDateOnly) {
      // Format: YYYYMMDD
      const year = parseInt(dateTimeString.substr(0, 4));
      const month = parseInt(dateTimeString.substr(4, 2)) - 1; // Month is 0-indexed
      const day = parseInt(dateTimeString.substr(6, 2));
      return new Date(year, month, day);
    } else {
      // Format: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
      const year = parseInt(dateTimeString.substr(0, 4));
      const month = parseInt(dateTimeString.substr(4, 2)) - 1;
      const day = parseInt(dateTimeString.substr(6, 2));
      const hour = parseInt(dateTimeString.substr(9, 2));
      const minute = parseInt(dateTimeString.substr(11, 2));
      const second = parseInt(dateTimeString.substr(13, 2));

      if (dateTimeString.endsWith('Z')) {
        return new Date(Date.UTC(year, month, day, hour, minute, second));
      } else {
        return new Date(year, month, day, hour, minute, second);
      }
    }
  }

  private sortEvents(events: CalendarEvent[]): CalendarEvent[] {
    return events.sort((a, b) => {
      // Sort all-day events first, then by start time
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.start.getTime() - b.start.getTime();
    });
  }

  isConfigured(): boolean {
    return !!(this.serverUrl && this.username && this.password);
  }
}

export const calDAVService = new CalDAVService();
