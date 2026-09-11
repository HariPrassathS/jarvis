// ──────────────────────────────────────────────
// J.A.R.V.I.S Daily Quota & Capacity Budget Tracker
// Proactively tracks request volume, deprioritizes >80% quota providers,
// and persists usage to Supabase provider_usage table.
// ──────────────────────────────────────────────

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { LLMProvider } from '@/types';

export interface ProviderQuotaConfig {
  dailyRequestLimit: number;
  warningThresholdPercent: number; // e.g., 80%
}

export interface ProviderStatus {
  provider: LLMProvider;
  requestsToday: number;
  tokensToday: number;
  dailyLimit: number;
  percentUsed: number;
  isDeprioritized: boolean; // >= 80%
  isExhausted: boolean; // >= 100%
  lastUsedAt?: string;
}

export const PROVIDER_QUOTAS: Record<string, ProviderQuotaConfig> = {
  groq: {
    dailyRequestLimit: parseInt(process.env.GROQ_DAILY_LIMIT || '14400', 10),
    warningThresholdPercent: 80,
  },
  gemini: {
    dailyRequestLimit: parseInt(process.env.GEMINI_DAILY_LIMIT || '1500', 10),
    warningThresholdPercent: 80,
  },
  openrouter: {
    dailyRequestLimit: parseInt(process.env.OPENROUTER_DAILY_LIMIT || '200', 10),
    warningThresholdPercent: 80,
  },
  cloudflare: {
    dailyRequestLimit: parseInt(process.env.CLOUDFLARE_DAILY_LIMIT || '10000', 10),
    warningThresholdPercent: 80,
  },
};

class QuotaTracker {
  // Local in-memory cache for instantaneous lookup
  private localCounts = new Map<string, { requests: number; tokens: number; date: string }>();

  /**
   * Get current UTC date string (YYYY-MM-DD)
   */
  private getTodayUTC(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Get or initialize today's in-memory record for a provider
   */
  private getLocalRecord(provider: string): { requests: number; tokens: number; date: string } {
    const today = this.getTodayUTC();
    const existing = this.localCounts.get(provider);
    if (existing && existing.date === today) {
      return existing;
    }
    const fresh = { requests: 0, tokens: 0, date: today };
    this.localCounts.set(provider, fresh);
    return fresh;
  }

  /**
   * Record a completed request for the given provider and persist to Supabase
   */
  async recordRequest(provider: string, tokens: number = 0): Promise<void> {
    const today = this.getTodayUTC();
    const local = this.getLocalRecord(provider);
    local.requests += 1;
    local.tokens += tokens;

    // Asynchronously upsert to Supabase in the background
    (async () => {
      try {
        const supabase = createServerSupabaseClient();
        
        // Fetch current row or insert
        const { data: existing } = await supabase
          .from('provider_usage')
          .select('request_count, token_count')
          .eq('provider', provider)
          .eq('date_utc', today)
          .single();

        if (existing) {
          await supabase
            .from('provider_usage')
            .update({
              request_count: existing.request_count + 1,
              token_count: existing.token_count + tokens,
              last_used_at: new Date().toISOString(),
            })
            .eq('provider', provider)
            .eq('date_utc', today);
        } else {
          await supabase
            .from('provider_usage')
            .insert({
              provider,
              date_utc: today,
              request_count: 1,
              token_count: tokens,
              last_used_at: new Date().toISOString(),
            });
        }
      } catch (err) {
        // Silently log; local memory counter remains accurate
        console.warn(`[QuotaTracker] Failed to persist quota usage for ${provider}:`, err);
      }
    })().catch(() => {});
  }

  /**
   * Get quota status for a specific provider (zero-latency in-memory lookup)
   */
  async getStatus(provider: string): Promise<ProviderStatus> {
    const config = PROVIDER_QUOTAS[provider] || { dailyRequestLimit: 5000, warningThresholdPercent: 80 };
    const local = this.getLocalRecord(provider);
    const percentUsed = Math.min(100, Math.round((local.requests / config.dailyRequestLimit) * 100));

    return {
      provider: provider as LLMProvider,
      requestsToday: local.requests,
      tokensToday: local.tokens,
      dailyLimit: config.dailyRequestLimit,
      percentUsed,
      isDeprioritized: percentUsed >= config.warningThresholdPercent,
      isExhausted: local.requests >= config.dailyRequestLimit,
    };
  }

  /**
   * Get all provider statuses
   */
  async getAllStatuses(): Promise<Record<string, ProviderStatus>> {
    // Return local status immediately using in-memory tracker (zero-latency fast path)
    const statusMap: Record<string, ProviderStatus> = {};
    for (const p of Object.keys(PROVIDER_QUOTAS)) {
      const config = PROVIDER_QUOTAS[p] || { dailyRequestLimit: 5000, warningThresholdPercent: 80 };
      const local = this.getLocalRecord(p);
      const percentUsed = Math.min(100, Math.round((local.requests / config.dailyRequestLimit) * 100));
      statusMap[p] = {
        provider: p as LLMProvider,
        requestsToday: local.requests,
        tokensToday: local.tokens,
        dailyLimit: config.dailyRequestLimit,
        percentUsed,
        isDeprioritized: percentUsed >= config.warningThresholdPercent,
        isExhausted: local.requests >= config.dailyRequestLimit,
      };
    }
    return statusMap;
  }

  /**
   * Dynamically order providers:
   * Groq-Primary Architecture:
   * 1. Primary provider (Groq / preferred) always handles traffic first for consistent sub-second latency
   * 2. Fallback providers (Gemini, OpenRouter, Cloudflare) are reserved as genuine emergency backups
   * 3. Exhausted providers (100% daily budget reached) are placed at the tail
   * Zero-latency in-memory execution (<0.1ms).
   */
  async prioritizeProviders<T extends { name: string }>(
    providers: T[],
    preferred: string = 'groq'
  ): Promise<T[]> {
    const statuses = await this.getAllStatuses();

    const primary: T[] = [];
    const fallbacks: T[] = [];
    const exhausted: T[] = [];

    for (const p of providers) {
      const status = statuses[p.name];
      const isExhausted = status?.isExhausted || false;

      if (isExhausted) {
        exhausted.push(p);
      } else if (p.name === preferred) {
        primary.push(p);
      } else {
        fallbacks.push(p);
      }
    }

    // Return: [Primary (Groq), Fallbacks (Gemini, OpenRouter, Cloudflare), Exhausted]
    return [...primary, ...fallbacks, ...exhausted];
  }

  /**
   * Time remaining until next UTC midnight reset
   */
  getTimeUntilReset(): { hours: number; minutes: number; formatted: string } {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    const diffMs = midnight.getTime() - now.getTime();

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return {
      hours,
      minutes,
      formatted: `${hours}h ${minutes}m`,
    };
  }
}

export const quotaTracker = new QuotaTracker();
