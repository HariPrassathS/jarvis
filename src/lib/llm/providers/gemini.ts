// ──────────────────────────────────────────────
// LLM Provider: Google Gemini (Priority 1)
// Model: gemini-2.5-flash
// ──────────────────────────────────────────────

import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import type { ChatMessage, LLMResponse, ToolDefinition } from '@/types';

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not configured in environment variables');
    }
    _genAI = new GoogleGenerativeAI(key);
  }
  return _genAI;
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

export async function callGemini(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<LLMResponse> {
  const genAI = getGenAI();
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
        parts: [{ text: m.content }],
      });
    }
  }

  // Gemini requires the first history message to have role 'user'
  while (history.length > 0 && history[0].role !== 'user') {
    history.shift();
  }

  const lastMessage = chatMessages[chatMessages.length - 1];

  // Build model config
  const modelConfig: Parameters<typeof genAI.getGenerativeModel>[0] = {
    model: 'gemini-2.5-flash',
    generationConfig,
  };

  if (tools && tools.length > 0) {
    modelConfig.tools = [{
      functionDeclarations: toGeminiFunctionDeclarations(tools),
    }];
  }

  const model = genAI.getGenerativeModel(modelConfig);

  const chat = model.startChat({
    history: history as unknown as Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
    ...(systemMsg
      ? { systemInstruction: { role: 'user' as const, parts: [{ text: systemMsg.content }] } }
      : {}),
  });

  let messageToSend = lastMessage?.content || '';
  if (lastMessage?.role === 'tool') {
    // If last message is a tool response, send function response
    messageToSend = `Tool Result for ${lastMessage.name || 'query'}: ${lastMessage.content}`;
  }

  const result = await chat.sendMessage(messageToSend);
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
}
