// ──────────────────────────────────────────────
// LLM Provider: Google Gemini (Priority 1)
// Model: gemini-2.5-flash
// ──────────────────────────────────────────────

import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import type { ChatMessage, LLMResponse, ToolDefinition, StreamChunk } from '@/types';

// Multi-Key Round-Robin with 429 Cooldown Protection
const keyCooldowns = new Map<string, number>();
const genAICache = new Map<string, GoogleGenerativeAI>();
let currentKeyIndex = 0;

function getAvailableKeys(): string[] {
  const multi = process.env.GEMINI_API_KEYS;
  let keys: string[] = [];
  if (multi) {
    keys = multi.split(',').map((k) => k.trim()).filter(Boolean);
  }
  if (keys.length === 0 && process.env.GEMINI_API_KEY) {
    keys = [process.env.GEMINI_API_KEY.trim()];
  }
  return keys;
}

function getNextHealthyGenAI(): { genAI: GoogleGenerativeAI; key: string } {
  const keys = getAvailableKeys();
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY is not configured in environment variables');
  }

  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentKeyIndex + i) % keys.length;
    const candidateKey = keys[idx];
    const cooldownUntil = keyCooldowns.get(candidateKey) || 0;

    if (now >= cooldownUntil) {
      currentKeyIndex = (idx + 1) % keys.length;
      let instance = genAICache.get(candidateKey);
      if (!instance) {
        instance = new GoogleGenerativeAI(candidateKey);
        genAICache.set(candidateKey, instance);
      }
      return { genAI: instance, key: candidateKey };
    }
  }

  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  const fallbackKey = keys[0];
  let instance = genAICache.get(fallbackKey);
  if (!instance) {
    instance = new GoogleGenerativeAI(fallbackKey);
    genAICache.set(fallbackKey, instance);
  }
  return { genAI: instance, key: fallbackKey };
}

/**
 * Convert our tool definitions to Gemini's FunctionDeclaration format.
 */
function toGeminiFunctionDeclarations(tools: ToolDefinition[]): FunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: Object.fromEntries(
        Object.entries(t.function.parameters.properties).map(([key, prop]) => [
          key,
          {
            type: SchemaType.STRING,
            description: prop.description,
          },
        ])
      ),
      required: t.function.parameters.required,
    },
  }));
}

/**
 * Convert user message and any attachments into Gemini Part objects (supporting image inlineData and documents).
 */
function buildGeminiUserParts(message: ChatMessage): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];

  // 1. Attachments: Image Data URLs & Extracted Document Text
  if (message.attachments && message.attachments.length > 0) {
    for (const att of message.attachments) {
      if (att.type === 'image' && att.dataUrl) {
        // Parse data:image/png;base64,...
        const match = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      } else if (att.type === 'document' && att.extractedText) {
        // Include extracted document telemetry
        const docHeader = `[DOCUMENT ATTACHMENT: "${att.name}" (${att.pageCount ? att.pageCount + ' pages, ' : ''}${Math.round(att.size / 1024)}KB)]`;
        parts.push({
          text: `${docHeader}\n${att.extractedText}\n--- END DOCUMENT ---`,
        });
      }
    }
  }

  // 2. Text message content
  let text = message.content || '';
  if (!text && parts.length > 0) {
    text = 'Please examine this visual/document telemetry and report your analysis, sir.';
  }
  if (text) {
    parts.push({ text });
  }

  return parts.length > 0 ? parts : [{ text: '' }];
}

// ──────────────────────────────────────────────
// LLM Provider: Google Gemini (Priority 1)
// Verified Models: gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro
// ──────────────────────────────────────────────

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.6-flash'];

