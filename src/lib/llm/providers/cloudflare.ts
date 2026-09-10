// ──────────────────────────────────────────────
// LLM Provider: Cloudflare Workers AI (Priority 4 — Fallback Pool)
// 10,000 free Neurons/day headroom using @cf/meta/llama-3.1-8b-instruct
// ──────────────────────────────────────────────

import type { ChatMessage, LLMResponse, ToolDefinition } from '@/types';

export async function callCloudflare(
  messages: ChatMessage[],
  _tools?: ToolDefinition[]
): Promise<LLMResponse> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    throw new Error('CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID is not configured in environment variables');
  }

  // Cloudflare Workers AI expects messages with roles: system, user, assistant
  const formattedMessages = messages
    .filter((m) => m.role !== 'tool')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: m.content || '',
    }));

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: formattedMessages,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Cloudflare Workers AI failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data?.result?.response || '';

  return {
    content: text,
    provider_used: 'cloudflare',
  };
}
