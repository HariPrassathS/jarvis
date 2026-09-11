// ──────────────────────────────────────────────
// Privacy API Route — Full Account Deletion ("Forget Everything")
// Permanently expunges all records across Supabase tables for the verified operator
// ──────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { jarvisCache } from '@/lib/llm/cache';
import { deleteUserFiles } from '@/lib/files/storage';
import { deleteUploadedFilesByProfile } from '@/lib/files/metadata';

const CONFIRMATION_PHRASE = 'DELETE ALL DATA';

export async function POST(req: NextRequest) {
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
      console.error('[Privacy Deletion API] Token verification failed:', authErr);
      return NextResponse.json({ error: 'Unauthorized: Invalid authentication session' }, { status: 401 });
    }

    const profileUid = decoded.uid;

    // 2. Validate confirmation phrase payload
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Missing or invalid request payload' }, { status: 400 });
    }

    const confirmation = (body.confirmation || body.confirmation_phrase || '').trim();
    if (confirmation !== CONFIRMATION_PHRASE) {
      return NextResponse.json(
        {
          error: `Safety guard triggered. Please provide the exact confirmation phrase: "${CONFIRMATION_PHRASE}"`,
        },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 3. Resolve profile record
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('firebase_uid', profileUid)
      .maybeSingle();

    const profileId = profile?.id;

    let deletedConversationsCount = 0;
    let deletedMessagesCount = 0;
    let deletedMemoriesCount = 0;
    let deletedFilesCount = 0;

    // A. Purge all stored binary files from 'user-files' Supabase Storage bucket
    try {
      const { deletedCount } = await deleteUserFiles(profileUid);
      deletedFilesCount = deletedCount;
    } catch (storageDelErr) {
      console.warn('[Privacy Deletion API] Storage purge warning:', storageDelErr);
    }

    if (profileId) {
      // B. Purge file metadata records from PostgreSQL
      try {
        const { deletedCount: dbFilesCount } = await deleteUploadedFilesByProfile(profileId);
        if (dbFilesCount > deletedFilesCount) deletedFilesCount = dbFilesCount;
      } catch (dbFileErr) {
        console.warn('[Privacy Deletion API] File metadata purge warning:', dbFileErr);
      }

      // Find all conversations
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .eq('profile_id', profileId);

      if (conversations && conversations.length > 0) {
        const convIds = conversations.map((c) => c.id);
        deletedConversationsCount = convIds.length;

        // Delete all messages belonging to user conversations
        const { count: msgCount } = await supabase
          .from('messages')
          .delete({ count: 'exact' })
          .in('conversation_id', convIds);
        deletedMessagesCount = msgCount || 0;

        // Delete conversations
        await supabase
          .from('conversations')
          .delete()
          .eq('profile_id', profileId);
      }

      // Delete memories
      const { count: memCount } = await supabase
        .from('memory')
        .delete({ count: 'exact' })
        .eq('profile_id', profileId);
      deletedMemoriesCount = memCount || 0;

      // Delete settings
      await supabase
        .from('settings')
        .delete()
        .eq('profile_id', profileId);

      // Delete profile
      await supabase
        .from('profiles')
        .delete()
        .eq('id', profileId);
    } else {
      // Direct delete by firebase_uid
      await supabase
        .from('profiles')
        .delete()
        .eq('firebase_uid', profileUid);
    }

    // 4. Invalidate all server memory caches for this operator
    jarvisCache.delete(`profile:${profileUid}`);
    jarvisCache.delete(`files:${profileUid}`);
    if (profileId) {
      jarvisCache.delete(`settings:${profileId}`);
      jarvisCache.delete(`memories:${profileId}`);
    }

    console.log(`[Privacy Deletion API] Operator ${profileUid} permanently purged from Supabase.`);

    return NextResponse.json({
      success: true,
      message: 'All operator data across Stark Matrix tables and Storage has been permanently expunged.',
      summary: {
        conversations_purged: deletedConversationsCount,
        messages_purged: deletedMessagesCount,
        memories_purged: deletedMemoriesCount,
        files_purged: deletedFilesCount,
      },
    });
  } catch (error) {
    console.error('[Privacy Deletion API] Error purging account data:', error);
    return NextResponse.json({ error: 'Failed to complete data deletion' }, { status: 500 });
  }
}
