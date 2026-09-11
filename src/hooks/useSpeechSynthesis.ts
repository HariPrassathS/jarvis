'use client';

// ──────────────────────────────────────────────
// useSpeechSynthesis — High-Fidelity Local Voice Engine
// Dual Persona: J.A.R.V.I.S (British Butler) & F.R.I.D.A.Y (Tactical Irish/Warm)
// Features: Pronunciation Normalization, Contextual Prosody, Voice Locking,
// Sequential Streaming Queue & Instant Barge-In Cancellation
// ──────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoicePersona } from '@/types';
import { diagnosticLogger } from '@/lib/debug/diagnostic-logger';
import { latencyTracker } from '@/lib/debug/latency-tracker';
import {
  VOICE_ENGINE_CONFIG,
  cleanTextForSpeech,
  normalizePronunciation,
  calculateProsody,
  resolveVoice,
} from '@/lib/voice';

// Re-export cleaner for backwards compatibility
export { cleanTextForSpeech, normalizePronunciation };

export interface UseSpeechSynthesisReturn {
  speak: (text: string, overridePersona?: VoicePersona) => void;
  stop: () => void;
  queueSentence: (sentence: string, overridePersona?: VoicePersona) => void;
  clearQueue: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
  activeVoiceName: string | null;
}

export function useSpeechSynthesis(persona: VoicePersona = 'jarvis'): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeVoiceName, setActiveVoiceName] = useState<string | null>(null);

  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const personaRef = useRef<VoicePersona>(persona);
  personaRef.current = persona;

  // Voice locking: locks the selected voice for the entire duration of a response stream
  const lockedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const settleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Streaming FIFO sentence queue
  const sentenceQueueRef = useRef<string[]>([]);
  const isQueuePlayingRef = useRef(false);
  const queuePersonaRef = useRef<VoicePersona>(persona);

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // ── Load available browser voices & listen to voiceschanged event ──
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      try {
        const available = window.speechSynthesis.getVoices();
        if (available && available.length > 0) {
          voicesRef.current = available;
          // Refresh locked voice if voices list changed
          if (!lockedVoiceRef.current) {
            const resolved = resolveVoice(personaRef.current, available);
            if (resolved) setActiveVoiceName(resolved.name);
          }
          diagnosticLogger.log('tts', `Loaded ${available.length} browser voices`, {
            count: available.length,
          });
        }
      } catch (e) {
        console.warn('[TTS] Could not load speech voices:', e);
      }
    };

    loadVoices();

    // Multiple poll attempts for mobile platforms where voices load asynchronously
    const t1 = setTimeout(loadVoices, 50);
    const t2 = setTimeout(loadVoices, 200);
    const t3 = setTimeout(loadVoices, 600);
    const t4 = setTimeout(loadVoices, 1500);

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

  // ── Liveness Watchdog: periodically recovers stale isSpeaking state ──
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

  /**
   * Internal helper to resolve voice with consistency locking
   */
  const getConsistentVoice = useCallback((targetPersona: VoicePersona): SpeechSynthesisVoice | null => {
    if (lockedVoiceRef.current) {
      return lockedVoiceRef.current;
    }
    if (voicesRef.current.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      voicesRef.current = window.speechSynthesis.getVoices();
    }
    const voice = resolveVoice(targetPersona, voicesRef.current);
    lockedVoiceRef.current = voice;
    if (voice) {
      setActiveVoiceName(voice.name);
    }
    return voice;
  }, []);

  /**
   * Speak a single normalized sentence chunk with dynamic prosody and voice locking.
   * Returns a promise that resolves when playback finishes.
   */
  const speakChunk = useCallback(
    (rawSentence: string, effectivePersona: VoicePersona): Promise<void> => {
      return new Promise((resolve) => {
        if (!isSupported || !rawSentence.trim()) {
          resolve();
          return;
        }

        const normalized = normalizePronunciation(rawSentence, effectivePersona);
        if (!normalized) {
          resolve();
          return;
        }

        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }

          const prosody = calculateProsody(rawSentence, effectivePersona);
          const voice = getConsistentVoice(effectivePersona);

          if (VOICE_ENGINE_CONFIG.debug) {
            console.log(
              `[VOICE] Persona: ${effectivePersona.toUpperCase()} | Voice: "${voice?.name || 'System Default'}" | Rate: ${prosody.rate} | Pitch: ${prosody.pitch}\n  ↳ Raw: "${rawSentence}"\n  ↳ Spoken: "${normalized}"`
            );
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
            // Short natural inter-sentence pause before resolving
            setTimeout(() => {
              resolve();
            }, prosody.pauseAfterMs);
          };

          // Watchdog timer ensures the chunk queue NEVER hangs
          const maxDurationMs = Math.min(15000, Math.max(3500, normalized.length * 100));
          safetyTimer = setTimeout(() => {
            console.warn('[TTS] Chunk watchdog timeout triggered. Force-resolving chunk.');
            done();
          }, maxDurationMs);

          const startPlayback = (useCustomVoice: boolean) => {
            const utterance = new SpeechSynthesisUtterance(normalized);
            activeUtteranceRef.current = utterance;
            if (typeof window !== 'undefined') {
              (window as any).__jarvisCurrentUtterance__ = utterance;
            }

            if (useCustomVoice && voice) {
              utterance.voice = voice;
            } else {
              utterance.voice = null;
            }

            utterance.pitch = prosody.pitch;
            utterance.rate = prosody.rate;
            utterance.volume = prosody.volume;

            utterance.onstart = () => {
              latencyTracker.markT5(normalized);
              setIsSpeaking(true);
            };

            utterance.onend = done;

            utterance.onerror = (e) => {
              console.warn('[TTS] Chunk synthesis error:', e.error || e);
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
          console.warn('[TTS] Chunk playback exception:', e);
          activeUtteranceRef.current = null;
          resolve();
        }
      });
    },
    [isSupported, getConsistentVoice]
  );

  /**
   * Process the streaming FIFO queue sequentially.
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
    lockedVoiceRef.current = null; // Release voice lock when queue finishes
    latencyTracker.markT6();

    // Acoustic settling buffer after queue completes
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      setIsSpeaking(false);
      diagnosticLogger.log('tts', 'Sentence queue finished (post-settle)');
    }, 200);
  }, [speakChunk]);

  /**
   * Queue a sentence for sequential streaming TTS.
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
   * Clear queue and reset voice locking.
   */
  const clearQueue = useCallback(() => {
    sentenceQueueRef.current = [];
    isQueuePlayingRef.current = false;
    lockedVoiceRef.current = null;
    activeUtteranceRef.current = null;
  }, []);

  /**
   * Full message synthesis (non-streaming).
   */
  const speak = useCallback(
    (text: string, overridePersona?: VoicePersona) => {
      if (!isSupported || !text.trim()) return;

      const effectivePersona = overridePersona || personaRef.current;
      const normalized = normalizePronunciation(text, effectivePersona);
      if (!normalized) return;

      try {
        sentenceQueueRef.current = [];
        isQueuePlayingRef.current = false;
        lockedVoiceRef.current = null;
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
          lockedVoiceRef.current = null;
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

          const utterance = new SpeechSynthesisUtterance(normalized);
          activeUtteranceRef.current = utterance;
          if (typeof window !== 'undefined') {
            (window as any).__jarvisCurrentUtterance__ = utterance;
          }

          const prosody = calculateProsody(text, effectivePersona);
          const voice = getConsistentVoice(effectivePersona);

          if (useCustomVoice && voice) {
            utterance.voice = voice;
          } else {
            utterance.voice = null;
          }

          utterance.pitch = prosody.pitch;
          utterance.rate = prosody.rate;
          utterance.volume = prosody.volume;

          if (VOICE_ENGINE_CONFIG.debug) {
            console.log(
              `[VOICE] Non-streaming Speech | Persona: ${effectivePersona.toUpperCase()} | Voice: "${voice?.name || 'System Default'}" | Rate: ${prosody.rate} | Pitch: ${prosody.pitch}`
            );
          }

          diagnosticLogger.log('tts', `Speaking as ${effectivePersona.toUpperCase()}`, {
            voiceName: useCustomVoice ? (utterance.voice?.name || 'Default') : 'System Default',
            pitch: utterance.pitch,
            rate: utterance.rate,
            text: normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized,
          });

          if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
          }

          setIsSpeaking(true);

          // Watchdog timer for full speech
          const maxDurationMs = Math.min(30000, Math.max(4000, normalized.length * 110));
          if (safetyTimer) clearTimeout(safetyTimer);
          safetyTimer = setTimeout(() => {
            console.warn('[TTS] Full speech watchdog timeout triggered. Releasing speaking state.');
            finish();
          }, maxDurationMs);

          utterance.onstart = () => {
            latencyTracker.markT5(normalized);
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
        lockedVoiceRef.current = null;
        activeUtteranceRef.current = null;
      }
    },
    [isSupported, getConsistentVoice]
  );

  /**
   * Stop all synthesis immediately (used on barge-in / mic activation).
   */
  const stop = useCallback(() => {
    if (!isSupported) return;
    sentenceQueueRef.current = [];
    isQueuePlayingRef.current = false;
    lockedVoiceRef.current = null;
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
