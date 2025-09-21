# CalDAV Setup Guide

## Google Calendar Setup

1. **Generate App-Specific Password**:
   - Go to [Google Account Settings](https://myaccount.google.com/)
   - Navigate to **Security** → **2-Step Verification**
   - Scroll down to **App passwords**
   - Click **Generate app password**
   - Select "Mail" or "Other" → enter "Calendar App"
   - Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

2. **Configure Environment Variables**:
   Edit the `.env` file in your project root:
   ```env
   VITE_CALDAV_SERVER_URL=https://caldav.google.com/caldav/v2/
   VITE_CALDAV_USERNAME=your-email@gmail.com
   VITE_CALDAV_PASSWORD=your-app-specific-password
   ```

3. **Test the Connection**:
   - Restart your dev server: `npm run dev`
   - Open http://localhost:3000
   - Look for "Calendar Integration" section
   - Toggle "Use Google Calendar (CalDAV)" switch
   - Click "Refresh Events" to test

## Alternative Providers

### iCloud Calendar:
```env
VITE_CALDAV_SERVER_URL=https://caldav.icloud.com/
VITE_CALDAV_USERNAME=your-apple-id@icloud.com
VITE_CALDAV_PASSWORD=your-app-specific-password
```

### Outlook/Office 365:
```env
VITE_CALDAV_SERVER_URL=https://outlook.office365.com/
VITE_CALDAV_USERNAME=your-email@outlook.com
VITE_CALDAV_PASSWORD=your-password
```

## Troubleshooting

### Common Issues:

1. **"CalDAV credentials not configured"**:
   - Check that all three environment variables are set in `.env`
   - Restart the dev server after changing `.env`

2. **"Failed to connect to CalDAV server"**:
   - Verify your username/email is correct
   - Make sure you're using an app-specific password, not your regular password
   - Check that 2-factor authentication is enabled on your account

3. **"No events found"**:
   - Ensure your calendar has events in the current month
   - Check that your calendar is not private/hidden
   - Try the "Refresh Events" button

4. **"Permission denied"**:
   - For Google: Make sure you generated an app-specific password
   - For iCloud: Enable calendar access in iCloud settings
   - For Outlook: Check if your organization allows CalDAV access

### Testing CalDAV Connection:

You can test your CalDAV credentials using curl:

```bash
# Test Google Calendar
curl -u "your-email@gmail.com:your-app-password" \
  "https://caldav.google.com/caldav/v2/"

# Test iCloud
curl -u "your-apple-id@icloud.com:your-app-password" \
  "https://caldav.icloud.com/"
```

If successful, you should see an XML response with calendar information.

## Security Notes

- **Never commit `.env` files** to version control
- **Use app-specific passwords** instead of your main account password
- **Revoke app passwords** if they're no longer needed
- **Store credentials securely** in production environments
