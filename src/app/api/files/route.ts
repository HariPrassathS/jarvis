// ──────────────────────────────────────────────
// Uploaded Files API Route — Operator File History & Telemetry Vault
// Returns list of operator's uploaded files with signed URLs
// ──────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { insertUploadedFile, getUploadedFiles } from '@/lib/files/metadata';
import { uploadUserFile, getSignedFileUrl } from '@/lib/files/storage';

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
      console.error('[Files API] Token verification failed:', authErr);
      return NextResponse.json({ error: 'Unauthorized: Invalid authentication session' }, { status: 401 });
    }

    const profileUid = decoded.uid;
    const supabase = createServerSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('firebase_uid', profileUid)
      .maybeSingle();

    const profileId = profile?.id || profileUid;

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || undefined;
    const fileTypeParam = searchParams.get('type');
    const file_type =
      fileTypeParam === 'image' || fileTypeParam === 'document' ? fileTypeParam : undefined;

    const files = await getUploadedFiles(profileId, {
      query,
      file_type,
      limit: 100,
    });

    // Populate signed URLs for image rendering and file downloads (valid for 2 hours)
    const filesWithUrls = await Promise.all(
      files.map(async (f) => ({
        ...f,
        signed_url: (await getSignedFileUrl(f.storage_path, 7200)) || undefined,
      }))
    );

    return NextResponse.json({
      files: filesWithUrls,
      count: filesWithUrls.length,
    });
  } catch (error: any) {
    console.error('[Files API] Error fetching files:', error);
    return NextResponse.json({ error: 'Failed to retrieve file records' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
      console.error('[Files API] Token verification failed:', authErr);
      return NextResponse.json({ error: 'Unauthorized: Invalid authentication session' }, { status: 401 });
    }

    const profileUid = decoded.uid;
    const supabase = createServerSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('firebase_uid', profileUid)
      .maybeSingle();

    const profileId = profile?.id || profileUid;

    const body = await req.json();
    const {
      fileId,
      name,
      type,
      mimeType,
      size,
      dataUrl,
      extractedText,
      pageCount,
      aiDescription,
      conversationId,
    } = body;

    if (!name || (!dataUrl && !extractedText)) {
      return NextResponse.json({ error: 'Missing file payload or name' }, { status: 400 });
    }

    const id = fileId || crypto.randomUUID();
    const payload = dataUrl || extractedText || '';

    // 1. Upload to Supabase Storage under user folder
    const { storagePath } = await uploadUserFile(
      profileUid,
      id,
      name,
      payload,
      mimeType || (type === 'image' ? 'image/png' : 'application/octet-stream')
    );

    // 2. Insert metadata record into uploaded_files
    const description =
      aiDescription ||
      (extractedText
        ? `Extracted text from "${name}" (${pageCount ? pageCount + ' pages, ' : ''}${Math.round((size || 0) / 1024)}KB):\n${extractedText.slice(0, 3000)}`
        : `Uploaded ${type === 'image' ? 'visual telemetry' : 'file'} "${name}".`);

    const record = await insertUploadedFile({
      profile_id: profileId,
      conversation_id: conversationId || null,
      storage_path: storagePath,
      file_type: type === 'image' ? 'image' : 'document',
      original_filename: name,
      mime_type: mimeType || 'application/octet-stream',
      file_size_bytes: size || 0,
      ai_description: description,
    });

    const signedUrl = await getSignedFileUrl(storagePath, 7200);

    return NextResponse.json({
      success: true,
      file: {
        ...record,
        signed_url: signedUrl || undefined,
      },
    });
  } catch (error: any) {
    console.error('[Files API] Error uploading/saving file:', error);
    return NextResponse.json({ error: error?.message || 'Failed to process file' }, { status: 500 });
  }
}
