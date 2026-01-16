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

    // Store the requested date range for RRULE expansion
    this.requestedStartDate = startDate;
    this.requestedEndDate = endDate;

    try {
      // Extend the end date by 1 day to catch events on the last day
      const extendedEndDate = new Date(endDate);
      extendedEndDate.setDate(extendedEndDate.getDate() + 1);
      
      // Use backend proxy instead of direct CalDAV calls to avoid CORS
      const params = new URLSearchParams({
        serverUrl: this.serverUrl,
        username: this.username,
        password: this.password,
        startDate: startDate.toISOString(),
        endDate: extendedEndDate.toISOString(),
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

  private requestedStartDate?: Date;
  private requestedEndDate?: Date;

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

    console.log(`Parse result: ${events.length} events parsed from ${calendarObjects.length} objects`);
    if (events.length > 0) {
      console.log(`Sample events: ${events.slice(0, 5).map(e => `${e.title} (${e.start})`).join(', ')}`);
    }
    return events;
  }

  private parseICalData(icalData: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const lines = icalData.split('\n');
    
    let currentEvent: Partial<CalendarEvent> & { rrule?: string; recurrenceId?: string } = {};
    let inEvent = false;

    for (let line of lines) {
      line = line.trim();

      if (line === 'BEGIN:VEVENT') {
        inEvent = true;
        currentEvent = {};
      } else if (line === 'END:VEVENT' && inEvent) {
        if (currentEvent.title && currentEvent.start) {
          // If this event has RECURRENCE-ID, it's an exception - treat as standalone
          if (currentEvent.recurrenceId) {
            events.push({
              id: currentEvent.id || Math.random().toString(36),
              title: currentEvent.title,
              start: currentEvent.start,
              end: currentEvent.end,
              allDay: currentEvent.allDay || false,
            });
          }
          // If this event has an RRULE (and no RECURRENCE-ID), expand it
          else if (currentEvent.rrule) {
            try {
              const expandedEvents = this.expandRecurringEvent(currentEvent as CalendarEvent & { rrule: string });
              events.push(...expandedEvents);
            } catch (error) {
              console.warn(`Failed to expand RRULE for "${currentEvent.title}":`, error);
              // Fall back to the original event
              events.push({
                id: currentEvent.id || Math.random().toString(36),
                title: currentEvent.title,
                start: currentEvent.start,
                end: currentEvent.end,
                allDay: currentEvent.allDay || false,
              });
            }
          } else {
            events.push({
              id: currentEvent.id || Math.random().toString(36),
              title: currentEvent.title,
              start: currentEvent.start,
              end: currentEvent.end,
              allDay: currentEvent.allDay || false,
            });
          }
        } else {
          // Log what was missing
          if (!currentEvent.title && !currentEvent.start) {
            console.debug(`Skipped event: missing both title and start date`);
          } else if (!currentEvent.title) {
            console.debug(`Skipped event: missing title (start=${currentEvent.start})`);
          } else if (!currentEvent.start) {
            console.debug(`Skipped event: missing start date (title="${currentEvent.title}")`);
          }
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
        } else if (key === 'RRULE') {
          currentEvent.rrule = value;
          console.debug(`Event has RRULE: ${value} (title: ${currentEvent.title})`);
        } else if (key.startsWith('RECURRENCE-ID')) {
          currentEvent.recurrenceId = value;
          console.debug(`Event has RECURRENCE-ID: ${value} (title: ${currentEvent.title})`);
        }
      }
    }

    return events;
  }

  private expandRecurringEvent(event: CalendarEvent & { rrule: string }): CalendarEvent[] {
    const expanded: CalendarEvent[] = [];
    
    try {
      if (!this.requestedStartDate || !this.requestedEndDate) {
        return [event];
      }
      
      const rrule = event.rrule;
      const dtstart = event.start;
      
      console.log(`Expanding RRULE for "${event.title}": ${rrule}`);
      console.log(`  Original date: ${dtstart.toISOString()}`);
      console.log(`  Requested range: ${this.requestedStartDate.toISOString()} to ${this.requestedEndDate.toISOString()}`);
      
      // Handle FREQ=YEARLY
      if (rrule.includes('FREQ=YEARLY')) {
        const startYear = this.requestedStartDate.getFullYear();
        const endYear = this.requestedEndDate.getFullYear();
        
        for (let year = startYear; year <= endYear; year++) {
          const occurrence = new Date(year, dtstart.getMonth(), dtstart.getDate());
          
          if (occurrence >= this.requestedStartDate && occurrence <= this.requestedEndDate) {
            const duration = event.end ? event.end.getTime() - event.start.getTime() : 0;
            expanded.push({
              id: event.id + '_' + year,
              title: event.title,
              start: event.allDay ? occurrence : new Date(year, dtstart.getMonth(), dtstart.getDate(), dtstart.getHours(), dtstart.getMinutes(), dtstart.getSeconds()),
              end: duration > 0 ? new Date((event.allDay ? occurrence : new Date(year, dtstart.getMonth(), dtstart.getDate(), dtstart.getHours(), dtstart.getMinutes(), dtstart.getSeconds())).getTime() + duration) : (event.allDay ? occurrence : new Date(year, dtstart.getMonth(), dtstart.getDate(), dtstart.getHours(), dtstart.getMinutes(), dtstart.getSeconds())),
              allDay: event.allDay,
            });
          }
        }
      }
      // Handle FREQ=MONTHLY
      else if (rrule.includes('FREQ=MONTHLY')) {
        // Parse INTERVAL if present (default is 1)
        const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
        const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;
        
        // Start from the original event date and add occurrences
        let currentDate = new Date(dtstart);
        const maxIterations = 100; // Safety limit
        let iterations = 0;
        
        while (currentDate <= this.requestedEndDate && iterations < maxIterations) {
          if (currentDate >= this.requestedStartDate) {
            const duration = event.end ? event.end.getTime() - event.start.getTime() : 0;
            expanded.push({
              id: event.id + '_' + currentDate.getTime(),
              title: event.title,
              start: new Date(currentDate),
              end: duration > 0 ? new Date(currentDate.getTime() + duration) : new Date(currentDate),
              allDay: event.allDay,
            });
          }
          
          // Add interval months
          currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + interval, currentDate.getDate());
          iterations++;
        }
      }
      // Handle FREQ=WEEKLY
      else if (rrule.includes('FREQ=WEEKLY')) {
        const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
        const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;
        
        // Parse BYDAY if present (e.g., BYDAY=SU,MO)
        const bydayMatch = rrule.match(/BYDAY=([A-Z,]+)/);
        const byday = bydayMatch ? bydayMatch[1].split(',') : [];
        
        console.log(`  WEEKLY: interval=${interval}, byday=${byday.join(',')}`);
        
        let currentDate = new Date(dtstart);
        const maxIterations = 100;
        let iterations = 0;
        
        while (currentDate <= this.requestedEndDate && iterations < maxIterations) {
          // Check if this date matches the BYDAY constraint (if specified)
          let matchesByday = byday.length === 0; // If no BYDAY, match all days
          if (byday.length > 0) {
            // For all-day events, use UTC day to avoid DST issues
            const dayIndex = event.allDay ? currentDate.getUTCDay() : currentDate.getDay();
            const dayOfWeek = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][dayIndex];
            matchesByday = byday.includes(dayOfWeek);
          }
          
          if (iterations < 15) {
            const dayIndex = event.allDay ? currentDate.getUTCDay() : currentDate.getDay();
            console.log(`  Iteration ${iterations}: ${currentDate.toISOString()}, day=${['SU','MO','TU','WE','TH','FR','SA'][dayIndex]}, matchesByday=${matchesByday}, inRange=${currentDate >= this.requestedStartDate && currentDate <= this.requestedEndDate}`);
          }
          
          if (matchesByday && currentDate >= this.requestedStartDate) {
            const duration = event.end ? event.end.getTime() - event.start.getTime() : 0;
            // For all-day events, create date at local midnight to avoid timezone display issues
            let occurrenceDate;
            if (event.allDay) {
              occurrenceDate = new Date(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate());
            } else {
              occurrenceDate = new Date(currentDate);
            }
            
            expanded.push({
              id: event.id + '_' + currentDate.getTime(),
              title: event.title,
              start: occurrenceDate,
              end: duration > 0 ? new Date(occurrenceDate.getTime() + duration) : occurrenceDate,
              allDay: event.allDay,
            });
          }
          
          // Add interval weeks (7 days per week)
          currentDate = new Date(currentDate.getTime() + (interval * 7 * 24 * 60 * 60 * 1000));
          iterations++;
        }
        
        console.log(`  WEEKLY loop completed: ${iterations} iterations`);
      }
      // Handle FREQ=DAILY
      else if (rrule.includes('FREQ=DAILY')) {
        const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
        const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;
        
        let currentDate = new Date(dtstart);
        const maxIterations = 365; // Max 1 year of daily events
        let iterations = 0;
        
        while (currentDate <= this.requestedEndDate && iterations < maxIterations) {
          if (currentDate >= this.requestedStartDate) {
            const duration = event.end ? event.end.getTime() - event.start.getTime() : 0;
            expanded.push({
              id: event.id + '_' + currentDate.getTime(),
              title: event.title,
              start: new Date(currentDate),
              end: duration > 0 ? new Date(currentDate.getTime() + duration) : new Date(currentDate),
              allDay: event.allDay,
            });
          }
          
          currentDate = new Date(currentDate.getTime() + (interval * 24 * 60 * 60 * 1000));
          iterations++;
        }
      }
      else {
        // Unknown RRULE format, return original
        console.log(`  Unknown RRULE format for "${event.title}"`);
        return [event];
      }
      
      console.log(`  Expanded to ${expanded.length} occurrences`);
      if (expanded.length > 0) {
        console.log(`  First occurrence: ${expanded[0].start.toISOString()}`);
        console.log(`  Last occurrence: ${expanded[expanded.length - 1].start.toISOString()}`);
      }
      
      return expanded.length > 0 ? expanded : [event];
    } catch (error) {
      console.warn(`Failed to expand recurring event "${event.title}":`, error);
      return [event];
    }
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
