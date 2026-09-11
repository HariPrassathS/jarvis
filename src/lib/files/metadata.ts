// ──────────────────────────────────────────────
// Uploaded Files Metadata Manager — PostgreSQL / Supabase
// Tracks file metadata, links to conversations, and caches AI descriptions
// ──────────────────────────────────────────────

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { jarvisCache } from '@/lib/llm/cache';
import type { UploadedFileRecord } from '@/types';

export interface FileQueryFilters {
  query?: string;
  file_type?: 'image' | 'document' | 'all';
  time_range?: 'today' | 'yesterday' | 'this_week' | 'all';
  limit?: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'that', 'this', 'those', 'these', 'i', 'me', 'my', 'we', 'our',
  'you', 'your', 'he', 'she', 'it', 'they', 'have', 'had', 'has', 'having', 'uploaded',
  'upload', 'uploads', 'file', 'files', 'document', 'documents', 'image', 'images',
  'photo', 'photos', 'picture', 'pictures', 'what', 'was', 'were', 'is', 'are', 'in',
  'on', 'at', 'to', 'for', 'from', 'with', 'about', 'show', 'tell', 'find', 'get',
  'recall', 'remember', 'check', 'look', 'up', 'please', 'can', 'could', 'would'
]);

// In-memory resilient cache fallback store keyed by profile_id
const fallbackStore = new Map<string, UploadedFileRecord[]>();

/**
 * Insert or update an uploaded file metadata record
 */
export async function insertUploadedFile(
  record: Omit<UploadedFileRecord, 'id' | 'uploaded_at'> & { id?: string; uploaded_at?: string }
): Promise<UploadedFileRecord> {
  const profileId = record.profile_id;
  const rawId = record.id;
  const validId = rawId && UUID_REGEX.test(rawId) ? rawId : crypto.randomUUID();
  const validConvId = record.conversation_id && UUID_REGEX.test(record.conversation_id) ? record.conversation_id : null;

  const newRecord: UploadedFileRecord = {
    id: validId,
    profile_id: profileId,
    conversation_id: validConvId,
    storage_path: record.storage_path,
    file_type: record.file_type,
    original_filename: record.original_filename,
    mime_type: record.mime_type,
    file_size_bytes: record.file_size_bytes,
    ai_description: record.ai_description,
    uploaded_at: record.uploaded_at || new Date().toISOString(),
  };

  // Always update in-memory cache immediately
  jarvisCache.delete(`files:${profileId}`);
  const currentFallback = fallbackStore.get(profileId) || [];
  fallbackStore.set(profileId, [newRecord, ...currentFallback.filter((f) => f.id !== newRecord.id)]);

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('uploaded_files')
      .upsert({
        id: newRecord.id,
        profile_id: newRecord.profile_id,
        conversation_id: newRecord.conversation_id,
        storage_path: newRecord.storage_path,
        file_type: newRecord.file_type,
        original_filename: newRecord.original_filename,
        mime_type: newRecord.mime_type,
        file_size_bytes: newRecord.file_size_bytes,
        ai_description: newRecord.ai_description,
        uploaded_at: newRecord.uploaded_at,
      })
      .select('*')
      .maybeSingle();

    if (error) {
      console.warn('[File Metadata] DB insert warning (fallback active):', error.message);
      return newRecord;
    }

    return (data as UploadedFileRecord) || newRecord;
  } catch (err: any) {
    console.warn('[File Metadata] Database write error, using memory fallback:', err?.message);
    return newRecord;
  }
}

/**
 * Query uploaded files for an operator with rich filtering (keyword, file type, time range)
 */
