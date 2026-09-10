// ──────────────────────────────────────────────
// Tool: Memory — Read/Write to Supabase with Proactive & Recurring Intelligence
// ──────────────────────────────────────────────

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { jarvisCache } from '@/lib/llm/cache';
import type { MemoryEntry } from '@/types';

export interface RememberOptions {
  follow_up_relevant?: boolean;
  inferred_date?: string | null;
  topic?: string;
  followed_up?: boolean;
}

interface StoredMeta {
  follow_up_relevant?: boolean;
  inferred_date?: string | null;
  topic?: string;
  followed_up?: boolean;
  mention_count?: number;
}

const META_REGEX = /\s*<!--\s*META:([\s\S]*?)\s*-->\s*$/;

/**
 * Serialize fact value with structured proactive metadata
 */
function serializeValue(cleanValue: string, meta: StoredMeta): string {
  if (!meta || Object.keys(meta).length === 0) return cleanValue;
  return `${cleanValue.trim()} <!-- META:${JSON.stringify(meta)} -->`;
}

/**
 * Parse raw database memory value into clean text and structured metadata
 */
function deserializeMemory(row: any): MemoryEntry {
  const rawValue = String(row.value || '');
  const match = rawValue.match(META_REGEX);

  let cleanValue = rawValue;
  let meta: StoredMeta = {};

  if (match) {
    cleanValue = rawValue.replace(META_REGEX, '').trim();
    try {
      meta = JSON.parse(match[1]);
    } catch {}
  }

  return {
    id: row.id,
    profile_id: row.profile_id,
    key: row.key,
    value: cleanValue,
    updated_at: row.updated_at || new Date().toISOString(),
    follow_up_relevant: meta.follow_up_relevant || Boolean(row.follow_up_relevant),
    inferred_date: meta.inferred_date || row.inferred_date || null,
    followed_up: meta.followed_up || Boolean(row.followed_up),
    mention_count: meta.mention_count || row.mention_count || 1,
    topic: meta.topic || row.topic || row.key,
  };
}

/**
 * Store a memory entry for a user with proactive & recurring topic tracking.
 * Upserts by (profile_id, key) and increments mention_count for recurring topics.
 */
export async function rememberFact(
  profileId: string,
  key: string,
  value: string,
  options?: RememberOptions
): Promise<string> {
  // Invalidate cache immediately
  jarvisCache.delete(`memories:${profileId}`);

  try {
    const supabase = createServerSupabaseClient();

    // Check if this key or similar topic already exists
    const { data: existingRows } = await supabase
      .from('memory')
      .select('*')
      .eq('profile_id', profileId);

    const existingMemories = (existingRows || []).map(deserializeMemory);
    const existing = existingMemories.find(
      (m) => m.key.toLowerCase() === key.toLowerCase() || (options?.topic && m.topic?.toLowerCase() === options.topic.toLowerCase())
    );

    const prevMentionCount = existing?.mention_count || 0;
    const newMentionCount = prevMentionCount + 1;

    const meta: StoredMeta = {
      follow_up_relevant: options?.follow_up_relevant ?? existing?.follow_up_relevant ?? false,
      inferred_date: options?.inferred_date ?? existing?.inferred_date ?? null,
      topic: options?.topic || existing?.topic || key,
      followed_up: options?.followed_up ?? existing?.followed_up ?? false,
      mention_count: newMentionCount,
    };

    const serialized = serializeValue(value, meta);

    if (existing?.id) {
      // Update existing
      await supabase
        .from('memory')
        .update({ value: serialized, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      // Insert new
      await supabase
        .from('memory')
        .insert({ profile_id: profileId, key, value: serialized });
    }

    return `Got it — I'll remember that ${key}: ${value}`;
  } catch (error) {
    console.error('[Memory] Write error:', error);
    return "I had trouble saving that to memory, but I've noted it for this session.";
  }
}

/**
 * Retrieve all memory entries for a user with in-memory caching.
 */
export async function recallMemories(profileId: string): Promise<MemoryEntry[]> {
  const cacheKey = `memories:${profileId}`;
  const cached = jarvisCache.get<MemoryEntry[]>(cacheKey);
  if (cached) return cached;

  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('memory')
      .select('*')
      .eq('profile_id', profileId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    const entries = (data || []).map(deserializeMemory);
    jarvisCache.set(cacheKey, entries, 120000); // 2 min TTL
    return entries;
  } catch (error) {
    console.error('[Memory] Read error:', error);
    return [];
  }
}

/**
 * Mark a time-sensitive fact as followed-up so it only surfaces once across sessions.
 */
export async function markMemoryFollowedUp(profileId: string, memoryId: string): Promise<void> {
  jarvisCache.delete(`memories:${profileId}`);
  try {
    const supabase = createServerSupabaseClient();
    const { data: row } = await supabase
      .from('memory')
      .select('*')
      .eq('id', memoryId)
      .single();

    if (row) {
      const memory = deserializeMemory(row);
      const meta: StoredMeta = {
        follow_up_relevant: memory.follow_up_relevant,
        inferred_date: memory.inferred_date,
        topic: memory.topic,
        followed_up: true,
        mention_count: memory.mention_count,
      };
      const updatedValue = serializeValue(memory.value, meta);
      await supabase
        .from('memory')
        .update({ value: updatedValue, updated_at: new Date().toISOString() })
        .eq('id', memoryId);
    }
  } catch (err) {
    console.warn('[Memory] Failed to mark memory followed up:', err);
  }
}
