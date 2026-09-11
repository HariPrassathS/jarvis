'use client';

// ──────────────────────────────────────────────
// useSpeechSynthesis — Dual Persona Web Speech Synthesis
// Supports JARVIS (male British butler) & FRIDAY (female tactical Irish/warm)
// Now with sentence-queue TTS for streaming responses
// ──────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoicePersona } from '@/types';
import { diagnosticLogger } from '@/lib/debug/diagnostic-logger';
import { latencyTracker } from '@/lib/debug/latency-tracker';

interface UseSpeechSynthesisReturn {
  speak: (text: string, overridePersona?: VoicePersona) => void;
  stop: () => void;
  queueSentence: (sentence: string, overridePersona?: VoicePersona) => void;
  clearQueue: () => void;
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
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Sentence queue for streaming TTS
  const sentenceQueueRef = useRef<string[]>([]);
  const isQueuePlayingRef = useRef(false);
  const queuePersonaRef = useRef<VoicePersona>(persona);

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

  // ── Browser Audio Unlock on first user gesture ──
  useEffect(() => {
    if (!isSupported) return;
    const unlockAudio = () => {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        const dummy = new SpeechSynthesisUtterance('');
        dummy.volume = 0;
        window.speechSynthesis.speak(dummy);
      } catch {}
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [isSupported]);

  // ── Liveness Watchdog: periodically recovers stale isSpeaking state if synthesis is dead ──
  useEffect(() => {
    if (!isSupported) return;
    const interval = setInterval(() => {
      if (
        isSpeaking &&
        !window.speechSynthesis.speaking &&
        !window.speechSynthesis.pending &&
        sentenceQueueRef.current.length === 0 &&
        !isQueuePlayingRef.current
      ) {
        setIsSpeaking(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSupported, isSpeaking]);

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
      const femaleEnglish = currentVoices.find(
        (v) => v.lang.startsWith('en') && FEMALE_VOICE_REGEX.test(v.name)
      );
      if (femaleEnglish) {
        diagnosticLogger.log('tts', `Voice matched FRIDAY female regex: ${femaleEnglish.name}`);
        return femaleEnglish;
      }

      const irishVoice = currentVoices.find((v) => v.lang.toLowerCase().includes('en-ie'));
      if (irishVoice) {
        diagnosticLogger.log('tts', `Voice matched FRIDAY Irish fallback: ${irishVoice.name}`);
        return irishVoice;
      }

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

  /**
   * Internal: speak a single text chunk with persona-tuned acoustic delivery.
   * Returns a promise that resolves when the utterance finishes.
   * Guaranteed to resolve via safety watchdog timer and automatic fallback to default voice.
   */
  const speakChunk = useCallback(
    (text: string, effectivePersona: VoicePersona): Promise<void> => {
      return new Promise((resolve) => {
        if (!isSupported || !text.trim()) {
          resolve();
          return;
        }

        const cleaned = cleanTextForSpeech(text);
        if (!cleaned) {
          resolve();
          return;
        }

        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }

          let retriedWithDefault = false;
          let isResolved = false;
          let safetyTimer: NodeJS.Timeout | null = null;

          const done = () => {
            if (isResolved) return;
            isResolved = true;
            if (safetyTimer) {
              clearTimeout(safetyTimer);
              safetyTimer = null;
            }
            activeUtteranceRef.current = null;
            resolve();
          };

          // Watchdog timer ensures the chunk queue NEVER hangs
          const maxDurationMs = Math.min(15000, Math.max(3500, cleaned.length * 100));
          safetyTimer = setTimeout(() => {
            console.warn('[TTS] Chunk watchdog timeout triggered. Force-resolving chunk.');
            done();
          }, maxDurationMs);

          const startPlayback = (useCustomVoice: boolean) => {
            const utterance = new SpeechSynthesisUtterance(cleaned);
            activeUtteranceRef.current = utterance;
            if (typeof window !== 'undefined') {
              (window as any).__jarvisCurrentUtterance__ = utterance;
            }

            if (useCustomVoice) {
              const voice = selectVoice(effectivePersona);
              if (voice) {
                utterance.voice = voice;
                setActiveVoiceName(voice.name);
              }
            } else {
              utterance.voice = null;
              setActiveVoiceName('System Default');
            }

            if (effectivePersona === 'friday') {
              utterance.pitch = 1.12;
              utterance.rate = 1.03;
            } else {
              utterance.pitch = 0.85;
              utterance.rate = 0.96;
            }
            utterance.volume = 1.0;

            utterance.onstart = () => {
              latencyTracker.markT5(cleaned);
              setIsSpeaking(true);
            };

            utterance.onend = done;
            utterance.onerror = (e) => {
              console.warn('[TTS] Chunk synthesis error:', e.error || e);
              // If custom voice failed and not yet retried, retry with default voice
              if (useCustomVoice && !retriedWithDefault && e.error !== 'canceled' && e.error !== 'interrupted') {
                retriedWithDefault = true;
                console.log('[TTS] Retrying chunk with native system default voice...');
                setTimeout(() => {
                  try {
                    startPlayback(false);
                  } catch {
                    done();
                  }
                }, 20);
                return;
              }
              done();
            };

            window.speechSynthesis.speak(utterance);
          };

          startPlayback(true);
        } catch (e: any) {
          console.warn('[TTS] Chunk playback error:', e);
          activeUtteranceRef.current = null;
          resolve();
        }
      });
    },
    [isSupported, selectVoice]
  );

  /**
   * Process the sentence queue sequentially.
   */
  const processQueue = useCallback(async () => {
    if (isQueuePlayingRef.current) return;
    isQueuePlayingRef.current = true;

    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }

    setIsSpeaking(true);

    while (sentenceQueueRef.current.length > 0) {
      const sentence = sentenceQueueRef.current.shift()!;
      diagnosticLogger.log('tts', `Queue speaking sentence (${sentenceQueueRef.current.length} remaining)`, {
        text: sentence.length > 40 ? `${sentence.slice(0, 40)}...` : sentence,
      });
      await speakChunk(sentence, queuePersonaRef.current);
    }

    isQueuePlayingRef.current = false;
    latencyTracker.markT6();

    // Acoustic settling buffer after queue completes
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      setIsSpeaking(false);
      diagnosticLogger.log('tts', 'Sentence queue finished (post-settle)');
    }, 200);
  }, [speakChunk]);

