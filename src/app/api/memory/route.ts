// ──────────────────────────────────────────────
// Memory API Route — CRUD for user memories
// ──────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET — retrieve all memories for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyIdToken(authHeader.slice(7));
    const supabase = createServerSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('firebase_uid', decoded.uid)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: memories } = await supabase
      .from('memory')
      .select('*')
      .eq('profile_id', profile.id)
      .order('updated_at', { ascending: false });

    return NextResponse.json({ memories: memories || [] });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE — remove a specific memory entry
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyIdToken(authHeader.slice(7));
    const supabase = createServerSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('firebase_uid', decoded.uid)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { memory_id } = await req.json();

    await supabase
      .from('memory')
      .delete()
      .eq('id', memory_id)
      .eq('profile_id', profile.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 });
  }
}
