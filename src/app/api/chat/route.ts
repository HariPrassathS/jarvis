// ──────────────────────────────────────────────
// Chat API Route — LLM Router + Tool Calling + Supabase Persistence
// ──────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30 seconds max duration on Vercel

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { routeChat } from '@/lib/llm/router';
import { buildSystemPrompt } from '@/lib/llm/system-prompt';
import { toolDefinitions, getToolsForClearance } from '@/lib/tools/definitions';
import { executeToolCalls } from '@/lib/tools/executor';
import { recallMemories } from '@/lib/tools/memory';
import { extractAndStoreMemories } from '@/lib/llm/memory-extractor';
import { jarvisCache } from '@/lib/llm/cache';
import { operatorRateLimiter } from '@/lib/ratelimit/token-bucket';
import { queryCache } from '@/lib/cache/query-cache';
import { checkEasterEgg } from '@/lib/llm/easter-eggs';
import type { ChatMessage, VoicePersona, ClearanceLevel } from '@/types';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate via verified Firebase ID Token (Zero Demo bypass)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing authentication token' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
    } catch (authErr) {
      console.error('[Chat API] Token verification rejected:', authErr);
      return NextResponse.json({ error: 'Unauthorized: Invalid authentication session' }, { status: 401 });
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
        console.warn('[Chat API] Supabase profile sync fallback:', dbErr);
        profile = { id: profileUid, display_name: profileName, email: profileEmail };
      }

      if (profile) {
        jarvisCache.set(profileCacheKey, profile, 600000); // 10 min TTL
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
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }


    // 4. Resolve conversation ID (generate client-safe standard UUID v4)
    if (!conversationId) {
      conversationId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000';
    }

    // Retain up to the last 20 messages for rich conversational context while respecting token budget
    const contextualMessages = clientMessages.slice(-20);
    const lastUserMsg = contextualMessages[contextualMessages.length - 1];
    const priorHistory = contextualMessages.slice(0, -1);

    // Fast cached conversation record assurance
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
        jarvisCache.set(convCacheKey, true, 3600000); // 1 hour TTL
      } catch (convErr) {
        console.warn('[Chat API] Conversation record check warning:', convErr);
      }
    }

    // 5. Asynchronously persist user message (non-blocking for ultra-fast LLM invocation)
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

    // 6. Fast parallel resolution of memories and preferred provider / persona
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

    // 6.5. Per-Operator Rate Limiter (Token Bucket: max 1 request / 3.5s with burst of 2)
    const rateLimit = operatorRateLimiter.check(profileUid, effectivePersona);
    if (!rateLimit.allowed) {
      console.warn(`[Chat API] Operator ${profileUid} throttled. Wait: ${rateLimit.waitSeconds}s`);
      return NextResponse.json({
        message: rateLimit.message,
        provider_used: 'throttle-guard',
        throttled: true,
        wait_seconds: rateLimit.waitSeconds,
        conversation_id: conversationId,
        voice_persona: effectivePersona,
      });
    }

    // 6.6. Zero-Cost Query Response Cache (check repeat / stateless questions)
    if (lastUserMsg?.content && priorHistory.length === 0) {
      const cachedAnswer = queryCache.get(lastUserMsg.content, effectivePersona);
      if (cachedAnswer) {
        console.log(`[Chat API] Query cache HIT for: "${lastUserMsg.content.slice(0, 30)}..."`);
        return NextResponse.json(
          {
            message: cachedAnswer,
            reply: cachedAnswer,
            provider_used: 'cache-hit',
            conversation_id: conversationId,
            voice_persona: effectivePersona,
          },
          { headers: { 'X-Cache': 'HIT' } }
        );
      }
    }

    // 6.7. Check for Stark easter eggs
    const easterEgg = checkEasterEgg(lastUserMsg?.content || '', effectivePersona);
    if (easterEgg.matched && easterEgg.response) {
      const responseText = easterEgg.response;
      Promise.resolve(
        supabase.from('messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: responseText,
          provider_used: 'stark-archive',
        })
      ).catch((e) => console.warn('[Chat API] Easter egg persistence warning:', e));

      return NextResponse.json({
        message: responseText,
        reply: responseText,
        provider_used: 'stark-archive',
        conversation_id: conversationId,
        voice_persona: effectivePersona,
      });
    }

    // 6.8. Resolve functional clearance level (1, 5, or 9)
    const operatorClearance: ClearanceLevel =
      settingsObj?.clearance_level ||
      profile?.clearance_level ||
      9;

    const authorizedTools = getToolsForClearance(operatorClearance);

    // 7. Prepare messages for LLM (Unconditional Long-Term Facts + Recent Dialogue History + Persona Tone + Clearance)
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

    // 8. Call LLM Router (Priority: Groq / Gemini / OpenRouter / Cloudflare)
    let response;
    try {
      response = await routeChat({
        messages: llmMessages,
        tools: authorizedTools,
        preferredProvider,
      });
    } catch (llmErr) {
      console.error('[Chat API] LLM Router error:', llmErr);
      
      // In-character auxiliary reserve power response during capacity saturation
      const reserveMessage =
        effectivePersona === 'friday'
          ? "We're on emergency battery, boss. Comms bandwidth is tapped out across all satellite relays. Give me a brief moment to cycle the power grid."
          : "Operating on auxiliary reserve power, sir. Neural uplinks to primary satellite arrays are temporarily saturated. Core systems remain nominal; please stand by.";

      return NextResponse.json({
        message: reserveMessage,
        provider_used: 'reserve-auxiliary',
        conversation_id: conversationId,
        voice_persona: effectivePersona,
        degraded_mode: true,
      });
    }

    // 9. Single-Pass Tool Execution (No infinite search loops)
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolResults = await executeToolCalls(response.tool_calls, profile.id, {
        googleAccessToken,
        clearanceLevel: operatorClearance,
      });


      llmMessages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      });

      for (const result of toolResults) {
        llmMessages.push({
          role: 'tool',
          name: result.name,
          content: result.content,
          tool_call_id: result.tool_call_id,
        });
      }

      // Re-invoke LLM with tools: undefined so it immediately synthesizes final response
      try {
        response = await routeChat({
          messages: llmMessages,
          tools: undefined, // Crucial: disables tool re-invocations to guarantee instantaneous response
          preferredProvider,
        });
      } catch (toolSynthesisErr) {
        console.warn('[Chat API] Tool synthesis fallback:', toolSynthesisErr);
      }
    }

    const finalContent =
      response.content?.trim() || 'At your service, sir. All systems are operational.';

    // Store in query response cache if eligible
    if (lastUserMsg?.content && finalContent && priorHistory.length === 0) {
      queryCache.set(lastUserMsg.content, effectivePersona, finalContent);
    }

    // 10. Asynchronously persist assistant response in background
    Promise.resolve(
      supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: finalContent,
          provider_used: response.provider_used,
        })
    ).catch(() => {});

    // 11. Background durable memory extraction (fire-and-forget, zero latency overhead on client)
    if (lastUserMsg?.content && finalContent) {
      Promise.resolve()
        .then(() => extractAndStoreMemories(profile.id, lastUserMsg.content, finalContent))
        .catch((err) => console.warn('[Chat API] Background memory extraction warning:', err));
    }

    // Return response to user immediately
    return NextResponse.json({
      message: finalContent,
      reply: finalContent,
      provider_used: response.provider_used,
      conversation_id: conversationId,
      voice_persona: effectivePersona,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Failed to process chat request';
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
