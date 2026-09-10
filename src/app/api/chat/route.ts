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
import { toolDefinitions } from '@/lib/tools/definitions';
import { executeToolCalls } from '@/lib/tools/executor';
import { recallMemories } from '@/lib/tools/memory';
import { extractAndStoreMemories } from '@/lib/llm/memory-extractor';
import { jarvisCache } from '@/lib/llm/cache';
import type { ChatMessage } from '@/types';

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
    try {
      const body = await req.json();
      clientMessages = body.messages || [];
      conversationId = body.conversation_id || '';
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

    // 6. Fast parallel resolution of memories and preferred provider
    const settingsCacheKey = `settings:${profile.id}`;
    const cachedProvider = jarvisCache.get<any>(settingsCacheKey);

    const getSettingsAsync = async () => {
      if (cachedProvider) return { data: { preferred_provider: cachedProvider } };
      try {
        const res = await supabase
          .from('settings')
          .select('preferred_provider')
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

    const preferredProvider = cachedProvider || settingsData?.data?.preferred_provider;
    if (!cachedProvider && preferredProvider) {
      jarvisCache.set(settingsCacheKey, preferredProvider, 600000);
    }

    // 7. Prepare messages for LLM (Unconditional Long-Term Facts + Recent Dialogue History)
    const systemPrompt = buildSystemPrompt(
      profile.display_name,
      profile.email || profileEmail,
      memories,
      priorHistory
    );

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...contextualMessages,
    ];

    // 8. Call LLM Router (Priority: Groq / Gemini)
    let response;
    try {
      response = await routeChat({
        messages: llmMessages,
        tools: toolDefinitions,
        preferredProvider,
      });
    } catch (llmErr) {
      console.error('[Chat API] LLM Router error:', llmErr);
      
      // If API keys are missing on Vercel, return a helpful vocal HUD response rather than crashing the client with HTTP 500
      return NextResponse.json({
        message:
          'I apologize, sir. My core neural processing units are currently unconfigured. Please ensure your LLM provider API keys (GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY) are added to your Vercel Project Settings under Environment Variables.',
        provider_used: 'system-diagnostic',
        conversation_id: conversationId,
      });
    }

    // 9. Single-Pass Tool Execution (No infinite search loops)
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolResults = await executeToolCalls(response.tool_calls, profile.id);

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
      provider_used: response.provider_used,
      conversation_id: conversationId,
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