export async function callGemini(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<LLMResponse> {
  const { genAI, key } = getNextHealthyGenAI();
  const generationConfig = {
    temperature: 0.7,
    maxOutputTokens: 2048,
  };

  // Convert to Gemini format: separate system instruction from history
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  // Build Gemini history format with support for tool calls and function responses
  const history: Array<{ role: 'user' | 'model' | 'function'; parts: Array<Record<string, unknown>> }> = [];

  for (let i = 0; i < chatMessages.length - 1; i++) {
    const m = chatMessages[i];
    if (m.role === 'tool') {
      history.push({
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: m.name || 'tool_result',
              response: { content: m.content },
            },
          },
        ],
      });
    } else if (m.role === 'assistant') {
      if (m.tool_calls && m.tool_calls.length > 0) {
        history.push({
          role: 'model',
          parts: m.tool_calls.map((tc) => {
            let parsedArgs = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments);
            } catch {}
            return {
              functionCall: {
                name: tc.function.name,
                args: parsedArgs,
              },
            };
          }),
        });
      } else {
        history.push({
          role: 'model',
          parts: [{ text: m.content || '' }],
        });
      }
    } else {
      history.push({
        role: 'user',
        parts: buildGeminiUserParts(m),
      });
    }
  }

  // Gemini history must alternate user -> model -> user -> model and end with model before sendMessage
  const validHistory: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];
  let expectedRole: 'user' | 'model' = 'user';
  for (const h of history) {
    if (h.role === 'function' || h.role === 'user') {
      if (expectedRole === 'user') {
        validHistory.push(h as any);
        expectedRole = 'model';
      }
    } else if (h.role === 'model') {
      if (expectedRole === 'model') {
        validHistory.push(h as any);
        expectedRole = 'user';
      }
    }
  }
  if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
    validHistory.pop();
  }

  const lastMessage = chatMessages[chatMessages.length - 1];
  let messagePartsToSend: any = '';
  if (lastMessage?.role === 'tool') {
    messagePartsToSend = `Tool Result for ${lastMessage.name || 'query'}: ${lastMessage.content}`;
  } else if (lastMessage) {
    messagePartsToSend = buildGeminiUserParts(lastMessage);
  }

  let lastErr: any;

  for (const modelName of GEMINI_MODELS) {
    try {
      const modelConfig: Parameters<typeof genAI.getGenerativeModel>[0] = {
        model: modelName,
        generationConfig,
        ...(systemMsg ? { systemInstruction: systemMsg.content } : {}),
      };

      if (tools && tools.length > 0) {
        modelConfig.tools = [{
          functionDeclarations: toGeminiFunctionDeclarations(tools),
        }];
      }

      const model = genAI.getGenerativeModel(modelConfig);

      const chat = model.startChat({
        history: validHistory as unknown as Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
      });

      const result = await chat.sendMessage(messagePartsToSend);
      const response = result.response;
      const candidate = response.candidates?.[0];

      // Check for function calls
      if (candidate?.content?.parts) {
        const functionCallParts = candidate.content.parts.filter(
          (p) => 'functionCall' in p && p.functionCall
        );

        if (functionCallParts.length > 0) {
          const toolCalls = functionCallParts.map((p, i) => {
            const fc = p.functionCall!;
            return {
              id: `gemini-tc-${i}-${Date.now()}`,
              type: 'function' as const,
              function: {
                name: fc.name,
                arguments: JSON.stringify(fc.args || {}),
              },
            };
          });

          return {
            content: '',
            provider_used: 'gemini',
            tool_calls: toolCalls,
          };
        }
      }

      let textContent = '';
      try {
        textContent = response.text() || '';
      } catch {
        const textPart = candidate?.content?.parts?.find((p) => 'text' in p);
        textContent = (textPart as { text?: string })?.text || '';
      }

      return {
        content: textContent,
        provider_used: 'gemini',
      };
    } catch (err: any) {
      lastErr = err;
      const isQuotaOrNotFound =
        err?.status === 429 ||
        err?.status === 404 ||
        err?.message?.includes('429') ||
        err?.message?.includes('404') ||
        err?.message?.includes('quota') ||
        err?.message?.includes('not found') ||
        err?.message?.includes('Resource has been exhausted');

      if (isQuotaOrNotFound) {
        console.warn(`[Gemini Provider] Model ${modelName} returned error (${err?.message}). Trying fallback model...`);
        continue;
      }
      throw err;
    }
  }

  if (lastErr?.status === 429 || lastErr?.message?.includes('429') || lastErr?.message?.includes('quota') || lastErr?.message?.includes('Resource has been exhausted')) {
    console.warn(`[Gemini Provider] Key ...${key.slice(-4)} hit quota limit. Cooling down for 60s.`);
    keyCooldowns.set(key, Date.now() + 60000);
  }
  throw lastErr;
}

/**
 * Stream Gemini response token-by-token via sendMessageStream().
 * Yields StreamChunk with text deltas or tool_calls on function call responses.
 */
