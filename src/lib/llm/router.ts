// ──────────────────────────────────────────────
// LLM Router — Multi-Provider Resilient Fallback Chain & Circuit Breaker
// Priority: Gemini (Fastest & Reliable) → Groq → OpenRouter
// ──────────────────────────────────────────────

import { callGemini } from './providers/gemini';
import { streamGemini } from './providers/gemini';
import { callGroq } from './providers/groq';
import { streamGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { streamOpenRouter } from './providers/openrouter';
import { callCloudflare } from './providers/cloudflare';
import { quotaTracker } from '@/lib/quota/tracker';
import type { ChatMessage, LLMResponse, LLMProvider, ToolDefinition, StreamChunk, StreamingProviderFn } from '@/types';

interface RouterOptions {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  preferredProvider?: LLMProvider;
  timeoutMs?: number;
}

type ProviderFn = (
  messages: ChatMessage[],
  tools?: ToolDefinition[]
) => Promise<LLMResponse>;

interface ProviderEntry {
  name: LLMProvider;
  call: ProviderFn;
}

interface StreamingProviderEntry {
  name: LLMProvider;
  stream: StreamingProviderFn;
  /** Fallback blocking call for providers that don't support streaming (e.g. Cloudflare) */
  blockingCall?: ProviderFn;
}

const PROVIDERS: ProviderEntry[] = [
  { name: 'groq', call: callGroq },
  { name: 'gemini', call: callGemini },
  { name: 'openrouter', call: callOpenRouter },
  { name: 'cloudflare', call: callCloudflare },
];

const STREAMING_PROVIDERS: StreamingProviderEntry[] = [
  { name: 'groq', stream: streamGroq },
  { name: 'gemini', stream: streamGemini },
  { name: 'openrouter', stream: streamOpenRouter },
  { name: 'cloudflare', stream: undefined as unknown as StreamingProviderFn, blockingCall: callCloudflare },
];

const DEFAULT_TIMEOUT = 15000; // 15 seconds per provider
const CIRCUIT_BREAKER_FAIL_THRESHOLD = 4;
const CIRCUIT_BREAKER_RESET_MS = 25000; // 25s cool-off

// Circuit Breaker State per Provider
const circuitState: Record<
  LLMProvider,
  { consecutiveFailures: number; openUntil: number }
> = {
  gemini: { consecutiveFailures: 0, openUntil: 0 },
  groq: { consecutiveFailures: 0, openUntil: 0 },
  openrouter: { consecutiveFailures: 0, openUntil: 0 },
  cloudflare: { consecutiveFailures: 0, openUntil: 0 },
};

export function getCircuitBreakerStatus(): Record<LLMProvider, { status: 'CLOSED' | 'OPEN'; failures: number }> {
  const now = Date.now();
  const res: any = {};
  for (const p of ['gemini', 'groq', 'openrouter', 'cloudflare'] as LLMProvider[]) {
    const s = circuitState[p];
    res[p] = {
      status: s.openUntil > now ? 'OPEN' : 'CLOSED',
      failures: s.consecutiveFailures,
    };
  }
  return res;
}

export function resetCircuitBreaker(): void {
  for (const p of ['gemini', 'groq', 'openrouter', 'cloudflare'] as LLMProvider[]) {
    circuitState[p] = { consecutiveFailures: 0, openUntil: 0 };
  }
}

/**
 * Call an LLM provider with a strict timeout.
 */
async function callWithTimeout(
  fn: ProviderFn,
  messages: ChatMessage[],
  tools: ToolDefinition[] | undefined,
  timeoutMs: number
): Promise<LLMResponse> {
  return Promise.race([
    fn(messages, tools),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Provider timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Route a chat request through the provider chain with automatic circuit breaker fallback.
 */
export async function routeChat(options: RouterOptions): Promise<LLMResponse> {
  const { messages, tools, preferredProvider, timeoutMs = DEFAULT_TIMEOUT } = options;

  let orderedProviders = [...PROVIDERS];
  // Proactively reorder providers based on 24h quota usage (<80% healthy first, >80% deprioritized last)
  try {
    orderedProviders = await quotaTracker.prioritizeProviders(orderedProviders, preferredProvider);
  } catch (err) {
    console.warn('[LLM Router] Quota prioritization fallback:', err);
  }

  const errors: Array<{ provider: string; error: string }> = [];
  const now = Date.now();

  for (const provider of orderedProviders) {
    const state = circuitState[provider.name];

    // Check if circuit breaker is open
    if (state.openUntil > now) {
      console.warn(
        `[LLM Router] Skipping ${provider.name} — Circuit Breaker is OPEN (cool-off remaining: ${Math.round(
          (state.openUntil - now) / 1000
        )}s)`
      );
      errors.push({
        provider: provider.name,
        error: `Circuit breaker OPEN (temporary cool-off active)`,
      });
      continue;
    }

    // Check if provider has 100% exhausted its daily budget
    try {
      const qStatus = await quotaTracker.getStatus(provider.name);
      if (qStatus.isExhausted) {
        console.warn(`[LLM Router] Skipping ${provider.name} — 100% daily budget reached (${qStatus.requestsToday}/${qStatus.dailyLimit})`);
        errors.push({
          provider: provider.name,
          error: `Daily budget exhausted (${qStatus.requestsToday}/${qStatus.dailyLimit})`,
        });
        continue;
      }
    } catch {
      // Continue if quota check fails
    }

    try {
      const startTime = Date.now();
      console.log(`[LLM Router] Calling provider: ${provider.name}`);

      const response = await callWithTimeout(provider.call, messages, tools, timeoutMs);
      const latencyMs = Date.now() - startTime;

      // Reset circuit breaker on success
      state.consecutiveFailures = 0;
      state.openUntil = 0;

      // Record quota usage asynchronously
      quotaTracker.recordRequest(provider.name);

      console.log(`[LLM Router] Success with provider: ${provider.name} in ${latencyMs}ms`);
      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[LLM Router] Provider ${provider.name} failed: ${errorMsg}`);

      state.consecutiveFailures++;
      if (state.consecutiveFailures >= CIRCUIT_BREAKER_FAIL_THRESHOLD) {
        state.openUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
        console.error(
          `[LLM Router] ⚡ Circuit Breaker TRIPPED for ${provider.name} after ${state.consecutiveFailures} consecutive failures. Tripped for 25s.`
        );
      }

      errors.push({ provider: provider.name, error: errorMsg });
    }
  }

  // Fail-safe: If all providers failed because circuit breakers were open, force-try groq once
  if (errors.every((e) => e.error.includes('Circuit breaker OPEN'))) {
    console.warn('[LLM Router] All circuit breakers open — force-resetting Groq fail-safe channel');
    circuitState.groq.openUntil = 0;
    circuitState.groq.consecutiveFailures = 0;
    try {
      return await callWithTimeout(callGroq, messages, tools, timeoutMs);
    } catch (err) {
      errors.push({ provider: 'groq-failsafe', error: String(err) });
    }
  }

  // All providers failed
  throw new Error(
    `All LLM providers failed in fallback chain:\n${errors
      .map((e) => `  [${e.provider}] ${e.error}`)
      .join('\n')}`
  );
}

/**
 * Stream a chat request through the provider chain with circuit breaker fallback.
 * Yields StreamChunk tokens progressively. Falls back to blocking for Cloudflare.
 */
export async function* routeChatStream(options: RouterOptions): AsyncGenerator<StreamChunk, void, unknown> {
  const { messages, tools, preferredProvider } = options;

  // Build ordered streaming provider list using same quota-aware prioritization
  let orderedProviders = [...STREAMING_PROVIDERS];
  try {
    // Use the same priority logic by mapping streaming entries through the quota tracker
    const blockingEntries = orderedProviders.map((sp) => ({
      name: sp.name,
      call: sp.blockingCall || ((() => Promise.resolve({} as LLMResponse)) as ProviderFn),
    }));
    const prioritized = await quotaTracker.prioritizeProviders(blockingEntries, preferredProvider);
    const prioritizedNames = prioritized.map((p) => p.name);
    orderedProviders = prioritizedNames
      .map((name) => STREAMING_PROVIDERS.find((sp) => sp.name === name)!)
      .filter(Boolean);
  } catch (err) {
    console.warn('[LLM Router Stream] Quota prioritization fallback:', err);
  }

  const errors: Array<{ provider: string; error: string }> = [];
  const now = Date.now();

  for (const provider of orderedProviders) {
    const state = circuitState[provider.name];

    // Check if circuit breaker is open
    if (state.openUntil > now) {
      console.warn(
        `[LLM Router Stream] Skipping ${provider.name} — Circuit Breaker OPEN`
      );
      errors.push({
        provider: provider.name,
        error: `Circuit breaker OPEN`,
      });
      continue;
    }

    // Check if provider has exhausted its daily budget
    try {
      const qStatus = await quotaTracker.getStatus(provider.name);
      if (qStatus.isExhausted) {
        console.warn(`[LLM Router Stream] Skipping ${provider.name} — daily budget exhausted`);
        errors.push({
          provider: provider.name,
          error: `Daily budget exhausted`,
        });
        continue;
      }
    } catch {
      // Continue if quota check fails
    }

    try {
      const startTime = Date.now();
      console.log(`[LLM Router Stream] Streaming from provider: ${provider.name}`);

      // Cloudflare doesn't support streaming — use blocking fallback and emit as single chunk
      if (provider.name === 'cloudflare' && provider.blockingCall) {
        const response = await provider.blockingCall(messages, tools);
        state.consecutiveFailures = 0;
        state.openUntil = 0;
        quotaTracker.recordRequest(provider.name);
        if (response.content) {
          yield { token: response.content };
        }
        if (response.tool_calls) {
          yield { tool_calls: response.tool_calls, provider_used: 'cloudflare' };
        } else {
          yield { done: true, provider_used: 'cloudflare' };
        }
        return;
      }

      // Stream from the provider
      let emittedAny = false;
      for await (const chunk of provider.stream(messages, tools)) {
        emittedAny = true;
        yield chunk;

        // If provider signaled done or tool_calls, we're finished
        if (chunk.done || chunk.tool_calls) {
          const latencyMs = Date.now() - startTime;
          state.consecutiveFailures = 0;
          state.openUntil = 0;
          quotaTracker.recordRequest(provider.name);
          console.log(`[LLM Router Stream] Stream completed from ${provider.name} in ${latencyMs}ms`);
          return;
        }
      }

      // Stream ended naturally without a done/tool_call signal
      if (emittedAny) {
        const latencyMs = Date.now() - startTime;
        state.consecutiveFailures = 0;
        state.openUntil = 0;
        quotaTracker.recordRequest(provider.name);
        yield { done: true, provider_used: provider.name };
        console.log(`[LLM Router Stream] Stream completed from ${provider.name} in ${latencyMs}ms`);
        return;
      }

      throw new Error('Stream produced no output');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[LLM Router Stream] Provider ${provider.name} failed: ${errorMsg}`);

      state.consecutiveFailures++;
      if (state.consecutiveFailures >= CIRCUIT_BREAKER_FAIL_THRESHOLD) {
        state.openUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
        console.error(
          `[LLM Router Stream] ⚡ Circuit Breaker TRIPPED for ${provider.name}`
        );
      }

      errors.push({ provider: provider.name, error: errorMsg });
    }
  }

  // All streaming providers failed — yield error
  yield {
    error: `All LLM providers failed in streaming chain: ${errors.map((e) => `[${e.provider}] ${e.error}`).join('; ')}`,
    done: true,
  };
}
