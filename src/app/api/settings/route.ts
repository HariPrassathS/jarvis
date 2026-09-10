// ──────────────────────────────────────────────
// Settings API Route — Manage User Preferences & Voice Persona
// ──────────────────────────────────────────────

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { jarvisCache } from '@/lib/llm/cache';
import type { VoicePersona, UserSettings } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing authentication token' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
    } catch (authErr) {
      console.error('[Settings API] Token verification failed:', authErr);
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();

    // Resolve profile
    let profile = jarvisCache.get<{ id: string }>(`profile:${decoded.uid}`);
    if (!profile) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('firebase_uid', decoded.uid)
        .maybeSingle();

      if (existingProfile) {
        profile = existingProfile;
      } else {
        return NextResponse.json({
          settings: {
            profile_id: decoded.uid,
            voice_enabled: true,
            preferred_provider: 'groq',
            theme: 'dark-hud',
            voice_persona: 'jarvis',
          },
        });
      }
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (!settings) {
      const defaultSettings: UserSettings = {
        profile_id: profile.id,
        voice_enabled: true,
        preferred_provider: 'groq',
        theme: 'dark-hud',
        voice_persona: 'jarvis',
      };

      await supabase.from('settings').upsert(defaultSettings, { onConflict: 'profile_id' });
      return NextResponse.json({ settings: defaultSettings });
    }

    return NextResponse.json({
      settings: {
        ...settings,
        voice_persona: (settings.voice_persona as VoicePersona) || 'jarvis',
      },
    });
  } catch (error) {
    console.error('[Settings API] GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve settings' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing authentication token' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
    } catch (authErr) {
      console.error('[Settings API] Token verification failed:', authErr);
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { voice_persona, preferred_provider, voice_enabled } = body;

    // Validate persona
    let validatedPersona: VoicePersona | undefined = undefined;
    if (voice_persona !== undefined) {
      if (voice_persona === 'jarvis' || voice_persona === 'friday') {
        validatedPersona = voice_persona;
      } else {
        return NextResponse.json({ error: "Invalid voice_persona. Allowed: 'jarvis' | 'friday'" }, { status: 400 });
      }
    }

    const supabase = createServerSupabaseClient();

    // Resolve profile
    let profile = jarvisCache.get<{ id: string }>(`profile:${decoded.uid}`);
    if (!profile) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('firebase_uid', decoded.uid)
        .maybeSingle();

      if (!existingProfile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      profile = existingProfile;
    }

    const updatePayload: Partial<UserSettings> = {};
    if (validatedPersona !== undefined) updatePayload.voice_persona = validatedPersona;
    if (preferred_provider !== undefined) updatePayload.preferred_provider = preferred_provider;
    if (voice_enabled !== undefined) updatePayload.voice_enabled = voice_enabled;

    const { data: updated, error } = await supabase
      .from('settings')
      .upsert(
        {
          profile_id: profile.id,
          ...updatePayload,
        },
        { onConflict: 'profile_id' }
      )
      .select('*')
      .single();

    if (error) {
      console.error('[Settings API] Update error:', error);
      throw error;
    }

    // Invalidate caches
    jarvisCache.delete(`settings:${profile.id}`);

    return NextResponse.json({
      settings: {
        ...updated,
        voice_persona: (updated.voice_persona as VoicePersona) || 'jarvis',
      },
    });
  } catch (error) {
    console.error('[Settings API] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
