// ──────────────────────────────────────────────
// Chat Stream API Route — SSE Streaming LLM Responses
// Mirrors /api/chat auth/profile/prompt logic but streams tokens
// ──────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds for streaming responses

import { NextRequest } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { routeChatStream } from '@/lib/llm/router';
import { routeChat } from '@/lib/llm/router';
import { buildSystemPrompt } from '@/lib/llm/system-prompt';
import { toolDefinitions } from '@/lib/tools/definitions';
import { executeToolCalls } from '@/lib/tools/executor';
import { recallMemories } from '@/lib/tools/memory';
import { extractAndStoreMemories } from '@/lib/llm/memory-extractor';
import { jarvisCache } from '@/lib/llm/cache';
import { operatorRateLimiter } from '@/lib/ratelimit/token-bucket';
import type { ChatMessage, VoicePersona, StreamChunk } from '@/types';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate via verified Firebase ID Token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
    } catch (authErr) {
      console.error('[Chat Stream API] Token verification rejected:', authErr);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const profileUid = decoded.uid;
    const profileEmail = decoded.email || '';
    const profileName = decoded.name || decoded.email?.split('@')[0] || 'Operator';

    const supabase = createServerSupabaseClient();

    // 2. High-speed cached profile resolution
    const profileCacheKey = `profile:${profileUid}`;
    let profile = jarvisCache.get<{ id: string; display_name: string; email?: string }>(profileCacheKey);

    if (!profile) {
      try {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id, display_name, email')
          .eq('firebase_uid', profileUid)
          .single();

        if (existingProfile) {
          profile = existingProfile;
        } else {
          const { data: newProfile } = await supabase
            .from('profiles')
            .insert({
              firebase_uid: profileUid,
              email: profileEmail,
              display_name: profileName,
            })
            .select('id, display_name, email')
            .single();
          profile = newProfile || { id: profileUid, display_name: profileName, email: profileEmail };
        }
      } catch (dbErr) {
        console.warn('[Chat Stream API] Supabase profile sync fallback:', dbErr);
        profile = { id: profileUid, display_name: profileName, email: profileEmail };
      }

      if (profile) {
        jarvisCache.set(profileCacheKey, profile, 600000);
      }
    }

    // 3. Parse request payload
    let clientMessages: ChatMessage[] = [];
    let conversationId = '';
    let requestPersona: VoicePersona | undefined = undefined;
    let googleAccessToken = req.headers.get('x-google-access-token') || undefined;

    try {
      const body = await req.json();
      if (Array.isArray(body.messages) && body.messages.length > 0) {
        clientMessages = body.messages;
      } else if (typeof body.message === 'string' && body.message.trim()) {
        clientMessages = [{ role: 'user', content: body.message.trim() }];
      }
      conversationId = body.conversation_id || '';
      const personaVal = body.voice_persona || body.voicePersona;
      if (personaVal === 'jarvis' || personaVal === 'friday') {
        requestPersona = personaVal;
      }
      if (body.google_access_token) {
        googleAccessToken = body.google_access_token;
      }
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }


    // 4. Resolve conversation ID
    if (!conversationId) {
      conversationId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000';
    }

    const contextualMessages = clientMessages.slice(-20);
    const lastUserMsg = contextualMessages[contextualMessages.length - 1];
    const priorHistory = contextualMessages.slice(0, -1);

    // Conversation record assurance
    const convCacheKey = `conv:${conversationId}`;
    if (!jarvisCache.get(convCacheKey)) {
      try {
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('id')
          .eq('id', conversationId)
          .maybeSingle();

        if (!existingConv) {
          await supabase.from('conversations').insert({
            id: conversationId,
            profile_id: profile.id,
            title: lastUserMsg?.content?.slice(0, 80) || 'Active Dialogue',
          });
        }
        jarvisCache.set(convCacheKey, true, 3600000);
      } catch (convErr) {
        console.warn('[Chat Stream API] Conversation record check warning:', convErr);
      }
    }

    // 5. Persist user message (non-blocking)
    if (lastUserMsg?.role === 'user') {
      Promise.resolve(
        supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            role: 'user',
            content: lastUserMsg.content,
          })
      ).catch(() => {});
    }

    // 6. Resolve memories and settings
    const settingsCacheKey = `settings:${profile.id}`;
    const cachedSettings = jarvisCache.get<any>(settingsCacheKey);

    const getSettingsAsync = async () => {
      if (cachedSettings) return { data: cachedSettings };
      try {
        const res = await supabase
          .from('settings')
          .select('preferred_provider, voice_persona')
          .eq('profile_id', profile.id)
          .single();
        return res;
      } catch {
        return { data: null };
      }
    };

    const [memories, settingsData] = await Promise.all([
      recallMemories(profile.id),
      getSettingsAsync(),
    ]);

    const settingsObj = cachedSettings || settingsData?.data;
    const preferredProvider = settingsObj?.preferred_provider;
    const effectivePersona: VoicePersona = requestPersona || settingsObj?.voice_persona || 'jarvis';

    if (!cachedSettings && settingsObj) {
      jarvisCache.set(settingsCacheKey, settingsObj, 600000);
    }

    // 6.5. Rate limiter
    const rateLimit = operatorRateLimiter.check(profileUid, effectivePersona);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          message: rateLimit.message,
          provider_used: 'throttle-guard',
          throttled: true,
          wait_seconds: rateLimit.waitSeconds,
          conversation_id: conversationId,
          voice_persona: effectivePersona,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 7. Build system prompt
    const systemPrompt = buildSystemPrompt(
      profile.display_name,
      profile.email || profileEmail,
      memories,
      priorHistory,
      effectivePersona
    );

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...contextualMessages,
    ];

    // 8. Create SSE stream
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendSSE = (data: StreamChunk) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          let accumulatedContent = '';
          let providerUsed = '';
          let toolCallsReceived: StreamChunk['tool_calls'] | undefined;

          for await (const chunk of routeChatStream({
            messages: llmMessages,
            tools: toolDefinitions,
            preferredProvider,
          })) {
            // Forward token to client
            if (chunk.token) {
              accumulatedContent += chunk.token;
              sendSSE({ token: chunk.token });
            }

            // Tool calls — handle synchronously
            if (chunk.tool_calls) {
              toolCallsReceived = chunk.tool_calls;
              providerUsed = chunk.provider_used || '';

              // Execute tools
              const toolResults = await executeToolCalls(chunk.tool_calls, profile.id, {
                googleAccessToken,
              });


              // Build messages for synthesis re-invocation
              const synthMessages: ChatMessage[] = [
                ...llmMessages,
                {
                  role: 'assistant',
                  content: accumulatedContent || '',
                  tool_calls: chunk.tool_calls,
                },
              ];
              for (const result of toolResults) {
                synthMessages.push({
                  role: 'tool',
                  name: result.name,
                  content: result.content,
                  tool_call_id: result.tool_call_id,
                });
              }

              // Re-invoke blocking (no tools) for final synthesis
              try {
                const synthResponse = await routeChat({
                  messages: synthMessages,
                  tools: undefined,
                  preferredProvider,
                });

                accumulatedContent = synthResponse.content || '';
                providerUsed = synthResponse.provider_used || providerUsed;

                // Send synthesis as a single text chunk
                sendSSE({ token: accumulatedContent });
                sendSSE({
                  done: true,
                  provider_used: synthResponse.provider_used,
                });
              } catch (synthErr) {
                console.warn('[Chat Stream API] Tool synthesis fallback:', synthErr);
                sendSSE({
                  done: true,
                  provider_used: providerUsed as any,
                  error: 'Tool synthesis failed',
                });
              }

              break; // Tool calls end the stream
            }

            // Stream done signal
            if (chunk.done) {
              providerUsed = chunk.provider_used || providerUsed;
              sendSSE({
                done: true,
                provider_used: chunk.provider_used,
              });
              break;
            }

            // Error signal
            if (chunk.error) {
              sendSSE({ error: chunk.error, done: true });
              break;
            }
          }

          // Finalize: conversation_id and persona metadata
          sendSSE({
            done: true,
            provider_used: (providerUsed || undefined) as any,
          });

          const finalContent = accumulatedContent.trim() || 'At your service, sir. All systems are operational.';

          // Persist assistant response (fire-and-forget)
          Promise.resolve(
            supabase
              .from('messages')
              .insert({
                conversation_id: conversationId,
                role: 'assistant',
                content: finalContent,
                provider_used: providerUsed || null,
              })
          ).catch(() => {});

          // Background memory extraction
          if (lastUserMsg?.content && finalContent) {
            Promise.resolve()
              .then(() => extractAndStoreMemories(profile.id, lastUserMsg.content, finalContent))
              .catch((err) => console.warn('[Chat Stream API] Memory extraction warning:', err));
          }

        } catch (streamErr) {
          console.error('[Chat Stream API] Stream error:', streamErr);
          const errMsg = streamErr instanceof Error ? streamErr.message : 'Stream failed';
          sendSSE({ error: errMsg, done: true });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Conversation-Id': conversationId,
        'X-Voice-Persona': effectivePersona,
      },
    });
  } catch (error) {
    console.error('[Chat Stream API] Fatal error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Failed to process streaming request';
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
