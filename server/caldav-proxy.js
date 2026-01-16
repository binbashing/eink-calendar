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
      
      // Log event details for debugging (show first event as sample)
      if (calendarObjects.length > 0) {
        const sample = calendarObjects[0];
        console.log('Sample ICS event:');
        console.log(sample.data.substring(0, 500));
        
        // Look for Clover Bravecto event
        const cloverEvent = calendarObjects.find(e => e.data.includes('Clover Bravecto'));
        if (cloverEvent) {
          console.log('\n=== CLOVER BRAVECTO EVENT ===');
          console.log(cloverEvent.data);
          console.log('=== END CLOVER ===\n');
        }
        
        // Look for Buster Bravecto event
        const busterEvent = calendarObjects.find(e => e.data.includes('Buster Bravecto'));
        if (busterEvent) {
          console.log('\n=== BUSTER BRAVECTO EVENT ===');
          console.log(busterEvent.data);
          console.log('=== END BUSTER ===\n');
        }
        
        // Look for Game Nazareth event
        const gameEvent = calendarObjects.find(e => e.data.includes('Game Nazareth'));
        if (gameEvent) {
          console.log('\n=== GAME NAZARETH EVENT ===');
          console.log(gameEvent.data);
          console.log('=== END GAME ===\n');
        }
      }
      
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
