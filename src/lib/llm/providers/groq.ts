// ──────────────────────────────────────────────
// LLM Provider: Groq (Priority 2)
// Model: openai/gpt-oss-120b
// ──────────────────────────────────────────────

import Groq from 'groq-sdk';
import type { ChatMessage, LLMResponse, ToolDefinition } from '@/types';
import type {
  ChatCompletionCreateParamsNonStreaming,
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

export async function callGroq(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<LLMResponse> {
  const groqMessages = toGroqMessages(messages);

  const params: ChatCompletionCreateParamsNonStreaming = {
    model: 'openai/gpt-oss-120b',
    messages: groqMessages,
    temperature: 0.7,
    max_tokens: 2048,
    stream: false,
  };

  if (tools && tools.length > 0) {
    params.tools = tools as ChatCompletionCreateParamsNonStreaming['tools'];
    params.tool_choice = 'auto';
  }

  const { client, key } = getNextHealthyClient();

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
    // If rate limit (HTTP 429) or quota exceeded, cool down this specific key for 60s
    if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('quota')) {
      console.warn(`[Groq Provider] Key ...${key.slice(-4)} hit rate limit. Cooling down for 60s.`);
      keyCooldowns.set(key, Date.now() + 60000);
    }
    throw err;
  }
}
