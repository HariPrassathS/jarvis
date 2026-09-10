// ──────────────────────────────────────────────
// J.A.R.V.I.S In-Memory Cache — Sub-5ms Response Caching & Rate Protection
// ──────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class JarvisCache {
  private store: Map<string, CacheEntry<unknown>> = new Map();
  private maxEntries: number;

  constructor(maxEntries: number = 200) {
    this.maxEntries = maxEntries;
  }

  set<T>(key: string, value: T, ttlMs: number = 60000): void {
    if (this.store.size >= this.maxEntries) {
      // Evict oldest entry (LRU simple FIFO key iterator)
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export const jarvisCache = new JarvisCache(250);
