// ──────────────────────────────────────────────
// J.A.R.V.I.S Zero-Cost Query Response Cache
// Sub-2ms response caching for repeat & stateless inquiries (5-15 min TTL)
// Saves 100% of LLM tokens and API quotas on cache hits.
// ──────────────────────────────────────────────

import type { VoicePersona } from '@/types';

interface CachedResponse {
  message: string;
  voicePersona: VoicePersona;
  expiresAt: number;
  createdAt: number;
}

class QueryCache {
  private store = new Map<string, CachedResponse>();
  private maxEntries: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxEntries: number = 500) {
    this.maxEntries = maxEntries;
  }

  /**
   * Normalize user query string:
   * lowercases, strips trailing question marks/punctuation, collapses spaces
   */
  normalize(rawText: string): string {
    return rawText
      .trim()
      .toLowerCase()
      .replace(/[?!.,;:"'()[\]{}]/g, '') // strip common punctuation
      .replace(/\s+/g, ' '); // collapse whitespace
  }

  /**
   * Determine if a query is eligible for caching:
   * Stateless queries, greetings, identity, status checks, math, Stark protocols.
   * Avoid caching memory mutation directives ("remember", "forget").
   */
  isCacheable(rawText: string): boolean {
    const text = rawText.trim().toLowerCase();
    if (!text || text.length < 2) return false;

    // Disallow caching memory modifications
    if (text.startsWith('remember ') || text.startsWith('forget ') || text.includes('my name is')) {
      return false;
    }

    // Disallow caching questions about origins/creator to ensure natural, lively conversational variation
    if (
      text.includes('created you') ||
      text.includes('built you') ||
      text.includes('made you') ||
      text.includes('developed you') ||
      text.includes('your creator') ||
      text.includes('your developer') ||
      text.includes('who made') ||
      text.includes('who built') ||
      text.includes('who created') ||
      text.includes('who developed')
    ) {
      return false;
    }

    return true;
  }

  /**
   * Retrieve cached response if present and unexpired
   */
  get(rawText: string, persona: VoicePersona): string | null {
    if (!this.isCacheable(rawText)) {
      this.misses++;
      return null;
    }

    const key = `${persona}:${this.normalize(rawText)}`;
    const entry = this.store.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.message;
  }

  /**
   * Store response in cache with specified TTL (default: 10 minutes)
   */
  set(rawText: string, persona: VoicePersona, message: string, ttlMs: number = 600000): void {
    if (!this.isCacheable(rawText) || !message.trim()) return;

    if (this.store.size >= this.maxEntries) {
      // Evict oldest entry
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }

    const key = `${persona}:${this.normalize(rawText)}`;
    this.store.set(key, {
      message: message.trim(),
      voicePersona: persona,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    });
  }

  get size(): number {
    return this.store.size;
  }

  get stats() {
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses)).toFixed(2) : '0.00',
    };
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

export const queryCache = new QueryCache(500);
