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

let _client: Groq | null = null;
function getClient(): Groq {
  if (!_client) {
    _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _client;
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

  const completion = await getClient().chat.completions.create(params);
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
}
