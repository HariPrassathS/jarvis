// ──────────────────────────────────────────────
// LLM Provider: OpenRouter (Priority 3 — Fallback)
// Uses OpenAI-compatible API with free-tier models
// ──────────────────────────────────────────────

import OpenAI from 'openai';
import type { ChatMessage, LLMResponse, ToolDefinition, StreamChunk } from '@/types';
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';

// Multi-Key Round-Robin with 429 Cooldown Protection
const keyCooldowns = new Map<string, number>();
const clientCache = new Map<string, OpenAI>();
let currentKeyIndex = 0;

function getAvailableKeys(): string[] {
  const multi = process.env.OPENROUTER_API_KEYS;
  let keys: string[] = [];
  if (multi) {
    keys = multi.split(',').map((k) => k.trim()).filter(Boolean);
  }
  if (keys.length === 0 && process.env.OPENROUTER_API_KEY) {
    keys = [process.env.OPENROUTER_API_KEY.trim()];
  }
  return keys;
}

function getNextHealthyClient(): { client: OpenAI; key: string } {
  const keys = getAvailableKeys();
  if (keys.length === 0) {
    throw new Error('OPENROUTER_API_KEY is not configured in environment variables');
  }

  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentKeyIndex + i) % keys.length;
    const candidateKey = keys[idx];
    const cooldownUntil = keyCooldowns.get(candidateKey) || 0;

    if (now >= cooldownUntil) {
      currentKeyIndex = (idx + 1) % keys.length;
      let client = clientCache.get(candidateKey);
      if (!client) {
        client = new OpenAI({
          baseURL: 'https://openrouter.ai/api/v1',
          apiKey: candidateKey,
          defaultHeaders: {
            'HTTP-Referer': 'https://jarvis-ai.vercel.app',
            'X-Title': 'JARVIS AI Assistant',
          },
        });
        clientCache.set(candidateKey, client);
      }
      return { client, key: candidateKey };
    }
  }

  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  const fallbackKey = keys[0];
  let client = clientCache.get(fallbackKey);
  if (!client) {
    client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: fallbackKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://jarvis-ai.vercel.app',
        'X-Title': 'JARVIS AI Assistant',
      },
    });
    clientCache.set(fallbackKey, client);
  }
  return { client, key: fallbackKey };
}

// Active Free models on OpenRouter with multi-model fallback mesh
const OPENROUTER_MODELS = [
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-31b-it:free',
  'nex-agi/nex-n2.5-pro:free',
  'inclusionai/ling-3.0-flash-vl:free',
];

function toOpenAIMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
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

export async function callOpenRouter(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<LLMResponse> {
  const openaiMessages = toOpenAIMessages(messages);
  const { client, key } = getNextHealthyClient();

  let lastErr: any;

  for (const model of OPENROUTER_MODELS) {
    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: openaiMessages,
      temperature: 0.7,
      max_tokens: 2048,
    };

    if (tools && tools.length > 0) {
      params.tools = tools as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming['tools'];
      params.tool_choice = 'auto';
    }

    try {
      const completion = await client.chat.completions.create(params);
      const choice = completion.choices[0];

      // Narrow tool_calls to function tool calls only
      const functionToolCalls = choice.message.tool_calls?.filter(
        (tc): tc is ChatCompletionMessageFunctionToolCall => tc.type === 'function'
      );

      return {
        content: choice.message.content || '',
        provider_used: 'openrouter',
        tool_calls: functionToolCalls?.map((tc) => ({
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
      const isQuotaOrModelError =
        err?.status === 429 ||
        err?.status === 404 ||
        err?.status === 400 ||
        err?.message?.includes('429') ||
        err?.message?.includes('404') ||
        err?.message?.includes('quota') ||
        err?.message?.includes('rate limit') ||
        err?.message?.includes('model');

      if (isQuotaOrModelError) {
        console.warn(`[OpenRouter Provider] Model ${model} failed (${err?.message}). Trying fallback model...`);
        continue;
      }
      throw err;
    }
  }

  if (lastErr?.status === 429 || lastErr?.message?.includes('429') || lastErr?.message?.includes('quota')) {
    console.warn(`[OpenRouter Provider] Key ...${key.slice(-4)} hit rate limit. Cooling down for 60s.`);
    keyCooldowns.set(key, Date.now() + 60000);
  }
  throw lastErr;
}

/**
 * Stream OpenRouter response token-by-token using OpenAI SDK streaming.
 */
export async function* streamOpenRouter(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): AsyncGenerator<StreamChunk, void, unknown> {
  const openaiMessages = toOpenAIMessages(messages);
  const { client, key } = getNextHealthyClient();

  let lastErr: any;

  for (const model of OPENROUTER_MODELS) {
    const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model,
      messages: openaiMessages,
      temperature: 0.7,
      max_tokens: 2048,
      stream: true,
    };

    if (tools && tools.length > 0) {
      params.tools = tools as OpenAI.Chat.ChatCompletionCreateParamsStreaming['tools'];
      params.tool_choice = 'auto';
    }

    try {
      const stream = await client.chat.completions.create(params);

      // Accumulate tool calls across chunks
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
                id: tc.id || `or-tc-${idx}-${Date.now()}`,
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
        yield { tool_calls: toolCalls, provider_used: 'openrouter' };
        return;
      }

      yield { done: true, provider_used: 'openrouter' };
      return;
    } catch (err: any) {
      lastErr = err;
      const isQuotaOrModelError =
        err?.status === 429 ||
        err?.status === 404 ||
        err?.status === 400 ||
        err?.message?.includes('429') ||
        err?.message?.includes('404') ||
        err?.message?.includes('quota') ||
        err?.message?.includes('rate limit') ||
        err?.message?.includes('model');

      if (isQuotaOrModelError) {
        console.warn(`[OpenRouter Stream] Model ${model} failed (${err?.message}). Trying fallback model...`);
        continue;
      }
      throw err;
    }
  }

  if (lastErr?.status === 429 || lastErr?.message?.includes('429') || lastErr?.message?.includes('quota')) {
    console.warn(`[OpenRouter Stream] Key ...${key.slice(-4)} hit rate limit. Cooling down for 60s.`);
    keyCooldowns.set(key, Date.now() + 60000);
  }
  throw lastErr;
}