  /**
   * Queue a sentence for sequential TTS playback.
   * Used during streaming — sentences are spoken as they complete.
   */
  const queueSentence = useCallback(
    (sentence: string, overridePersona?: VoicePersona) => {
      if (!isSupported || !sentence.trim()) return;
      queuePersonaRef.current = overridePersona || personaRef.current;
      sentenceQueueRef.current.push(sentence);
      processQueue();
    },
    [isSupported, processQueue]
  );

  /**
   * Clear the sentence queue and stop any active speech.
   */
  const clearQueue = useCallback(() => {
    sentenceQueueRef.current = [];
    isQueuePlayingRef.current = false;
    activeUtteranceRef.current = null;
  }, []);

  // ── Synthesize speech with persona-tuned acoustic delivery (full message, non-streaming) ──
  const speak = useCallback(
    (text: string, overridePersona?: VoicePersona) => {
      if (!isSupported || !text.trim()) return;

      const cleaned = cleanTextForSpeech(text);
      if (!cleaned) return;

      const effectivePersona = overridePersona || personaRef.current;

      try {
        // Clear any queued sentences
        sentenceQueueRef.current = [];
        isQueuePlayingRef.current = false;
        window.speechSynthesis.cancel();

        let retriedWithDefault = false;
        let isCompleted = false;
        let safetyTimer: NodeJS.Timeout | null = null;

        const finish = () => {
          if (isCompleted) return;
          isCompleted = true;
          if (safetyTimer) {
            clearTimeout(safetyTimer);
            safetyTimer = null;
          }
          activeUtteranceRef.current = null;
          latencyTracker.markT6();
          if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
          settleTimerRef.current = setTimeout(() => {
            setIsSpeaking(false);
            diagnosticLogger.log('tts', 'Speech synthesis finished (post-settle)');
          }, 200);
        };

        const startPlayback = (useCustomVoice: boolean) => {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }

          const utterance = new SpeechSynthesisUtterance(cleaned);
          activeUtteranceRef.current = utterance;
          if (typeof window !== 'undefined') {
            (window as any).__jarvisCurrentUtterance__ = utterance;
          }

          if (useCustomVoice) {
            const voice = selectVoice(effectivePersona);
            if (voice) {
              utterance.voice = voice;
              setActiveVoiceName(voice.name);
            }
          } else {
            utterance.voice = null;
            setActiveVoiceName('System Default');
          }

          if (effectivePersona === 'friday') {
            utterance.pitch = 1.12;
            utterance.rate = 1.03;
          } else {
            utterance.pitch = 0.85;
            utterance.rate = 0.96;
          }
          utterance.volume = 1.0;

          diagnosticLogger.log('tts', `Speaking as ${effectivePersona.toUpperCase()}`, {
            voiceName: useCustomVoice ? (utterance.voice?.name || 'Default') : 'System Default',
            pitch: utterance.pitch,
            rate: utterance.rate,
            text: cleaned.length > 40 ? `${cleaned.slice(0, 40)}...` : cleaned,
          });

          if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
          }

          setIsSpeaking(true);

          // Watchdog timer for full speech
          const maxDurationMs = Math.min(30000, Math.max(4000, cleaned.length * 110));
          if (safetyTimer) clearTimeout(safetyTimer);
          safetyTimer = setTimeout(() => {
            console.warn('[TTS] Full speech watchdog timeout triggered. Releasing speaking state.');
            finish();
          }, maxDurationMs);

          utterance.onstart = () => {
            latencyTracker.markT5(cleaned);
            setIsSpeaking(true);
            diagnosticLogger.log('tts', 'Speech synthesis started');
          };

          utterance.onend = finish;

          utterance.onerror = (e) => {
            console.warn('[TTS] Synthesis error:', e.error || e);
            diagnosticLogger.log('tts', `Synthesis error: ${e.error || e}`);
            if (useCustomVoice && !retriedWithDefault && e.error !== 'canceled' && e.error !== 'interrupted') {
              retriedWithDefault = true;
              console.log('[TTS] Retrying full speech with native system default voice...');
              setTimeout(() => {
                try {
                  startPlayback(false);
                } catch {
                  finish();
                }
              }, 20);
              return;
            }
            finish();
          };

          window.speechSynthesis.speak(utterance);
        };

        // Small 20ms timeout to allow Chrome cancel() to settle before starting new utterance
        setTimeout(() => {
          startPlayback(true);
        }, 20);
      } catch (e: any) {
        console.warn('[TTS] Speech playback error:', e);
        diagnosticLogger.log('tts', `Playback exception: ${e?.message || e}`);
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
        setIsSpeaking(false);
        activeUtteranceRef.current = null;
      }
    },
    [isSupported, selectVoice]
  );

  const stop = useCallback(() => {
    if (!isSupported) return;
    sentenceQueueRef.current = [];
    isQueuePlayingRef.current = false;
    activeUtteranceRef.current = null;
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
    queueSentence,
    clearQueue,
    isSpeaking,
    isSupported,
    activeVoiceName,
  };
}
