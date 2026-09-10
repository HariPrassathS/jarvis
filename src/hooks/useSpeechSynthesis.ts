'use client';

// ──────────────────────────────────────────────
// useSpeechSynthesis — Dual Persona Web Speech Synthesis
// Supports JARVIS (male British butler) & FRIDAY (female tactical Irish/warm)
// ──────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoicePersona } from '@/types';
import { diagnosticLogger } from '@/lib/debug/diagnostic-logger';

interface UseSpeechSynthesisReturn {
  speak: (text: string, overridePersona?: VoicePersona) => void;
  stop: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
  activeVoiceName: string | null;
}

// Regex matching known female voice names to prevent JARVIS from accidentally picking them on iOS/Android
export const FEMALE_VOICE_REGEX =
  /female|woman|girl|zira|aria|jenny|sonia|moira|samantha|karen|fiona|victoria|libby|stephanie|serena|martha|tessa|susan|zoe|ava|hazel|en-gb-x-fis/i;

// Ranked priority candidates for JARVIS (male British butler persona)
const JARVIS_VOICE_CANDIDATES = [
  'Google UK English Male',
  'Daniel',             // macOS / iOS UK male
  'Oliver',             // macOS / iOS UK male
  'Arthur',             // macOS / iOS UK male
  'Aaron',              // iOS US male
  'Fred',               // macOS / iOS male
  'Gordon',             // macOS / iOS Australian male
  'Rishi',              // macOS / iOS Indian English male
  'Nicky',              // iOS male
  'en-gb-x-rjs-local',  // Android Google TTS UK Male
  'en-gb-x-rjs-network',
  'en-us-x-sfg-local',  // Android Google TTS US Male
  'en-us-x-sfg-network',
  'en-us-x-iog-network',
  'en-us-x-tpd-network',
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
  'Moira',              // macOS / iOS Irish female (canonical MCU persona)
  'Google UK English Female',
  'Microsoft Aria',     // Windows Natural US female
  'Microsoft Sonia',    // Windows Natural UK female
  'Microsoft Jenny',    // Windows Natural US female
  'Microsoft Libby',    // Windows UK female
  'Samantha',           // macOS / iOS US female
  'Karen',              // macOS / iOS Australian female
  'Victoria',           // macOS US female
  'Fiona',              // macOS Scottish female
  'Tessa',              // iOS South African female
  'Zoe',                // iOS / macOS female
  'Ava',                // iOS female
  'en-ie-x-tfn-local',  // Android Google TTS Irish female
  'en-gb-x-fis-local',  // Android Google TTS UK female
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
  const settleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // ── Load available browser voices & listen to voiceschanged event ──
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      try {
        const availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices && availableVoices.length > 0) {
          voicesRef.current = availableVoices;
          diagnosticLogger.log('tts', `Loaded ${availableVoices.length} browser voices`, {
            count: availableVoices.length,
          });
        }
      } catch (e) {
        console.warn('[TTS] Could not load speech voices:', e);
      }
    };

    loadVoices();

    // Multiple poll attempts for mobile browsers where onvoiceschanged is delayed
    const t1 = setTimeout(loadVoices, 50);
    const t2 = setTimeout(loadVoices, 200);
    const t3 = setTimeout(loadVoices, 600);
    const t4 = setTimeout(loadVoices, 1500);

    // Chrome/Safari often load voices asynchronously; voiceschanged is essential
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
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
      if (match) {
        diagnosticLogger.log('tts', `Voice matched candidate "${candidate}": ${match.name}`);
        return match;
      }
    }

    // 2. Heuristic gender and locale matching
    if (targetPersona === 'friday') {
      // Find English voices with female descriptors
      const femaleEnglish = currentVoices.find(
        (v) => v.lang.startsWith('en') && FEMALE_VOICE_REGEX.test(v.name)
      );
      if (femaleEnglish) {
        diagnosticLogger.log('tts', `Voice matched FRIDAY female regex: ${femaleEnglish.name}`);
        return femaleEnglish;
      }

      // Irish English fallback
      const irishVoice = currentVoices.find((v) => v.lang.toLowerCase().includes('en-ie'));
      if (irishVoice) {
        diagnosticLogger.log('tts', `Voice matched FRIDAY Irish fallback: ${irishVoice.name}`);
        return irishVoice;
      }

      // Any English voice not labeled male
      const nonMaleEnglish = currentVoices.find(
        (v) =>
          v.lang.startsWith('en') &&
          !/male|guy|david|george|brian|ryan|paul|daniel|arthur|oliver|aaron|fred/i.test(v.name)
      );
      if (nonMaleEnglish) {
        diagnosticLogger.log('tts', `Voice matched FRIDAY non-male: ${nonMaleEnglish.name}`);
        return nonMaleEnglish;
      }
    } else {
      // JARVIS: Find English voices with British locale or male descriptors, strictly rejecting known female names
      const maleBritish = currentVoices.find(
        (v) =>
          (v.lang.toLowerCase().includes('en-gb') || v.lang.toLowerCase().includes('en_uk')) &&
          !FEMALE_VOICE_REGEX.test(v.name)
      );
      if (maleBritish) {
        diagnosticLogger.log('tts', `Voice matched JARVIS British male: ${maleBritish.name}`);
        return maleBritish;
      }

      const maleEnglish = currentVoices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (/male|guy|david|george|brian|ryan|paul|daniel|arthur|oliver|aaron|fred|gordon|rishi/i.test(v.name) ||
            /rjs|sfg|iog|tpd/i.test(v.name)) &&
          !FEMALE_VOICE_REGEX.test(v.name)
      );
      if (maleEnglish) {
        diagnosticLogger.log('tts', `Voice matched JARVIS English male: ${maleEnglish.name}`);
        return maleEnglish;
      }

      const nonFemaleEnglish = currentVoices.find(
        (v) => v.lang.startsWith('en') && !FEMALE_VOICE_REGEX.test(v.name)
      );
      if (nonFemaleEnglish) {
        diagnosticLogger.log('tts', `Voice matched JARVIS non-female: ${nonFemaleEnglish.name}`);
        return nonFemaleEnglish;
      }
    }

    // 3. Fallback to default or first available voice
    const defaultVoice = currentVoices.find((v) => v.default) || currentVoices[0];
    diagnosticLogger.log('tts', `Voice fallback: ${defaultVoice?.name || 'none'}`);
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
          // FRIDAY: bright, clear, crisp feminine cadence, slightly faster
          utterance.pitch = 1.12;
          utterance.rate = 1.03;
        } else {
          // JARVIS: deep, calm, butler-like baritone precision (0.85 pitch ensures male acoustic anchor even on default mobile voices)
          utterance.pitch = 0.85;
          utterance.rate = 0.96;
        }

        utterance.volume = 1.0;

        diagnosticLogger.log('tts', `Speaking as ${effectivePersona.toUpperCase()}`, {
          voiceName: voice?.name || 'Default',
          pitch: utterance.pitch,
          rate: utterance.rate,
          text: cleaned.length > 40 ? `${cleaned.slice(0, 40)}...` : cleaned,
        });

        if (settleTimerRef.current) {
          clearTimeout(settleTimerRef.current);
          settleTimerRef.current = null;
        }

        // Belt-and-suspenders: Synchronously assert isSpeaking BEFORE speak() is queued
        setIsSpeaking(true);

        utterance.onstart = () => {
          setIsSpeaking(true);
          diagnosticLogger.log('tts', 'Speech synthesis started');
        };

        utterance.onend = () => {
          // Acoustic settling buffer: keep isSpeaking = true for 200ms after audio playback concludes
          // to prevent mobile microphone from catching physical room reverb or speaker decay
          if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
          settleTimerRef.current = setTimeout(() => {
            setIsSpeaking(false);
            diagnosticLogger.log('tts', 'Speech synthesis finished (post-settle)');
          }, 200);
        };

        utterance.onerror = (e) => {
          console.warn('[TTS] Synthesis error:', e);
          diagnosticLogger.log('tts', `Synthesis error: ${e.error || e}`);
          if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
          setIsSpeaking(false);
        };

        window.speechSynthesis.speak(utterance);
      } catch (e: any) {
        console.warn('[TTS] Speech playback error:', e);
        diagnosticLogger.log('tts', `Playback exception: ${e?.message || e}`);
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
        setIsSpeaking(false);
      }
    },
    [isSupported, selectVoice]
  );

  const stop = useCallback(() => {
    if (!isSupported) return;
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.warn('[TTS] Speech cancel error:', e);
    }
    setIsSpeaking(false);
    diagnosticLogger.log('tts', 'Speech synthesis stopped');
  }, [isSupported]);

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
    activeVoiceName,
  };
}
