'use client';

// ──────────────────────────────────────────────
// useChat Hook — Chat State Management + Session Continuity
// Now with SSE Streaming for progressive token delivery
// ──────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ChatMessage, LLMProvider, VoicePersona, StreamChunk } from '@/types';

const STORAGE_CONV_KEY = 'jarvis_active_conversation_id';

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  isHistoryLoading: boolean;
  error: string | null;
  providerUsed: LLMProvider | null;
  conversationId: string | null;
  sendMessage: (content: string, persona?: VoicePersona, attachments?: import('@/types').ChatAttachment[]) => Promise<void>;
  clearChat: () => void;
  setInitialGreeting: (content: string) => void;
}

export function useChat(): UseChatReturn {
  const { user, googleAccessToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerUsed, setProviderUsed] = useState<LLMProvider | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const googleTokenRef = useRef(googleAccessToken);
  googleTokenRef.current = googleAccessToken;

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;

  const userRef = useRef(user);
  userRef.current = user;

  // Abort controller for cancelling in-flight streams
  const abortRef = useRef<AbortController | null>(null);


  // ── Rehydrate conversation history on login / page refresh ──
  useEffect(() => {
    let isCancelled = false;

    if (!user) {
      setMessages([]);
      setConversationId(null);
      setIsHistoryLoading(false);
      return;
    }

    const restoreSession = async () => {
      setIsHistoryLoading(true);
      try {
        const idToken = await user.getIdToken();
        const storedConvId =
          typeof window !== 'undefined'
            ? localStorage.getItem(STORAGE_CONV_KEY)
            : null;

        const url = storedConvId
          ? `/api/chat/history?conversation_id=${encodeURIComponent(storedConvId)}`
          : '/api/chat/history';

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load history (${res.statusText})`);
        }

        const data = await res.json();
        if (isCancelled) return;

        if (data.conversation_id) {
          setConversationId(data.conversation_id);
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_CONV_KEY, data.conversation_id);
          }
        }

        if (data.messages && data.messages.length > 0) {
          const formatted: ChatMessage[] = data.messages.map((m: any) => ({
            role: m.role,
            content: m.content,
          }));
          setMessages(formatted);
          if (data.messages[data.messages.length - 1]?.provider_used) {
            setProviderUsed(data.messages[data.messages.length - 1].provider_used);
          }
        }
      } catch (historyErr) {
        console.warn('[useChat] Could not restore previous session:', historyErr);
      } finally {
        if (!isCancelled) {
          setIsHistoryLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  // ── Send user message with SSE streaming ──
  const sendMessage = useCallback(async (content: string, persona?: VoicePersona, attachments?: import('@/types').ChatAttachment[]) => {
    const currentUser = userRef.current;
    const hasAttachments = Boolean(attachments && attachments.length > 0);
    const trimmed = content.trim();
    if (!currentUser || (!trimmed && !hasAttachments)) return;

    // Cancel any in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const abortController = new AbortController();
    abortRef.current = abortController;

    // Default message text if attachments are provided without explicit prompt
    const defaultContent = trimmed || (attachments?.some((a) => a.type === 'image')
      ? 'Please analyze this visual telemetry, sir.'
      : 'Please examine and summarize this document, sir.');

    const userMessage: ChatMessage = {
      role: 'user',
      content: defaultContent,
      attachments: hasAttachments ? attachments : undefined,
    };
    const currentMessages = messagesRef.current;
    const updatedMessages = [...currentMessages, userMessage];

    setMessages(updatedMessages);
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);

    try {
      const idToken = await currentUser.getIdToken();
      const currentGoogleToken = googleTokenRef.current;

      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      };
      if (currentGoogleToken) {
        requestHeaders['x-google-access-token'] = currentGoogleToken;
      }

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          messages: updatedMessages.slice(-20),
          conversation_id: conversationIdRef.current,
          voice_persona: persona,
        }),
        signal: abortController.signal,
      });

      // If streaming endpoint returns non-200 or non-SSE, fall back to blocking
      if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
        // Fall back to blocking /api/chat endpoint
        const fallbackRes = await fetch('/api/chat', {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify({
            messages: updatedMessages.slice(-20),
            conversation_id: conversationIdRef.current,
            voice_persona: persona,
          }),
          signal: abortController.signal,
        });


        if (!fallbackRes.ok) {
          const errData = await fallbackRes.json().catch(() => ({}));
          throw new Error(errData.error || `Chat request failed (${fallbackRes.statusText})`);
        }

        const data = await fallbackRes.json();

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.message,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setProviderUsed(data.provider_used);

        if (data.conversation_id) {
          setConversationId(data.conversation_id);
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_CONV_KEY, data.conversation_id);
          }
        }
        return;
      }

      // Extract conversation metadata from response headers
      const convId = res.headers.get('X-Conversation-Id');
      if (convId) {
        setConversationId(convId);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_CONV_KEY, convId);
        }
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream available');

      const decoder = new TextDecoder();
      let streamedContent = '';
      let assistantMsgIndex = -1;
      let streamDone = false;

      // Add placeholder assistant message
      setMessages((prev) => {
        assistantMsgIndex = prev.length;
        return [...prev, { role: 'assistant', content: '' }];
      });

      setIsStreaming(true);

      let buffer = '';

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          // Token — append to streaming content
          if (chunk.token) {
            streamedContent += chunk.token;
            // Update the assistant message in-place
            setMessages((prev) => {
              const updated = [...prev];
              const idx = updated.length - 1;
              if (idx >= 0 && updated[idx].role === 'assistant') {
                updated[idx] = { ...updated[idx], content: streamedContent };
              }
              return updated;
            });
          }

          // Provider info
          if (chunk.provider_used) {
            setProviderUsed(chunk.provider_used);
          }

          // Error
          if (chunk.error) {
            setError(chunk.error);
          }

          // Done
          if (chunk.done) {
            streamDone = true;
            break;
          }
        }
      }

      // Finalize: ensure the last message has the full content
      if (streamedContent) {
        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.length - 1;
          if (idx >= 0 && updated[idx].role === 'assistant') {
            updated[idx] = { ...updated[idx], content: streamedContent };
          }
          return updated;
        });
      }

    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled — don't treat as error
        return;
      }
      console.error('[useChat] Chat error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Error processing request';
      setError(errorMsg);

      const errorAssistantMsg: ChatMessage = {
        role: 'assistant',
        content: `Apologies, sir. An anomaly occurred in the neural connection: ${errorMsg}`,
      };
      setMessages((prev) => {
        // Replace the empty streaming placeholder if it exists
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          return [...prev.slice(0, -1), errorAssistantMsg];
        }
        return [...prev, errorAssistantMsg];
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  // ── Reset session and clear storage for "+ NEW CHAT" ──
  const clearChat = useCallback(() => {
    // Cancel any in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([]);
    setConversationId(null);
    setProviderUsed(null);
    setError(null);
    setIsStreaming(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_CONV_KEY);
    }
  }, []);

  // ── Initial greeting for newly initiated sessions ──
  const setInitialGreeting = useCallback((content: string) => {
    if (messagesRef.current.length === 0) {
      const greetingMsg: ChatMessage = {
        role: 'assistant',
        content,
      };
      setMessages([greetingMsg]);
    }
  }, []);

  return {
    messages,
    isLoading,
    isStreaming,
    isHistoryLoading,
    error,
    providerUsed,
    conversationId,
    sendMessage,
    clearChat,
    setInitialGreeting,
  };
}
