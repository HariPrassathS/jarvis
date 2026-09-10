// ──────────────────────────────────────────────
// Chat History API Route — Rehydrate Past Conversations
// Enables seamless session continuity across reloads and logins
// ──────────────────────────────────────────────

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { jarvisCache } from '@/lib/llm/cache';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user via Firebase ID Token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
    } catch (authErr) {
      console.error('[Chat History API] Token verification failed:', authErr);
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const profileUid = decoded.uid;
    const supabase = createServerSupabaseClient();

    // 2. Resolve profile
    const profileCacheKey = `profile:${profileUid}`;
    let profile = jarvisCache.get<{ id: string; display_name: string }>(profileCacheKey);

    if (!profile) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('firebase_uid', profileUid)
        .maybeSingle();

      if (existingProfile) {
        profile = existingProfile;
        jarvisCache.set(profileCacheKey, profile, 600000);
      } else {
        return NextResponse.json({ conversation_id: null, title: null, messages: [] });
      }
    }

    // 3. Check requested conversation_id or fetch most recent
    const requestedConvId = req.nextUrl.searchParams.get('conversation_id');

    let activeConv: { id: string; title: string | null } | null = null;

    if (requestedConvId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id, title')
        .eq('id', requestedConvId)
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (conv) {
        activeConv = conv;
      }
    }

    // If requested conversation wasn't found or wasn't provided, get the latest conversation
    if (!activeConv) {
      const { data: latestConv } = await supabase
        .from('conversations')
        .select('id, title')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestConv) {
        activeConv = latestConv;
      }
    }

    // If still no conversation exists, return empty structure
    if (!activeConv) {
      return NextResponse.json({
        conversation_id: null,
        title: null,
        messages: [],
      });
    }

    // 4. Fetch all messages for the active conversation
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('id, role, content, provider_used, created_at')
      .eq('conversation_id', activeConv.id)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.warn('[Chat History API] Failed to fetch messages:', msgError);
    }

    return NextResponse.json({
      conversation_id: activeConv.id,
      title: activeConv.title,
      messages: (messages || []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        provider_used: m.provider_used,
        created_at: m.created_at,
      })),
    });
  } catch (error) {
    console.error('[Chat History API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve conversation history' },
      { status: 500 }
    );
  }
}
