// ──────────────────────────────────────────────
// LLM Provider: Groq (Priority 2)
// Model: openai/gpt-oss-120b
// ──────────────────────────────────────────────

import Groq from 'groq-sdk';
import type { ChatMessage, LLMResponse, ToolDefinition, StreamChunk } from '@/types';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionAssistantMessageParam,
} from 'groq-sdk/resources/chat/completions';

function toGroqMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m): ChatCompletionMessageParam => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        content: m.content,
        tool_call_id: m.tool_call_id || '',
      } satisfies ChatCompletionToolMessageParam;
    }
    if (m.role === 'assistant') {
      if (m.tool_calls && m.tool_calls.length > 0) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        } satisfies ChatCompletionAssistantMessageParam;
      }
      return {
        role: 'assistant',
        content: m.content || '',
      } satisfies ChatCompletionAssistantMessageParam;
    }
    if (m.role === 'system') {
      return {
        role: 'system',
        content: m.content,
      } satisfies ChatCompletionSystemMessageParam;
    }
    return {
      role: 'user',
      content: m.content,
    } satisfies ChatCompletionUserMessageParam;
  });
}

// Multi-Key Round-Robin with 429 Cooldown Protection
const keyCooldowns = new Map<string, number>();
const clientCache = new Map<string, Groq>();
let currentKeyIndex = 0;

function getAvailableKeys(): string[] {
  const multi = process.env.GROQ_API_KEYS;
  let keys: string[] = [];
  if (multi) {
    keys = multi.split(',').map((k) => k.trim()).filter(Boolean);
  }
  if (keys.length === 0 && process.env.GROQ_API_KEY) {
    keys = [process.env.GROQ_API_KEY.trim()];
  }
  return keys;
}

function getNextHealthyClient(): { client: Groq; key: string } {
  const keys = getAvailableKeys();
  if (keys.length === 0) {
    throw new Error('GROQ_API_KEY is not configured in environment variables');
  }

  const now = Date.now();
  // Try up to keys.length times to find a key not in cooldown
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentKeyIndex + i) % keys.length;
    const candidateKey = keys[idx];
    const cooldownUntil = keyCooldowns.get(candidateKey) || 0;

    if (now >= cooldownUntil) {
      currentKeyIndex = (idx + 1) % keys.length;
      let client = clientCache.get(candidateKey);
      if (!client) {
        client = new Groq({ apiKey: candidateKey });
        clientCache.set(candidateKey, client);
      }
      return { client, key: candidateKey };
    }
  }

  // If all keys are in cooldown, pick the one expiring earliest
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  const fallbackKey = keys[0];
  let client = clientCache.get(fallbackKey);
  if (!client) {
    client = new Groq({ apiKey: fallbackKey });
    clientCache.set(fallbackKey, client);
  }
  return { client, key: fallbackKey };
}

const GROQ_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'groq/compound',
];

export async function callGroq(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<LLMResponse> {
  const groqMessages = toGroqMessages(messages);
  const { client, key } = getNextHealthyClient();

  let lastErr: any;

  for (const model of GROQ_MODELS) {
    const params: ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 2048,
      stream: false,
    };

    if (tools && tools.length > 0) {
      params.tools = tools as ChatCompletionCreateParamsNonStreaming['tools'];
      params.tool_choice = 'auto';
    }

    try {
      const completion = await client.chat.completions.create(params);
      const choice = completion.choices[0];

      return {
        content: choice.message.content || '',
        provider_used: 'groq',
        tool_calls: choice.message.tool_calls?.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      };
    } catch (err: any) {
      lastErr = err;
      const isRateLimitOrNotFound =
        err?.status === 429 ||
        err?.status === 404 ||
        err?.status === 400 ||
        err?.message?.includes('429') ||
        err?.message?.includes('404') ||
        err?.message?.includes('400') ||
        err?.message?.includes('rate_limit') ||
        err?.message?.includes('model') ||
        err?.message?.includes('quota');
      if (isRateLimitOrNotFound) {
        console.warn(`[Groq Provider] Model ${model} failed (${err?.message}). Trying fallback model in mesh...`);
        continue;
      }
      throw err;
    }
  }

  // If all candidate models in Groq failed with rate limit, cool down key for 30s
  if (
    lastErr?.status === 429 ||
    lastErr?.message?.includes('429') ||
    lastErr?.message?.includes('quota')
  ) {
    console.warn(`[Groq Provider] Key ...${key.slice(-4)} all models rate-limited. Cooling down.`);
    keyCooldowns.set(key, Date.now() + 30000);
  }
  throw lastErr;
}

/**
 * Stream Groq response token-by-token.
 * Multi-model fallback on 429: tries each model's stream before giving up.
 */
export async function* streamGroq(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): AsyncGenerator<StreamChunk, void, unknown> {
  const groqMessages = toGroqMessages(messages);
  const { client, key } = getNextHealthyClient();

  let lastErr: any;

  for (const model of GROQ_MODELS) {
    const params: ChatCompletionCreateParamsStreaming = {
      model,
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 2048,
      stream: true,
    };

    if (tools && tools.length > 0) {
      params.tools = tools as ChatCompletionCreateParamsStreaming['tools'];
      params.tool_choice = 'auto';
    }

    try {
      const stream = await client.chat.completions.create(params);

      // Accumulate tool calls across chunks (they arrive in parts)
      const toolCallAccumulator: Record<number, { id: string; name: string; arguments: string }> = {};
      let hasToolCalls = false;

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        // Handle tool call deltas
        if (delta.tool_calls) {
          hasToolCalls = true;
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallAccumulator[idx]) {
              toolCallAccumulator[idx] = {
                id: tc.id || `groq-tc-${idx}-${Date.now()}`,
                name: tc.function?.name || '',
                arguments: '',
              };
            }
            if (tc.function?.name) {
              toolCallAccumulator[idx].name = tc.function.name;
            }
            if (tc.function?.arguments) {
              toolCallAccumulator[idx].arguments += tc.function.arguments;
            }
          }
          continue;
        }

        // Handle text content deltas
        if (delta.content) {
          yield { token: delta.content };
        }
      }

      // If tool calls were accumulated, yield them
      if (hasToolCalls) {
        const toolCalls = Object.values(toolCallAccumulator).map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
        yield { tool_calls: toolCalls, provider_used: 'groq' };
        return;
      }

      yield { done: true, provider_used: 'groq' };
      return;
    } catch (err: any) {
      lastErr = err;
      const isRateLimitOrNotFound =
        err?.status === 429 ||
        err?.status === 404 ||
        err?.status === 400 ||
        err?.message?.includes('429') ||
        err?.message?.includes('404') ||
        err?.message?.includes('400') ||
        err?.message?.includes('rate_limit') ||
        err?.message?.includes('model') ||
        err?.message?.includes('quota');
      if (isRateLimitOrNotFound) {
        console.warn(`[Groq Stream] Model ${model} failed (${err?.message}). Trying fallback model...`);
        continue;
      }
      throw err;
    }
  }

  // All models rate-limited — cool down key
  if (
    lastErr?.status === 429 ||
    lastErr?.message?.includes('429') ||
    lastErr?.message?.includes('quota')
  ) {
    console.warn(`[Groq Stream] Key ...${key.slice(-4)} all models rate-limited. Cooling down.`);
    keyCooldowns.set(key, Date.now() + 30000);
  }
  throw lastErr;
}
