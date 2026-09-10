// ──────────────────────────────────────────────
// J.A.R.V.I.S Capacity Guard — Per-Operator Token Bucket Rate Limiter
// Enforces fairness: prevents one chatty user from exhausting shared API quota
// ──────────────────────────────────────────────

import type { VoicePersona } from '@/types';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitResult {
  allowed: boolean;
  waitSeconds: number;
  message?: string;
}

class TokenBucketLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number; // Time to restore 1 token (e.g., 3500ms)
  private readonly maxBuckets: number;

  constructor(options: { maxTokens?: number; refillIntervalMs?: number; maxBuckets?: number } = {}) {
    this.maxTokens = options.maxTokens ?? 2; // Allow burst of up to 2
    this.refillIntervalMs = options.refillIntervalMs ?? 3500; // 3.5s per request
    this.maxBuckets = options.maxBuckets ?? 1000;
  }

  /**
   * Check and consume a token for the given user ID.
   */
  check(userId: string, persona: VoicePersona = 'jarvis'): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(userId);

    if (!bucket) {
      if (this.buckets.size >= this.maxBuckets) {
        // Evict oldest bucket
        const firstKey = this.buckets.keys().next().value;
        if (firstKey) this.buckets.delete(firstKey);
      }
      bucket = {
        tokens: this.maxTokens,
        lastRefill: now,
      };
      this.buckets.set(userId, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed / this.refillIntervalMs;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if at least 1 token is available
    if (bucket.tokens >= 1.0) {
      bucket.tokens -= 1.0;
      return {
        allowed: true,
        waitSeconds: 0,
      };
    }

    // Calculate time remaining until 1 token is replenished
    const needed = 1.0 - bucket.tokens;
    const waitMs = Math.max(500, Math.ceil(needed * this.refillIntervalMs));
    const waitSeconds = Math.max(1, Math.ceil(waitMs / 1000));

    const message = this.getInCharacterThrottleMessage(persona, waitSeconds);

    return {
      allowed: false,
      waitSeconds,
      message,
    };
  }

  /**
   * Reset rate limit state for a specific user (for tests or admin bypass).
   */
  reset(userId: string): void {
    this.buckets.delete(userId);
  }

  /**
   * Generate an in-character HUD throttle message based on active persona.
   */
  private getInCharacterThrottleMessage(persona: VoicePersona, waitSeconds: number): string {
    if (persona === 'friday') {
      return waitSeconds > 1
        ? `Hold on, boss — cooling thrusters for ${waitSeconds} seconds. Give me a moment to cycle power.`
        : 'Hold on, boss — cooling thrusters for a moment.';
    }

    return waitSeconds > 1
      ? `Systems recalibrating, sir — please allow ${waitSeconds} seconds before transmitting your next directive.`
      : 'Systems recalibrating, sir — one moment.';
  }
}

// Global Singleton (Shared across requests within the server runtime)
export const operatorRateLimiter = new TokenBucketLimiter({
  maxTokens: 2,
  refillIntervalMs: 3500,
});
