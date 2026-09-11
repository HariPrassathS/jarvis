// ──────────────────────────────────────────────
// Supabase Storage Manager — Scoped to 'user-files' bucket
// Scoped strictly to authenticated operator's {firebase_uid}/ prefix
// ──────────────────────────────────────────────

import { createServerSupabaseClient } from '@/lib/supabase/server';

export const BUCKET_NAME = 'user-files';
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB Bucket Limit

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

/**
 * Upload a raw Buffer or base64 Data URL to Supabase Storage under {firebaseUid}/{fileId}-{filename}
 */
export async function uploadUserFile(
  firebaseUid: string,
  fileId: string,
  filename: string,
  data: Buffer | string,
  mimeType: string
): Promise<{ storagePath: string; fullPath: string }> {
  if (!firebaseUid) {
    throw new Error('Upload rejected: missing authenticated operator UID');
  }

  const cleanName = sanitizeFilename(filename || 'telemetry_file');
  const storagePath = `${firebaseUid}/${fileId}-${cleanName}`;

  let buffer: Buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (typeof data === 'string' && data.startsWith('data:')) {
    const base64Index = data.indexOf(';base64,');
    if (base64Index !== -1) {
      buffer = Buffer.from(data.slice(base64Index + 8), 'base64');
    } else {
      buffer = Buffer.from(data, 'utf-8');
    }
  } else if (typeof data === 'string') {
    const isBase64 = /^[A-Za-z0-9+/=]+$/.test(data.trim()) && data.length % 4 === 0 && data.length > 20;
    if (isBase64) {
      try {
        buffer = Buffer.from(data, 'base64');
      } catch {
        buffer = Buffer.from(data, 'utf-8');
      }
    } else {
      buffer = Buffer.from(data, 'utf-8');
    }
  } else {
    throw new Error('Unsupported upload data payload');
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Visual/document telemetry exceeds maximum storage bandwidth limit of 50MB (${(
        buffer.length /
        (1024 * 1024)
      ).toFixed(1)}MB), sir. Please crop or compress the file.`
    );
  }

  const supabase = createServerSupabaseClient();
  const { data: uploadData, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: true,
    });

  if (error) {
    console.error('[Storage Manager] Upload error to user-files bucket:', error);
    throw new Error(`Failed to store visual telemetry: ${error.message}`);
  }

  return {
    storagePath,
    fullPath: uploadData?.fullPath || `${BUCKET_NAME}/${storagePath}`,
  };
}

/**
 * Generate a secure time-limited signed URL for viewing or downloading a stored file
 */
export async function getSignedFileUrl(
  storagePath: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  if (!storagePath) return null;

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.warn('[Storage Manager] Signed URL generation warning:', error?.message);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.warn('[Storage Manager] Error generating signed URL:', err);
    return null;
  }
}

/**
 * Delete specific files or all files belonging to an operator from Supabase Storage
 */
export async function deleteUserFiles(
  firebaseUid: string,
  storagePaths?: string[]
): Promise<{ deletedCount: number; paths: string[] }> {
  if (!firebaseUid) return { deletedCount: 0, paths: [] };

  const supabase = createServerSupabaseClient();

  try {
    let targetPaths = storagePaths || [];

    // If no specific paths provided, list all files in the operator's folder
    if (targetPaths.length === 0) {
      const { data: fileList, error: listErr } = await supabase.storage
        .from(BUCKET_NAME)
        .list(firebaseUid, { limit: 1000 });

      if (listErr) {
        console.warn(`[Storage Manager] Could not list files for ${firebaseUid}:`, listErr);
        return { deletedCount: 0, paths: [] };
      }

      targetPaths = (fileList || []).map((f) => `${firebaseUid}/${f.name}`);
    }

    if (targetPaths.length === 0) {
      return { deletedCount: 0, paths: [] };
    }

    const { data: delData, error: delErr } = await supabase.storage
      .from(BUCKET_NAME)
      .remove(targetPaths);

    if (delErr) {
      console.error('[Storage Manager] Error purging user files from storage:', delErr);
      throw delErr;
    }

    const count = delData?.length || targetPaths.length;
    console.log(`[Storage Manager] Purged ${count} files from user-files for operator ${firebaseUid}`);
    return { deletedCount: count, paths: targetPaths };
  } catch (err) {
    console.error('[Storage Manager] Fatal deletion error:', err);
    return { deletedCount: 0, paths: [] };
  }
}
