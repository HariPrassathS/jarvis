// ──────────────────────────────────────────────
// Google Calendar Tool — Queries Google Calendar API v3
// Supports incremental OAuth token authentication
// ──────────────────────────────────────────────

export interface CalendarEventItem {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
  htmlLink?: string;
}

export interface GetCalendarEventsParams {
  time_frame?: 'today' | 'tomorrow' | 'this_week' | 'upcoming';
  max_results?: number;
}

/**
 * Fetch events from Google Calendar API v3 using user's OAuth access token.
 */
export async function getCalendarEvents(
  params: GetCalendarEventsParams = {},
  googleAccessToken?: string
): Promise<string> {
  if (!googleAccessToken) {
    return 'PERMISSION_REQUIRED: Google Calendar access has not been granted by the operator yet. Please inform the operator that calendar permissions are needed to view their schedule, and invite them to grant access.';
  }

  const timeFrame = params.time_frame || 'today';
  const maxResults = Math.min(Math.max(params.max_results || 10, 1), 25);

  const now = new Date();
  let timeMin: Date;
  let timeMax: Date;

  if (timeFrame === 'tomorrow') {
    timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
  } else if (timeFrame === 'this_week' || timeFrame === 'upcoming') {
    timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59, 999);
  } else {
    // 'today' (default)
    timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  }

  try {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', timeMin.toISOString());
    url.searchParams.set('timeMax', timeMax.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', maxResults.toString());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 401 || response.status === 403) {
      return 'PERMISSION_REQUIRED: Google Calendar authorization token has expired or lacks calendar.readonly permission. Advise the operator to re-authenticate or grant calendar access.';
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn('[Calendar Tool] API call failed:', response.status, errText);
      return `Calendar service encountered an error (${response.status}). Unable to fetch events at this moment.`;
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];

    const activeEvents = items.filter((item: any) => item.status !== 'cancelled');

    if (activeEvents.length === 0) {
      const timeFrameLabel =
        timeFrame === 'today'
          ? 'today'
          : timeFrame === 'tomorrow'
          ? 'tomorrow'
          : 'the next 7 days';
      return `No calendar events scheduled for ${timeFrameLabel}. The operator's schedule is completely clear.`;
    }

    const formattedEvents = activeEvents.map((item: any) => {
      const summary = item.summary || '(Untitled Event)';
      const isAllDay = !item.start?.dateTime && !!item.start?.date;

      let timeString = '';
      if (isAllDay) {
        timeString = 'All Day';
      } else if (item.start?.dateTime) {
        const startDt = new Date(item.start.dateTime);
        const endDt = item.end?.dateTime ? new Date(item.end.dateTime) : null;
        const timeFormatter = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: 'numeric',
          hour12: true,
        });
        const startStr = timeFormatter.format(startDt);
        const endStr = endDt ? timeFormatter.format(endDt) : '';
        timeString = endStr ? `${startStr} – ${endStr}` : startStr;
      }

      let line = `- ${summary} [${timeString}]`;
      if (item.location) {
        line += ` | Location: ${item.location}`;
      }
      return line;
    });

    const timeLabel =
      timeFrame === 'today'
        ? 'Today'
        : timeFrame === 'tomorrow'
        ? 'Tomorrow'
        : 'Upcoming (Next 7 Days)';

    return `Google Calendar Events (${timeLabel} - ${activeEvents.length} found):\n` + formattedEvents.join('\n');
  } catch (err: any) {
    console.error('[Calendar Tool] Exception:', err);
    return `Error accessing Google Calendar: ${err?.message || 'Network failure'}`;
  }
}
