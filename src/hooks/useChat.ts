'use client';

// ──────────────────────────────────────────────
// useChat Hook — Chat state management + Real Multi-LLM API
// ──────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ChatMessage, LLMProvider } from '@/types';

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  providerUsed: LLMProvider | null;
  conversationId: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  setInitialGreeting: (content: string) => void;
}

export function useChat(): UseChatReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerUsed, setProviderUsed] = useState<LLMProvider | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;

  const userRef = useRef(user);
  userRef.current = user;

  const sendMessage = useCallback(
    async (content: string) => {
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
            messages: updatedMessages,
            conversation_id: conversationIdRef.current,
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
        setConversationId(data.conversation_id);
      } catch (err) {
        console.error('Chat error:', err);
        const errorMsg = err instanceof Error ? err.message : 'Error processing request';
        setError(errorMsg);

        // Add assistant error message to chat
        const errorAssistantMsg: ChatMessage = {
          role: 'assistant',
          content: `Apologies, sir. An error occurred in the neural link: ${errorMsg}`,
        };
        setMessages((prev) => [...prev, errorAssistantMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setProviderUsed(null);
    setError(null);
  }, []);

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
    error,
    providerUsed,
    conversationId,
    sendMessage,
    clearChat,
    setInitialGreeting,
  };
}