export async function* streamGemini(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): AsyncGenerator<StreamChunk, void, unknown> {
  const { genAI, key } = getNextHealthyGenAI();
  const generationConfig = {
    temperature: 0.7,
    maxOutputTokens: 2048,
  };

  // Convert to Gemini format: separate system instruction from history
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  // Build Gemini history format with support for tool calls and function responses
  const history: Array<{ role: 'user' | 'model' | 'function'; parts: Array<Record<string, unknown>> }> = [];

  for (let i = 0; i < chatMessages.length - 1; i++) {
    const m = chatMessages[i];
    if (m.role === 'tool') {
      history.push({
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: m.name || 'tool_result',
              response: { content: m.content },
            },
          },
        ],
      });
    } else if (m.role === 'assistant') {
      if (m.tool_calls && m.tool_calls.length > 0) {
        history.push({
          role: 'model',
          parts: m.tool_calls.map((tc) => {
            let parsedArgs = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments);
            } catch {}
            return {
              functionCall: {
                name: tc.function.name,
                args: parsedArgs,
              },
            };
          }),
        });
      } else {
        history.push({
          role: 'model',
          parts: [{ text: m.content || '' }],
        });
      }
    } else {
      history.push({
        role: 'user',
        parts: buildGeminiUserParts(m),
      });
    }
  }

  // Validate history alternation (same logic as callGemini)
  const validHistory: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];
  let expectedRole: 'user' | 'model' = 'user';
  for (const h of history) {
    if (h.role === 'function' || h.role === 'user') {
      if (expectedRole === 'user') {
        validHistory.push(h as any);
        expectedRole = 'model';
      }
    } else if (h.role === 'model') {
      if (expectedRole === 'model') {
        validHistory.push(h as any);
        expectedRole = 'user';
      }
    }
  }
  if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
    validHistory.pop();
  }

  const lastMessage = chatMessages[chatMessages.length - 1];
  let messagePartsToSend: any = '';
  if (lastMessage?.role === 'tool') {
    messagePartsToSend = `Tool Result for ${lastMessage.name || 'query'}: ${lastMessage.content}`;
  } else if (lastMessage) {
    messagePartsToSend = buildGeminiUserParts(lastMessage);
  }

  let lastErr: any;

  for (const modelName of GEMINI_MODELS) {
    try {
      const modelConfig: Parameters<typeof genAI.getGenerativeModel>[0] = {
        model: modelName,
        generationConfig,
        ...(systemMsg ? { systemInstruction: systemMsg.content } : {}),
      };

      if (tools && tools.length > 0) {
        modelConfig.tools = [{
          functionDeclarations: toGeminiFunctionDeclarations(tools),
        }];
      }

      const model = genAI.getGenerativeModel(modelConfig);

      const chat = model.startChat({
        history: validHistory as unknown as Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
      });

      const streamResult = await chat.sendMessageStream(messagePartsToSend);

      let accumulatedText = '';
      let toolCallsDetected: StreamChunk['tool_calls'] | undefined;

      for await (const chunk of streamResult.stream) {
        const candidate = chunk.candidates?.[0];
        if (!candidate?.content?.parts) continue;

        // Check for function calls
        const functionCallParts = candidate.content.parts.filter(
          (p) => 'functionCall' in p && p.functionCall
        );

        if (functionCallParts.length > 0) {
          toolCallsDetected = functionCallParts.map((p, i) => {
            const fc = p.functionCall!;
            return {
              id: `gemini-tc-${i}-${Date.now()}`,
              type: 'function' as const,
              function: {
                name: fc.name,
                arguments: JSON.stringify(fc.args || {}),
              },
            };
          });
          // Tool calls end the stream — yield them and return
          yield { tool_calls: toolCallsDetected, provider_used: 'gemini' };
          return;
        }

        // Extract text deltas
        for (const part of candidate.content.parts) {
          if ('text' in part && part.text) {
            accumulatedText += part.text;
            yield { token: part.text as string };
          }
        }
      }

      yield { done: true, provider_used: 'gemini' };
      return;
    } catch (err: any) {
      lastErr = err;
      const isQuotaOrNotFound =
        err?.status === 429 ||
        err?.status === 404 ||
        err?.message?.includes('429') ||
        err?.message?.includes('404') ||
        err?.message?.includes('quota') ||
        err?.message?.includes('not found') ||
        err?.message?.includes('Resource has been exhausted');

      if (isQuotaOrNotFound) {
        console.warn(`[Gemini Stream] Model ${modelName} returned error (${err?.message}). Trying fallback model...`);
        continue;
      }
      throw err;
    }
  }

  if (lastErr?.status === 429 || lastErr?.message?.includes('429') || lastErr?.message?.includes('quota') || lastErr?.message?.includes('Resource has been exhausted')) {
    console.warn(`[Gemini Stream] Key ...${key.slice(-4)} hit quota limit. Cooling down for 60s.`);
    keyCooldowns.set(key, Date.now() + 60000);
  }
  throw lastErr;
}