export async function getUploadedFiles(
  profileId: string,
  filters?: FileQueryFilters
): Promise<UploadedFileRecord[]> {
  if (!profileId) return [];

  const cacheKey = `files:${profileId}`;
  let allFiles = jarvisCache.get<UploadedFileRecord[]>(cacheKey);

  if (!allFiles) {
    try {
      const supabase = createServerSupabaseClient();
      const { data, error } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('profile_id', profileId)
        .order('uploaded_at', { ascending: false });

      if (error || !data) {
        console.warn('[File Metadata] DB query warning (using fallback):', error?.message);
        allFiles = fallbackStore.get(profileId) || [];
      } else {
        allFiles = data as UploadedFileRecord[];
      }
    } catch (err) {
      console.warn('[File Metadata] Fetch error, fallback active:', err);
      allFiles = fallbackStore.get(profileId) || [];
    }

    jarvisCache.set(cacheKey, allFiles, 120000); // 2 min TTL
  }

  let results = [...allFiles];

  // 1. Filter by file_type
  if (filters?.file_type && filters.file_type !== 'all') {
    results = results.filter((f) => f.file_type === filters.file_type);
  }

  // 2. Filter by time_range
  if (filters?.time_range && filters.time_range !== 'all') {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    results = results.filter((f) => {
      const uploadTime = new Date(f.uploaded_at).getTime();
      const diffMs = now - uploadTime;

      switch (filters.time_range) {
        case 'today':
          return diffMs <= oneDayMs;
        case 'yesterday':
          return diffMs > oneDayMs && diffMs <= 2 * oneDayMs;
        case 'this_week':
          return diffMs <= 7 * oneDayMs;
        default:
          return true;
      }
    });
  }

  // 3. Filter by keyword query (matches in filename, ai_description, or file_type)
  if (filters?.query && filters.query.trim()) {
    const rawQuery = filters.query.toLowerCase().trim();
    const allTokens = rawQuery.split(/[\s,._\-?!]+/).filter((t) => t.length > 0);
    const meaningfulTokens = allTokens.filter((t) => !STOP_WORDS.has(t));

    // If query is specifically asking for pdf/image/presentation/etc.
    const isPdfQuery = allTokens.includes('pdf');
    const isImageQuery = allTokens.some((t) => ['image', 'photo', 'picture', 'screenshot', 'scan'].includes(t));

    if (meaningfulTokens.length > 0 || isPdfQuery || isImageQuery) {
      results = results.filter((f) => {
        const name = (f.original_filename || '').toLowerCase();
        const desc = (f.ai_description || '').toLowerCase();
        const mime = (f.mime_type || '').toLowerCase();
        const type = (f.file_type || '').toLowerCase();
        const target = `${name} ${desc} ${mime} ${type}`;

        if (isPdfQuery && (name.endsWith('.pdf') || mime.includes('pdf') || type === 'document')) {
          return true;
        }

        if (isImageQuery && (type === 'image' || mime.startsWith('image/'))) {
          return true;
        }

        // Match against meaningful tokens
        return (
          target.includes(rawQuery) ||
          meaningfulTokens.some((token) => target.includes(token))
        );
      });
    }
    // If all tokens were stop words (e.g. "what was the file I uploaded"), return all recent files
  }

  if (filters?.limit && filters.limit > 0) {
    results = results.slice(0, filters.limit);
  }

  return results;
}

/**
 * Delete all uploaded file metadata records belonging to a profile
 */
export async function deleteUploadedFilesByProfile(
  profileId: string
): Promise<{ deletedCount: number }> {
  if (!profileId) return { deletedCount: 0 };

  jarvisCache.delete(`files:${profileId}`);
  const fallbackRecords = fallbackStore.get(profileId) || [];
  fallbackStore.delete(profileId);

  try {
    const supabase = createServerSupabaseClient();
    const { count, error } = await supabase
      .from('uploaded_files')
      .delete({ count: 'exact' })
      .eq('profile_id', profileId);

    if (error) {
      console.warn('[File Metadata] Deletion warning:', error.message);
      return { deletedCount: fallbackRecords.length };
    }

    return { deletedCount: count || fallbackRecords.length };
  } catch (err) {
    console.warn('[File Metadata] Delete error:', err);
    return { deletedCount: fallbackRecords.length };
  }
}
