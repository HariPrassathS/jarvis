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

// Active Free model on OpenRouter
const FREE_MODEL = 'nex-agi/nex-n2.5-pro:free';

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

  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: FREE_MODEL,
    messages: openaiMessages,
    temperature: 0.7,
    max_tokens: 2048,
  };

  if (tools && tools.length > 0) {
    params.tools = tools as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming['tools'];
    params.tool_choice = 'auto';
  }

  const { client, key } = getNextHealthyClient();

  let completion;
  try {
    completion = await client.chat.completions.create(params);
  } catch (err: any) {
    if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('quota')) {
      console.warn(`[OpenRouter Provider] Key ...${key.slice(-4)} hit rate limit. Cooling down for 60s.`);
      keyCooldowns.set(key, Date.now() + 60000);
    }
    throw err;
  }
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
}

/**
 * Stream OpenRouter response token-by-token using OpenAI SDK streaming.
 */
export async function* streamOpenRouter(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): AsyncGenerator<StreamChunk, void, unknown> {
  const openaiMessages = toOpenAIMessages(messages);

  const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
    model: FREE_MODEL,
    messages: openaiMessages,
    temperature: 0.7,
    max_tokens: 2048,
    stream: true,
  };

  if (tools && tools.length > 0) {
    params.tools = tools as OpenAI.Chat.ChatCompletionCreateParamsStreaming['tools'];
    params.tool_choice = 'auto';
  }

  const { client, key } = getNextHealthyClient();

  let stream;
  try {
    stream = await client.chat.completions.create(params);
  } catch (err: any) {
    if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('quota')) {
      console.warn(`[OpenRouter Stream] Key ...${key.slice(-4)} hit rate limit. Cooling down for 60s.`);
      keyCooldowns.set(key, Date.now() + 60000);
    }
    throw err;
  }

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
}
