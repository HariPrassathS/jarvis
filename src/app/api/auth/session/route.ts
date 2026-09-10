export const dynamic = 'force-dynamic';
export const maxDuration = 15;

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Missing or invalid request body' }, { status: 400 });
    }

    const { id_token } = body || {};
    if (!id_token) {
      return NextResponse.json(
        { error: 'Missing id_token in payload' },
        { status: 400 }
      );
    }

    // 1. Verify Firebase ID token
    const decoded = await verifyIdToken(id_token);

    const fallbackProfile = {
      id: decoded.uid,
      firebase_uid: decoded.uid,
      email: decoded.email || '',
      display_name: decoded.name || decoded.email?.split('@')[0] || 'Operator',
      photo_url: decoded.picture || null,
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    };

    // 2. Upsert profile into Supabase
    try {
      const supabase = createServerSupabaseClient();

      const { data: profile, error } = await supabase
        .from('profiles')
        .upsert(
          {
            firebase_uid: decoded.uid,
            email: decoded.email || '',
            display_name: decoded.name || decoded.email?.split('@')[0] || 'Operator',
            photo_url: decoded.picture || null,
            last_login_at: new Date().toISOString(),
          },
          {
            onConflict: 'firebase_uid',
          }
        )
        .select()
        .single();

      if (error || !profile) {
        console.warn('[Auth Session] Supabase profile upsert warning (using fallback):', error);
        return NextResponse.json({ profile: fallbackProfile });
      }

      // 3. Ensure user has a settings row (non-blocking)
      Promise.resolve(
        supabase
          .from('settings')
          .upsert(
            { profile_id: profile.id },
            { onConflict: 'profile_id' }
          )
      ).catch(() => {});

      return NextResponse.json({ profile });
    } catch (dbErr) {
      console.warn('[Auth Session] Database connection error (using verified token profile):', dbErr);
      return NextResponse.json({ profile: fallbackProfile });
    }
  } catch (error) {
    console.error('Auth session error:', error);
    const msg = error instanceof Error ? error.message : 'Invalid or expired token';
    return NextResponse.json(
      { error: msg },
      { status: 401 }
    );
  }
}
