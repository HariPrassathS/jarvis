// ──────────────────────────────────────────────
// Calendar Events API Route — Direct calendar inspection endpoint
// ──────────────────────────────────────────────

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getCalendarEvents } from '@/lib/tools/calendar';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    try {
      await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const googleAccessToken = req.headers.get('x-google-access-token') || undefined;
    const timeFrame = (req.nextUrl.searchParams.get('time_frame') as any) || 'today';
    const maxResults = parseInt(req.nextUrl.searchParams.get('max_results') || '10', 10);

    const result = await getCalendarEvents({ time_frame: timeFrame, max_results: maxResults }, googleAccessToken);

    return NextResponse.json({
      events_summary: result,
      granted: !result.startsWith('PERMISSION_REQUIRED'),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}
