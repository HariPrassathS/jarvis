// ──────────────────────────────────────────────
// LLM Provider: OpenRouter (Priority 3 — Fallback)
// Uses OpenAI-compatible API with free-tier models
// ──────────────────────────────────────────────

import OpenAI from 'openai';
import type { ChatMessage, LLMResponse, ToolDefinition } from '@/types';
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error('OPENROUTER_API_KEY is not configured in environment variables');
    }
    _client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: key,
      defaultHeaders: {
        'HTTP-Referer': 'https://jarvis-ai.vercel.app',
        'X-Title': 'JARVIS AI Assistant',
      },
    });
  }
  return _client;
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

  const completion = await getClient().chat.completions.create(params);
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
