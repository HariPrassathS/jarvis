'use client';

// ──────────────────────────────────────────────
// useChat Hook — Chat State Management + Session Continuity
// Preserves conversation history across reloads and logins
// ──────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ChatMessage, LLMProvider, VoicePersona } from '@/types';

const STORAGE_CONV_KEY = 'jarvis_active_conversation_id';

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isHistoryLoading: boolean;
  error: string | null;
  providerUsed: LLMProvider | null;
  conversationId: string | null;
  sendMessage: (content: string, persona?: VoicePersona) => Promise<void>;
  clearChat: () => void;
  setInitialGreeting: (content: string) => void;
}

export function useChat(): UseChatReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerUsed, setProviderUsed] = useState<LLMProvider | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;

  const userRef = useRef(user);
  userRef.current = user;

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

  // ── Send user message with full multi-turn conversational context ──
  const sendMessage = useCallback(async (content: string, persona?: VoicePersona) => {
    const currentUser = userRef.current;
    if (!currentUser || !content.trim()) return;

    const userMessage: ChatMessage = { role: 'user', content: content.trim() };
    const currentMessages = messagesRef.current;
    const updatedMessages = [...currentMessages, userMessage];

    setMessages(updatedMessages);
    setIsLoading(true);
    setError(null);

    try {
      const idToken = await currentUser.getIdToken();

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          messages: updatedMessages.slice(-20), // Slice to last 20 messages for prompt efficiency
          conversation_id: conversationIdRef.current,
          voice_persona: persona,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Chat request failed (${res.statusText})`);
      }

      const data = await res.json();

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
    } catch (err) {
      console.error('[useChat] Chat error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Error processing request';
      setError(errorMsg);

      const errorAssistantMsg: ChatMessage = {
        role: 'assistant',
        content: `Apologies, sir. An anomaly occurred in the neural connection: ${errorMsg}`,
      };
      setMessages((prev) => [...prev, errorAssistantMsg]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Reset session and clear storage for "+ NEW CHAT" ──
  const clearChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setProviderUsed(null);
    setError(null);
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
    isHistoryLoading,
    error,
    providerUsed,
    conversationId,
    sendMessage,
    clearChat,
    setInitialGreeting,
  };
}
