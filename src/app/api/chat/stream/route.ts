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
import { toolDefinitions, getToolsForClearance } from '@/lib/tools/definitions';
import { executeToolCalls } from '@/lib/tools/executor';
import { recallMemories } from '@/lib/tools/memory';
import { extractAndStoreMemories } from '@/lib/llm/memory-extractor';
import { jarvisCache } from '@/lib/llm/cache';
import { operatorRateLimiter } from '@/lib/ratelimit/token-bucket';
import { checkEasterEgg } from '@/lib/llm/easter-eggs';
import { uploadUserFile } from '@/lib/files/storage';
import { insertUploadedFile } from '@/lib/files/metadata';
import type { ChatMessage, VoicePersona, StreamChunk, ClearanceLevel } from '@/types';

export async function POST(req: NextRequest) {
  const reqStart = Date.now();
  console.log('[Server:ChatStream] 🚀 Incoming /api/chat/stream request received at', new Date().toISOString());

  try {
    // 1. Authenticate via verified Firebase ID Token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.warn('[Server:ChatStream] ❌ Missing or malformed Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
      console.log(`[Server:ChatStream] 🔑 Token verified for UID: ${decoded.uid} (${decoded.email || 'no-email'})`);
    } catch (authErr) {
      console.error('[Server:ChatStream] ❌ Token verification rejected:', authErr);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const profileUid = decoded.uid;
    const profileEmail = decoded.email || '';
    const profileName = decoded.name || decoded.email?.split('@')[0] || 'Operator';

    const supabase = createServerSupabaseClient();

    // 2. High-speed cached profile resolution
    const profileCacheKey = `profile:${profileUid}`;
    let profile = jarvisCache.get<{ id: string; display_name: string; email?: string; clearance_level?: ClearanceLevel }>(profileCacheKey);

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
      if (Array.isArray(body.attachments) && body.attachments.length > 0 && clientMessages.length > 0) {
        const last = clientMessages[clientMessages.length - 1];
        if (!last.attachments) {
          last.attachments = body.attachments;
        }
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

    // Conversation record assurance (non-blocking background execution)
    const convCacheKey = `conv:${conversationId}`;
    if (!jarvisCache.get(convCacheKey)) {
      jarvisCache.set(convCacheKey, true, 3600000);
      Promise.resolve().then(async () => {
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
        } catch (convErr) {
          console.warn('[Chat Stream API] Background conversation record check warning:', convErr);
        }
      }).catch(() => {});
    }

    // 5. Persist user message and upload attachments to Supabase Storage
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

      if (lastUserMsg.attachments && lastUserMsg.attachments.length > 0) {
        for (const att of lastUserMsg.attachments) {
          const payload = att.dataUrl || att.extractedText || '';
          if (payload) {
            Promise.resolve(
              uploadUserFile(
                profileUid,
                att.id || crypto.randomUUID(),
                att.name,
                payload,
                att.mimeType
              )
            )
              .then(({ storagePath }) => {
                att.storagePath = storagePath;
              })
              .catch((upErr) => console.warn('[Chat Stream API] File storage warning:', upErr));
          }
        }
      }
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
    const preferredProvider = settingsObj?.preferred_provider || 'groq';
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

    // 6.6. Resolve functional clearance level (1, 5, or 9)
    const operatorClearance: ClearanceLevel =
      settingsObj?.clearance_level ||
      profile?.clearance_level ||
      9;

    const authorizedTools = getToolsForClearance(operatorClearance);

    // 7. Check for Stark easter eggs before hitting LLM
    const easterEgg = checkEasterEgg(lastUserMsg?.content || '', effectivePersona);
    if (easterEgg.matched && easterEgg.response) {
      const responseText = easterEgg.response;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendSSE = (data: StreamChunk) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          const words = responseText.split(' ');
          for (let i = 0; i < words.length; i++) {
            const token = i === words.length - 1 ? words[i] : words[i] + ' ';
            sendSSE({ token });
            await new Promise((r) => setTimeout(r, 18));
          }

          sendSSE({ done: true, provider_used: 'stark-archive' as any });

          // Persist assistant response to Supabase
          Promise.resolve(
            supabase.from('messages').insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: responseText,
              provider_used: 'stark-archive',
            })
          ).catch((e) => console.warn('[Chat Stream API] Easter egg persistence warning:', e));

          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // 8. Build system prompt with relationship intelligence
    const systemPrompt = buildSystemPrompt(
      profile.display_name,
      profile.email || profileEmail,
      memories,
      priorHistory,
      effectivePersona,
      operatorClearance
    );

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...contextualMessages,
    ];

    // 9. Create SSE stream
    const encoder = new TextEncoder();

    console.log(`[Server:ChatStream] 🎬 Creating SSE stream with preferredProvider=${preferredProvider}, persona=${effectivePersona}, messagesCount=${llmMessages.length}`);

    const stream = new ReadableStream({
      async start(controller) {
        const sendSSE = (data: StreamChunk) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          let accumulatedContent = '';
          let providerUsed = '';
          let chunkCount = 0;
          let toolCallsReceived: StreamChunk['tool_calls'] | undefined;

          for await (const chunk of routeChatStream({
            messages: llmMessages,
            tools: authorizedTools,
            preferredProvider,
          })) {
            chunkCount++;
            // Forward token to client
            if (chunk.token) {
              accumulatedContent += chunk.token;
              sendSSE({ token: chunk.token });
            }

            // Tool calls — handle synchronously
            if (chunk.tool_calls) {
              toolCallsReceived = chunk.tool_calls;
              providerUsed = chunk.provider_used || '';
              console.log(`[Server:ChatStream] 🛠️ Tool calls received (${chunk.tool_calls.length} calls) from provider ${providerUsed}`);

              // Execute tools with clearance context
              const toolResults = await executeToolCalls(chunk.tool_calls, profile.id, {
                googleAccessToken,
                clearanceLevel: operatorClearance,
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

              // Stream synthesis tokens immediately so client begins speaking first sentence right away
              try {
                accumulatedContent = '';
                for await (const synthChunk of routeChatStream({
                  messages: synthMessages,
                  tools: undefined,
                  preferredProvider,
                })) {
                  if (synthChunk.token) {
                    accumulatedContent += synthChunk.token;
                    sendSSE({ token: synthChunk.token });
                  }
                  if (synthChunk.provider_used) {
                    providerUsed = synthChunk.provider_used;
                  }
                  if (synthChunk.done) {
                    break;
                  }
                }
                console.log(`[Server:ChatStream] 🛠️ Tool streaming synthesis completed (${accumulatedContent.length} chars)`);
              } catch (synthErr) {
                console.warn('[Server:ChatStream] Tool streaming synthesis fallback:', synthErr);
                try {
                  const synthResponse = await routeChat({
                    messages: synthMessages,
                    tools: undefined,
                    preferredProvider,
                  });
                  accumulatedContent = synthResponse.content || '';
                  providerUsed = synthResponse.provider_used || providerUsed;
                  sendSSE({ token: accumulatedContent });
                } catch (fallbackErr) {
                  sendSSE({
                    done: true,
                    provider_used: providerUsed as any,
                    error: 'Tool synthesis failed',
                  });
                }
              }

              break; // Tool calls end the stream
            }

            // Stream done signal
            if (chunk.done) {
              providerUsed = chunk.provider_used || providerUsed;
              console.log(`[Server:ChatStream] ✅ Provider ${providerUsed} signaled stream done (chunks: ${chunkCount}, chars: ${accumulatedContent.length})`);
              sendSSE({
                done: true,
                provider_used: chunk.provider_used,
              });
              break;
            }

            // Error signal
            if (chunk.error) {
              console.error(`[Server:ChatStream] ❌ Provider chunk error:`, chunk.error);
              if (!accumulatedContent) {
                const fallbackResponse =
                  effectivePersona === 'friday'
                    ? "Satellite relays are encountering brief interference, boss. All primary tactical buffers remain ready."
                    : "Apologies, sir. Neural uplinks to primary satellite arrays encountered temporary interference. Core systems remain nominal.";
                accumulatedContent = fallbackResponse;
                sendSSE({ token: fallbackResponse });
              }
              sendSSE({ error: chunk.error, done: true, provider_used: (providerUsed || 'reserve-auxiliary') as any });
              break;
            }
          }

          // Fail-safe: If stream produced 0 characters, emit emergency auxiliary response so client is never left empty
          if (!accumulatedContent.trim()) {
            console.warn('[Server:ChatStream] ⚠️ Stream ended with 0 tokens. Emitting auxiliary reserve message.');
            const emergencyMsg =
              effectivePersona === 'friday'
                ? "Tactical comms reconnected, boss. All systems are online and listening."
                : "Auxiliary neural relays online, sir. All core diagnostics nominal and listening.";
            accumulatedContent = emergencyMsg;
            sendSSE({ token: emergencyMsg });
            providerUsed = providerUsed || 'reserve-auxiliary';
          }

          // Finalize: conversation_id and persona metadata
          sendSSE({
            done: true,
            provider_used: (providerUsed || undefined) as any,
          });

          const finalContent = accumulatedContent.trim();
          console.log(`[Server:ChatStream] 🏁 Stream finished in ${Date.now() - reqStart}ms. Final content preview: "${finalContent.slice(0, 60)}..."`);

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

          // Persist uploaded file metadata with AI description for long-term recall
          if (lastUserMsg?.attachments && lastUserMsg.attachments.length > 0) {
            Promise.resolve().then(async () => {
              for (const att of lastUserMsg.attachments || []) {
                const storagePath = att.storagePath || `${profileUid}/${att.id}-${att.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                await insertUploadedFile({
                  profile_id: profile.id,
                  conversation_id: conversationId,
                  storage_path: storagePath,
                  file_type: att.type,
                  original_filename: att.name,
                  mime_type: att.mimeType,
                  file_size_bytes: att.size,
                  ai_description: finalContent,
                });
              }
            }).catch((metaErr) => console.warn('[Chat Stream API] File metadata persistence warning:', metaErr));
          }

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
