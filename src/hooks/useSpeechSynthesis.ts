'use client';

// ──────────────────────────────────────────────
// useSpeechSynthesis — Web Speech Synthesis wrapper
// ──────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseSpeechSynthesisReturn {
  speak: (text: string) => void;
  stop: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
}

/**
 * Clean text for natural speech synthesis.
 * Strips all markdown formatting (bold **, italics *, backticks, headers, links),
 * asterisks, emojis, and symbols so TTS does not say "asterisk asterisk".
 */
export function cleanTextForSpeech(raw: string): string {
  if (!raw) return '';

  return (
    raw
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, ' ')
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove markdown bold/italics: **text**, *text*, __text__, _text_
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove any remaining stray asterisks
      .replace(/\*/g, '')
      // Remove markdown links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove markdown headers: # Header
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bullet points like "- ", "+ ", "* "
      .replace(/^[\s]*[-+*]\s+/gm, '')
      // Remove divider lines --- or ===
      .replace(/^[-=_]{3,}$/gm, '')
      // Convert common symbols to spoken words for natural cadence
      .replace(/°C/g, ' degrees Celsius')
      .replace(/°F/g, ' degrees Fahrenheit')
      .replace(/%/g, ' percent')
      .replace(/\bkm\/h\b/gi, ' kilometers per hour')
      .replace(/\bm\/s\b/gi, ' meters per second')
      .replace(/\bGJ\/s\b/gi, ' gigajoules per second')
      .replace(/\bMJ\b/gi, ' megajoules')
      // Remove emojis and decorative unicode symbols
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}✦⚡📊🛡️✓✕]/gu, '')
      // Clean up multiple spaces and excessive newlines
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const isSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      try {
        const availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices && availableVoices.length > 0) {
          voicesRef.current = availableVoices;
        }
      } catch (e) {
        console.warn('Could not load speech voices:', e);
      }
    };

    loadVoices();
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  const selectVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (voicesRef.current.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      voicesRef.current = window.speechSynthesis.getVoices();
    }
    const currentVoices = voicesRef.current;
    if (currentVoices.length === 0) return null;

    // Prefer UK Male / natural voice for classic JARVIS persona
    const preferred = currentVoices.find(
      (v) =>
        v.name.includes('Google UK English Male') ||
        v.name.includes('Daniel') ||
        v.name.includes('James') ||
        v.name.includes('Natural') ||
        v.name.includes('George')
    );
    if (preferred) return preferred;

    const english = currentVoices.find(
      (v) => v.lang.startsWith('en') && !v.name.includes('Zira')
    );
    if (english) return english;

    return currentVoices[0];
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text.trim()) return;

      const cleaned = cleanTextForSpeech(text);
      if (!cleaned) return;

      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(cleaned);
        const voice = selectVoice();
        if (voice) utterance.voice = voice;

        utterance.rate = 1.05;
        utterance.pitch = 0.95;
        utterance.volume = 1.0;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('Speech synthesis playback error:', e);
        setIsSpeaking(false);
      }
    },
    [isSupported, selectVoice]
  );

  const stop = useCallback(() => {
    if (!isSupported) return;
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.warn('Speech cancel error:', e);
    }
    setIsSpeaking(false);
  }, [isSupported]);

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
  };
}
