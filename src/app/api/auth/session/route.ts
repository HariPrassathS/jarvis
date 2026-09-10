// ──────────────────────────────────────────────
// Auth Session API — Verify Firebase Token, Upsert to Supabase
// ──────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { id_token } = await req.json();

    if (!id_token) {
      return NextResponse.json(
        { error: 'Missing id_token' },
        { status: 400 }
      );
    }

    // 1. Verify Firebase ID token
    const decoded = await verifyIdToken(id_token);

    // 2. Upsert profile into Supabase
    const supabase = createServerSupabaseClient();

    const { data: profile, error } = await supabase
      .from('profiles')
      .upsert(
        {
          firebase_uid: decoded.uid,
          email: decoded.email || '',
          display_name: decoded.name || decoded.email?.split('@')[0] || 'User',
          photo_url: decoded.picture || null,
          last_login_at: new Date().toISOString(),
        },
        {
          onConflict: 'firebase_uid',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Supabase upsert error:', error);
      return NextResponse.json(
        { error: 'Failed to sync profile' },
        { status: 500 }
      );
    }

    // 3. Ensure user has a settings row
    await supabase
      .from('settings')
      .upsert(
        { profile_id: profile.id },
        { onConflict: 'profile_id' }
      );

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Auth session error:', error);
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }
}
