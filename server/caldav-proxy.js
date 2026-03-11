import express from 'express';
import cors from 'cors';
import { createDAVClient } from 'tsdav';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_DIR_PATH = '/app/data';
const SETTINGS_FILE_PATH = path.join(SETTINGS_DIR_PATH, 'calendar-settings.json');
const PREVIOUS_SETTINGS_DIR_PATH = path.join(path.resolve(__dirname, '..'), 'settings');
const PREVIOUS_SETTINGS_FILE_PATH = path.join(PREVIOUS_SETTINGS_DIR_PATH, 'calendar-settings.json');
const LEGACY_SETTINGS_FILE_PATH = path.join(__dirname, 'calendar-settings.json');
const DEFAULT_SETTINGS = {
  safeMargin: 16,
  monthFontSize: 70,
  weekdayFontSize: 30,
  eventFontSize: 48,
  backgroundColor: '#95ff00',
  monthFontFamily: 'Delius Unicase, cursive',
  eventFontFamily: 'Delius Unicase, cursive',
  monthBold: true,
  eventBold: true,
  customFonts: [],
  fontSearchTerm: '',
  selectedFontCategory: 'All',
  useCalDAV: true,
};

async function readSettingsFile() {
  const candidatePaths = [
    SETTINGS_FILE_PATH,
    PREVIOUS_SETTINGS_FILE_PATH,
    LEGACY_SETTINGS_FILE_PATH,
  ];

  try {
    for (const candidatePath of candidatePaths) {
      try {
        const raw = await fs.readFile(candidatePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { ...DEFAULT_SETTINGS };
        }
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
        };
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          continue;
        }
        throw error;
      }
    }

    return { ...DEFAULT_SETTINGS };
  } catch (error) {
    throw error;
  }
}

async function writeSettingsFile(data) {
  await fs.mkdir(SETTINGS_DIR_PATH, { recursive: true });
  const tempPath = path.join(SETTINGS_DIR_PATH, `calendar-settings.${Date.now()}.tmp`);
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempPath, SETTINGS_FILE_PATH);
}

app.get('/api/settings', async (_req, res) => {
  try {
    const settings = await readSettingsFile();
    res.set('Cache-Control', 'no-store');
    res.json(settings);
  } catch (error) {
    console.error('Failed to read settings file:', error);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const incomingSettings = req.body;
    if (!incomingSettings || typeof incomingSettings !== 'object' || Array.isArray(incomingSettings)) {
      return res.status(400).json({ error: 'Settings payload must be a JSON object' });
    }

    const currentSettings = await readSettingsFile();
    const mergedSettings = {
      ...currentSettings,
      ...incomingSettings,
    };

    await writeSettingsFile(mergedSettings);
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true });
  } catch (error) {
    console.error('Failed to write settings file:', error);
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

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
