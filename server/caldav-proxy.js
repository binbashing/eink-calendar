import express from 'express';
import cors from 'cors';
import { createDAVClient } from 'tsdav';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/calendar/events', async (req, res) => {
  try {
    const { serverUrl, username, password, startDate, endDate, calendarFilter } = req.query;
    
    const client = await createDAVClient({
      serverUrl: String(serverUrl),
      credentials: {
        username: String(username),
        password: String(password),
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });

    const calendars = await client.fetchCalendars();
    console.log(`Found ${calendars.length} calendars:`, calendars.map(c => c.displayName || c.url));
    
    const allEvents = [];

    // Filter calendars if calendarFilter is provided
    const filteredCalendars = calendarFilter 
      ? calendars.filter(cal => 
          (cal.displayName || '').toLowerCase().includes(String(calendarFilter).toLowerCase())
        )
      : calendars;

    console.log(`Using ${filteredCalendars.length} calendars after filtering for "${calendarFilter}"`);

    for (const calendar of filteredCalendars) {
      const calendarObjects = await client.fetchCalendarObjects({
        calendar,
        timeRange: {
          start: String(startDate),
          end: String(endDate),
        },
      });
      console.log(`Found ${calendarObjects.length} events in calendar: ${calendar.displayName}`);
      allEvents.push(...calendarObjects);
    }

    res.json({ events: allEvents });
  } catch (error) {
    console.error('CalDAV fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.CALDAV_PROXY_PORT || 4001;
app.listen(PORT, () => {
  console.log(`CalDAV proxy server running on port ${PORT}`);
});
