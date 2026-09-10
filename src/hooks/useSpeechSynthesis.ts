'use client';

// ──────────────────────────────────────────────
// useSpeechSynthesis — Dual Persona Web Speech Synthesis
// Supports JARVIS (male British butler) & FRIDAY (female tactical Irish/warm)
// ──────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoicePersona } from '@/types';

interface UseSpeechSynthesisReturn {
  speak: (text: string, overridePersona?: VoicePersona) => void;
  stop: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
  activeVoiceName: string | null;
}

// Ranked priority candidates for JARVIS (male British butler persona)
const JARVIS_VOICE_CANDIDATES = [
  'Google UK English Male',
  'Daniel',             // macOS UK male
  'Arthur',             // macOS UK male
  'Oliver',             // macOS UK male
  'Microsoft Ryan',     // Windows Natural UK male
  'Microsoft George',   // Windows UK male
  'Microsoft Guy',      // Windows US male
  'en-GB-Neural2-B',    // Chrome Android
  'en-GB-Wavenet-B',
  'en-GB-Standard-B',
  'James',              // macOS Australian male
  'Google US English',  // fallback
];

// Ranked priority candidates for FRIDAY (female tactical Irish/warm persona)
const FRIDAY_VOICE_CANDIDATES = [
  'Moira',              // macOS Irish female (canonical MCU persona)
  'Google UK English Female',
  'Microsoft Aria',     // Windows Natural US female
  'Microsoft Sonia',    // Windows Natural UK female
  'Microsoft Jenny',    // Windows Natural US female
  'Microsoft Libby',    // Windows UK female
  'Samantha',           // macOS / iOS US female
  'Karen',              // macOS / iOS Australian female
  'Victoria',           // macOS US female
  'Fiona',              // macOS Scottish female
  'en-IE',              // Any Irish English voice
  'Google Irish',
  'Google English Female',
];

/**
 * Clean text for natural speech synthesis.
 * Strips markdown, asterisks, symbols, emojis, and hashtags so TTS doesn't speak "asterisk".
 */
export function cleanTextForSpeech(raw: string): string {
  if (!raw) return '';

  return (
    raw
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, ' ')
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove markdown bold/italics
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove remaining stray asterisks
      .replace(/\*/g, '')
      // Remove markdown links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bullet points
      .replace(/^[\s]*[-+*]\s+/gm, '')
      // Remove divider lines
      .replace(/^[-=_]{3,}$/gm, '')
      // Spoken units
      .replace(/°C/g, ' degrees Celsius')
      .replace(/°F/g, ' degrees Fahrenheit')
      .replace(/%/g, ' percent')
      .replace(/\bkm\/h\b/gi, ' kilometers per hour')
      .replace(/\bm\/s\b/gi, ' meters per second')
      .replace(/\bGJ\/s\b/gi, ' gigajoules per second')
      .replace(/\bMJ\b/gi, ' megajoules')
      // Remove emojis & decorative symbols
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}✦⚡📊🛡️✓✕]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function useSpeechSynthesis(persona: VoicePersona = 'jarvis'): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeVoiceName, setActiveVoiceName] = useState<string | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const personaRef = useRef<VoicePersona>(persona);
  personaRef.current = persona;

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // ── Load available browser voices & listen to voiceschanged event ──
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      try {
        const availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices && availableVoices.length > 0) {
          voicesRef.current = availableVoices;
        }
      } catch (e) {
        console.warn('[TTS] Could not load speech voices:', e);
      }
    };

    loadVoices();

    // Chrome/Safari often load voices asynchronously; voiceschanged is essential
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  // ── Select ranked voice according to active persona ──
  const selectVoice = useCallback((targetPersona: VoicePersona): SpeechSynthesisVoice | null => {
    if (voicesRef.current.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      voicesRef.current = window.speechSynthesis.getVoices();
    }
    const currentVoices = voicesRef.current;
    if (currentVoices.length === 0) return null;

    const candidates = targetPersona === 'friday' ? FRIDAY_VOICE_CANDIDATES : JARVIS_VOICE_CANDIDATES;

    // 1. Exact or substring match in candidate priority order
    for (const candidate of candidates) {
      const match = currentVoices.find((v) =>
        v.name.toLowerCase().includes(candidate.toLowerCase())
      );
      if (match) return match;
    }

    // 2. Heuristic gender and locale matching
    if (targetPersona === 'friday') {
      // Find English voices with female descriptors
      const femaleEnglish = currentVoices.find(
        (v) =>
          v.lang.startsWith('en') &&
          /female|woman|girl|zira|aria|jenny|sonia|moira|samantha|karen|fiona|victoria|libby/i.test(v.name)
      );
      if (femaleEnglish) return femaleEnglish;

      // Irish English fallback
      const irishVoice = currentVoices.find((v) => v.lang.toLowerCase().includes('en-ie'));
      if (irishVoice) return irishVoice;

      // Any English voice not labeled male
      const nonMaleEnglish = currentVoices.find(
        (v) => v.lang.startsWith('en') && !/male|guy|david|george|brian|ryan|paul/i.test(v.name)
      );
      if (nonMaleEnglish) return nonMaleEnglish;
    } else {
      // JARVIS: Find English voices with male descriptors or British locale
      const maleBritish = currentVoices.find(
        (v) =>
          (v.lang.toLowerCase().includes('en-gb') || v.lang.toLowerCase().includes('en_uk')) &&
          !/female|woman|zira|aria|hazel/i.test(v.name)
      );
      if (maleBritish) return maleBritish;

      const maleEnglish = currentVoices.find(
        (v) =>
          v.lang.startsWith('en') &&
          /male|guy|david|george|brian|ryan|paul|daniel|arthur|oliver/i.test(v.name)
      );
      if (maleEnglish) return maleEnglish;

      const nonFemaleEnglish = currentVoices.find(
        (v) => v.lang.startsWith('en') && !/female|woman|zira|aria|jenny|samantha/i.test(v.name)
      );
      if (nonFemaleEnglish) return nonFemaleEnglish;
    }

    // 3. Fallback to default or first available voice
    const defaultVoice = currentVoices.find((v) => v.default) || currentVoices[0];
    return defaultVoice || null;
  }, []);

  // ── Synthesize speech with persona-tuned acoustic delivery ──
  const speak = useCallback(
    (text: string, overridePersona?: VoicePersona) => {
      if (!isSupported || !text.trim()) return;

      const cleaned = cleanTextForSpeech(text);
      if (!cleaned) return;

      const effectivePersona = overridePersona || personaRef.current;

      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(cleaned);
        const voice = selectVoice(effectivePersona);

        if (voice) {
          utterance.voice = voice;
          setActiveVoiceName(voice.name);
        }

        // Persona acoustic profile tuning
        if (effectivePersona === 'friday') {
          // FRIDAY: slightly higher pitch, warm and bright energy, marginally faster
          utterance.pitch = 1.08;
          utterance.rate = 1.03;
        } else {
          // JARVIS: measured, calm, butler-like precision, slightly deeper pitch
          utterance.pitch = 0.95;
          utterance.rate = 0.98;
        }

        utterance.volume = 1.0;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = (e) => {
          console.warn('[TTS] Synthesis error:', e);
          setIsSpeaking(false);
        };

        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('[TTS] Speech playback error:', e);
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
      console.warn('[TTS] Speech cancel error:', e);
    }
    setIsSpeaking(false);
  }, [isSupported]);

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
    activeVoiceName,
  };
}
