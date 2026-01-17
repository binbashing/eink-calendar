import { createDAVClient } from 'tsdav';
import { RRule, RRuleSet, rrulestr } from 'rrule';

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
  sequence?: number;
  recurrenceId?: Date; // Original date this event was moved from
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
    
    // Deduplicate events (handles cases where CalDAV server doesn't properly add EXDATE for modified occurrences)
    const deduped = this.deduplicateEvents(events);
    if (deduped.length !== events.length) {
      console.log(`Deduplicated ${events.length - deduped.length} duplicate events`);
    }
    
    return deduped;
  }

  private deduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
    // First, collect all recurrenceIds to know which dates to exclude from recurring events
    const modifiedOccurrences = new Set<string>();
    events.forEach(event => {
      if (event.recurrenceId) {
        // Create key from title + recurrenceId date
        const dateKey = event.allDay
          ? event.recurrenceId.toDateString()
          : event.recurrenceId.toISOString().split('T')[0];
        modifiedOccurrences.add(`${event.title}__${dateKey}`);
      }
    });
    
    // Filter out recurring occurrences that have been modified
    const filtered = events.filter(event => {
      // Keep all non-recurring events and events with recurrenceId (exceptions)
      if (event.sequence !== 0 || event.recurrenceId) {
        return true;
      }
      
      // For expanded recurring events (sequence 0), check if this occurrence was modified
      const dateKey = event.allDay
        ? event.start.toDateString()
        : event.start.toISOString().split('T')[0];
      const key = `${event.title}__${dateKey}`;
      
      if (modifiedOccurrences.has(key)) {
        console.debug(`Dedup: Filtered recurring occurrence of "${event.title}" on ${dateKey} (replaced by exception)`);
        return false; // Exclude this recurring occurrence
      }
      
      return true;
    });
    
    // Now deduplicate same-day events by sequence
    const eventMap = new Map<string, CalendarEvent>();
    
    for (const event of filtered) {
      const dateKey = event.allDay 
        ? event.start.toDateString()
        : event.start.toISOString().split('T')[0];
      const key = `${event.title}__${dateKey}`;
      
      const existing = eventMap.get(key);
      if (!existing) {
        eventMap.set(key, event);
      } else {
        const existingSeq = existing.sequence || 0;
        const newSeq = event.sequence || 0;
        
        if (newSeq > existingSeq) {
          eventMap.set(key, event);
          console.debug(`Dedup: Replaced "${event.title}" on ${dateKey} (seq ${existingSeq} → ${newSeq})`);
        } else if (newSeq === existingSeq && event.start.getTime() !== existing.start.getTime()) {
          // Same sequence but different times - these are legitimately different events, keep both
          const timeKey = `${event.title}__${event.start.toISOString()}`;
          eventMap.set(timeKey, event);
        }
      }
    }
    
    return Array.from(eventMap.values());
  }

  private parseICalData(icalData: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const lines = icalData.split('\n');
    
    let currentEvent: Partial<CalendarEvent> & { rrule?: string; recurrenceId?: string; status?: string; exdates?: Date[] } = {};
    let inEvent = false;

    for (let line of lines) {
      line = line.trim();

      if (line === 'BEGIN:VEVENT') {
        inEvent = true;
        currentEvent = { exdates: [] };
      } else if (line === 'END:VEVENT' && inEvent) {
        // Skip cancelled events
        if (currentEvent.status === 'CANCELLED') {
          console.debug(`Skipped cancelled event: ${currentEvent.title}`);
          inEvent = false;
          continue;
        }
        
        if (currentEvent.title && currentEvent.start) {
          // If this event has RECURRENCE-ID, it's an exception - treat as standalone
          if (currentEvent.recurrenceId) {
            events.push({
              id: currentEvent.id || Math.random().toString(36),
              title: currentEvent.title,
              start: currentEvent.start,
              end: currentEvent.end,
              allDay: currentEvent.allDay || false,
              sequence: currentEvent.sequence,
              recurrenceId: currentEvent.recurrenceId, // Store the original date
            });
          }
          // If this event has an RRULE (and no RECURRENCE-ID), expand it
          else if (currentEvent.rrule) {
            try {
              const expandedEvents = this.expandRecurringEvent(
                currentEvent as CalendarEvent & { rrule: string; exdates?: Date[] }
              );
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
                sequence: currentEvent.sequence,
              });
            }
          } else {
            events.push({
              id: currentEvent.id || Math.random().toString(36),
              title: currentEvent.title,
              start: currentEvent.start,
              end: currentEvent.end,
              allDay: currentEvent.allDay || false,
              sequence: currentEvent.sequence,
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
          // Parse the date value from RECURRENCE-ID
          const colonPos = key.indexOf(':');
          const dateValue = colonPos > 0 ? value : value;
          try {
            currentEvent.recurrenceId = this.parseDateTime(dateValue, !dateValue.includes('T'));
            console.debug(`Event has RECURRENCE-ID: ${dateValue} -> ${currentEvent.recurrenceId} (title: ${currentEvent.title})`);
          } catch (error) {
            console.warn(`Failed to parse RECURRENCE-ID: ${value}`);
          }
        } else if (key === 'STATUS') {
          currentEvent.status = value;
        } else if (key === 'SEQUENCE') {
          currentEvent.sequence = parseInt(value) || 0;
        } else if (key.startsWith('EXDATE')) {
          // EXDATE can have timezone info: EXDATE;TZID=America/New_York:20251126T200000
          // For simplicity, parse the date value and add to exdates array
          const dateValue = value;
          try {
            const exdate = this.parseDateTime(dateValue, !dateValue.includes('T'));
            if (!currentEvent.exdates) currentEvent.exdates = [];
            currentEvent.exdates.push(exdate);
          } catch (error) {
            console.warn(`Failed to parse EXDATE: ${value}`);
          }
        }
      }
    }

    return events;
  }

  private expandRecurringEvent(event: CalendarEvent & { rrule: string; exdates?: Date[] }): CalendarEvent[] {
    try {
      if (!this.requestedStartDate || !this.requestedEndDate) {
        return [event];
      }
      
      const rruleString = event.rrule;
      const dtstart = event.start;
      const exdates = event.exdates || [];
      
      // Parse RRULE using standard library
      const rruleSet = new RRuleSet();
      
      // Add the RRULE with DTSTART
      const rule = rrulestr(rruleString, { dtstart });
      rruleSet.rrule(rule);
      
      // Add EXDATE exclusions
      for (const exdate of exdates) {
        rruleSet.exdate(exdate);
      }
      
      // Get all occurrences within the requested date range
      const occurrences = rruleSet.between(
        this.requestedStartDate,
        this.requestedEndDate,
        true // inclusive
      );
      
      // Convert occurrences to CalendarEvent objects
      const duration = event.end ? event.end.getTime() - event.start.getTime() : 0;
      const expanded: CalendarEvent[] = occurrences.map((occurrence, index) => {
        // For all-day events, create date at local midnight to avoid timezone display issues
        let occurrenceDate;
        if (event.allDay) {
          occurrenceDate = new Date(occurrence.getUTCFullYear(), occurrence.getUTCMonth(), occurrence.getUTCDate());
        } else {
          occurrenceDate = occurrence;
        }
        
        return {
          id: event.id + '_' + occurrence.getTime(),
          title: event.title,
          start: occurrenceDate,
          end: duration > 0 ? new Date(occurrenceDate.getTime() + duration) : occurrenceDate,
          allDay: event.allDay,
          sequence: 0, // Expanded recurring events have sequence 0
        };
      });
      
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
