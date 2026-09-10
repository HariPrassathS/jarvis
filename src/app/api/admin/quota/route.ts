// ──────────────────────────────────────────────
// Admin API Route: /api/admin/quota
// Real-time operator dashboard for LLM provider quotas, circuit breakers, and rate limits
// ──────────────────────────────────────────────

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { quotaTracker } from '@/lib/quota/tracker';
import { getCircuitBreakerStatus } from '@/lib/llm/router';
import { queryCache } from '@/lib/cache/query-cache';

export async function GET(req: NextRequest) {
  try {
    // Optional Authentication: check Bearer token if provided
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const idToken = authHeader.slice(7);
      try {
        await verifyIdToken(idToken);
      } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const [providerStatuses, circuitBreakers] = await Promise.all([
      quotaTracker.getAllStatuses(),
      Promise.resolve(getCircuitBreakerStatus()),
    ]);

    const resetWindow = quotaTracker.getTimeUntilReset();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      reset_window_utc: {
        countdown: resetWindow.formatted,
        hours_remaining: resetWindow.hours,
        minutes_remaining: resetWindow.minutes,
      },
      providers: providerStatuses,
      circuit_breakers: circuitBreakers,
      query_cache: {
        cached_entries: queryCache?.size || 0,
      },
      status: 'nominal',
    });
  } catch (err) {
    console.error('[Admin Quota API] Error:', err);
    return NextResponse.json({ error: 'Failed to inspect capacity' }, { status: 500 });
  }
}
