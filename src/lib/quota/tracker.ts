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
   * Get quota status for a specific provider
   */
  async getStatus(provider: string): Promise<ProviderStatus> {
    const config = PROVIDER_QUOTAS[provider] || { dailyRequestLimit: 5000, warningThresholdPercent: 80 };
    const local = this.getLocalRecord(provider);
    const today = this.getTodayUTC();

    // Query Supabase for latest cross-instance count if available
    let totalRequests = local.requests;
    let totalTokens = local.tokens;
    let lastUsed: string | undefined = undefined;

    try {
      const supabase = createServerSupabaseClient();
      const { data } = await supabase
        .from('provider_usage')
        .select('request_count, token_count, last_used_at')
        .eq('provider', provider)
        .eq('date_utc', today)
        .single();

      if (data) {
        totalRequests = Math.max(local.requests, data.request_count);
        totalTokens = Math.max(local.tokens, data.token_count);
        lastUsed = data.last_used_at;
        // Sync local
        local.requests = totalRequests;
        local.tokens = totalTokens;
      }
    } catch {
      // Use local memory counts
    }

    const percentUsed = Math.min(100, Math.round((totalRequests / config.dailyRequestLimit) * 100));
    const isDeprioritized = percentUsed >= config.warningThresholdPercent;
    const isExhausted = totalRequests >= config.dailyRequestLimit;

    return {
      provider: provider as LLMProvider,
      requestsToday: totalRequests,
      tokensToday: totalTokens,
      dailyLimit: config.dailyRequestLimit,
      percentUsed,
      isDeprioritized,
      isExhausted,
      lastUsedAt: lastUsed,
    };
  }

  /**
   * Get all provider statuses
   */
  async getAllStatuses(): Promise<Record<string, ProviderStatus>> {
    const providers = Object.keys(PROVIDER_QUOTAS);
    const results = await Promise.all(providers.map((p) => this.getStatus(p)));
    const statusMap: Record<string, ProviderStatus> = {};
    for (const status of results) {
      statusMap[status.provider] = status;
    }
    return statusMap;
  }

  /**
   * Dynamically re-order providers:
   * 1. Preferred provider (if not exhausted and < 80% quota)
   * 2. Healthy providers (< 80% quota)
   * 3. Warned providers (80% - 99% quota, moved to tail)
   * 4. Exhausted providers (100% quota, skipped or placed absolute last)
   */
  async prioritizeProviders<T extends { name: string }>(
    providers: T[],
    preferred?: string
  ): Promise<T[]> {
    const statuses = await this.getAllStatuses();

    const healthy: T[] = [];
    const warning: T[] = [];
    const exhausted: T[] = [];

    for (const p of providers) {
      const status = statuses[p.name];
      if (!status) {
        healthy.push(p);
      } else if (status.isExhausted) {
        exhausted.push(p);
      } else if (status.isDeprioritized) {
        warning.push(p);
      } else {
        healthy.push(p);
      }
    }

    // Sort healthy with preferred first
    if (preferred) {
      const prefIdx = healthy.findIndex((p) => p.name === preferred);
      if (prefIdx > 0) {
        const [pref] = healthy.splice(prefIdx, 1);
        healthy.unshift(pref);
      }
    }

    // Concatenate healthy -> warning -> exhausted
    return [...healthy, ...warning, ...exhausted];
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
