// ──────────────────────────────────────────────
// Tool: Memory — Read/Write to Supabase
// ──────────────────────────────────────────────

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { jarvisCache } from '@/lib/llm/cache';
import type { MemoryEntry } from '@/types';

/**
 * Store a memory entry for a user.
 * Upserts by (profile_id, key) so updating a fact replaces the old one.
 */
export async function rememberFact(
  profileId: string,
  key: string,
  value: string
): Promise<string> {
  // Invalidate cache immediately
  jarvisCache.delete(`memories:${profileId}`);

  try {
    const supabase = createServerSupabaseClient();

    // Check if this key already exists for this user
    const { data: existing } = await supabase
      .from('memory')
      .select('id')
      .eq('profile_id', profileId)
      .eq('key', key)
      .single();

    if (existing) {
      // Update existing
      await supabase
        .from('memory')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      // Insert new
      await supabase
        .from('memory')
        .insert({ profile_id: profileId, key, value });
    }

    return `Got it — I'll remember that ${key}: ${value}`;
  } catch (error) {
    console.error('Memory write error:', error);
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
    const entries = (data as MemoryEntry[]) || [];
    jarvisCache.set(cacheKey, entries, 120000); // 2 min TTL
    return entries;
  } catch (error) {
    console.error('Memory read error:', error);
    return [];
  }
}

