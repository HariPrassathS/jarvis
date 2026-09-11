// ──────────────────────────────────────────────
// Privacy API Route — Data Export
// Self-serve, instant download of all user data across Supabase tables
// ──────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate via verified Firebase ID Token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing authentication token' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
    } catch (authErr) {
      console.error('[Privacy Export API] Token verification failed:', authErr);
      return NextResponse.json({ error: 'Unauthorized: Invalid authentication session' }, { status: 401 });
    }

    const profileUid = decoded.uid;
    const supabase = createServerSupabaseClient();

    // 2. Query profile record
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('firebase_uid', profileUid)
      .maybeSingle();

    if (profileErr) {
      console.error('[Privacy Export API] Profile query error:', profileErr);
    }

    const profileId = profile?.id || profileUid;

    // 3. Parallel queries for settings, memories, conversations
    const [settingsRes, memoryRes, convRes] = await Promise.all([
      supabase.from('settings').select('*').eq('profile_id', profileId).maybeSingle(),
      supabase.from('memory').select('*').eq('profile_id', profileId).order('updated_at', { ascending: false }),
      supabase.from('conversations').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
    ]);

    const settings = settingsRes.data || null;
    const memories = memoryRes.data || [];
    const conversations = convRes.data || [];

    // 4. Query messages for all conversations
    let messagesMap: Record<string, any[]> = {};
    if (conversations.length > 0) {
      const convIds = conversations.map((c) => c.id);
      const { data: messages, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: true });

      if (!msgErr && messages) {
        for (const msg of messages) {
          if (!messagesMap[msg.conversation_id]) {
            messagesMap[msg.conversation_id] = [];
          }
          messagesMap[msg.conversation_id].push(msg);
        }
      }
    }

    // 5. Build clean export bundle
    const exportData = {
      export_metadata: {
        system: 'J.A.R.V.I.S Autonomous Intelligence Matrix',
        export_timestamp: new Date().toISOString(),
        format_version: '1.0',
        operator_name: profile?.display_name || decoded.name || 'Operator',
        operator_email: profile?.email || decoded.email || '',
        firebase_uid: profileUid,
      },
      profile: profile || {
        firebase_uid: profileUid,
        email: decoded.email,
        display_name: decoded.name,
      },
      settings: settings || {
        preferred_provider: 'groq',
        voice_persona: 'jarvis',
        clearance_level: 9,
      },
      memories: memories.map((m) => ({
        id: m.id,
        key: m.key,
        value: m.value,
        updated_at: m.updated_at,
      })),
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        created_at: c.created_at,
        messages: (messagesMap[c.id] || []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          provider_used: m.provider_used,
          created_at: m.created_at,
        })),
      })),
    };

    const sanitizedName = (profile?.display_name || 'operator').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `jarvis-data-export-${sanitizedName}-${Date.now()}.json`;

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[Privacy Export API] Error generating export:', error);
    return NextResponse.json({ error: 'Failed to generate data export' }, { status: 500 });
  }
}
