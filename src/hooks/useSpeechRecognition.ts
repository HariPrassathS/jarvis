'use client';

// ──────────────────────────────────────────────
// useSpeechRecognition — Always-On Voice Engine with VAD & Barge-In
// ──────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import { diagnosticLogger } from '@/lib/debug/diagnostic-logger';
import { latencyTracker } from '@/lib/debug/latency-tracker';

export interface UseSpeechRecognitionOptions {
  onSpeechComplete?: (text: string, t0?: number) => void;
  onBargeIn?: () => void;
  isSpeaking?: boolean;
  isLoading?: boolean;
  silenceDebounceMs?: number;
  initialMuted?: boolean;
}

export interface UseSpeechRecognitionReturn {
  interimTranscript: string;
  isListening: boolean;
  isUserSpeaking: boolean;
  isMuted: boolean;
  isMicKilled: boolean;
  isSupported: boolean;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unsupported';
  isTapToTalk: boolean;
  modeReason: string | null;
  isBackgrounded: boolean;
  triggerTapToTalk: () => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  toggleMicKill: () => void;
  setMicKilled: (killed: boolean) => void;
  resetTranscript: () => void;
}

// Type augmentation for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onnomatch: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

export function useSpeechRecognition(
  options?: UseSpeechRecognitionOptions
): UseSpeechRecognitionReturn {
  const {
    onSpeechComplete,
    onBargeIn,
    isSpeaking = false,
    isLoading = false,
    silenceDebounceMs = 800,
    initialMuted = false,
  } = options || {};

  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isMicKilled, setIsMicKilled] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<
    'granted' | 'denied' | 'prompt' | 'unsupported'
  >('prompt');
  const [isTapToTalk, setIsTapToTalk] = useState(false);
  const [modeReason, setModeReason] = useState<string | null>(null);
  const [isBackgrounded, setIsBackgrounded] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const isMicKilledRef = useRef(isMicKilled);
  isMicKilledRef.current = isMicKilled;

  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;

  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  const onSpeechCompleteRef = useRef(onSpeechComplete);
  onSpeechCompleteRef.current = onSpeechComplete;

  const onBargeInRef = useRef(onBargeIn);
  onBargeInRef.current = onBargeIn;

  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedTextRef = useRef('');
  const isStartedRef = useRef(false);
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resumeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTapToTalkRef = useRef(false);
  const rapidAbortCountRef = useRef(0);

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Auto-detect mobile platforms (iOS WebKit in particular blocks continuous loops)
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      const isIOS =
        /iPhone|iPad|iPod/i.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isMobileSafari =
        (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua) && /Mobile/i.test(ua)) ||
        /CriOS|FxiOS/i.test(ua);

      if (isIOS || isMobileSafari) {
        setIsTapToTalk(true);
        isTapToTalkRef.current = true;
        setModeReason('Mobile iOS WebKit: Tap-to-Talk active');
        diagnosticLogger.log('system', 'iOS WebKit detected -> Tap-to-Talk active');
      }
    }
  }, []);

  // ── Start listening loop safely (Hard-blocked if Mic Kill-Switch is engaged) ──
  const startEngine = useCallback(() => {
    if (!recognitionRef.current || isMicKilledRef.current || isMutedRef.current || isStartedRef.current) return;
    try {
      recognitionRef.current.start();
      isStartedRef.current = true;
      setIsListening(true);
      diagnosticLogger.log('speech', 'SpeechRecognition.start() requested');
    } catch (e: any) {
      if (e?.name === 'InvalidStateError' || e?.message?.includes('already started')) {
        isStartedRef.current = true;
        setIsListening(true);
        diagnosticLogger.log('speech', 'SpeechRecognition already running (InvalidState)');
      } else {
        console.warn('[Always-On Voice] Recognition start error:', e);
        diagnosticLogger.log('speech', `Start error: ${e?.message || e}`);
      }
    }
  }, []);

  // ── Stop listening loop immediately (Aborts active recognition and cancels restart timers) ──
  const stopEngine = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.abort();
      diagnosticLogger.log('speech', 'SpeechRecognition.abort() invoked');
    } catch {}
    try {
      recognitionRef.current.stop();
    } catch {}
    isStartedRef.current = false;
    setIsListening(false);
  }, []);

  // ── Tap-to-Talk Manual Action for Mobile/Fallback ──
  const triggerTapToTalk = useCallback(() => {
    if (!recognitionRef.current || isLoadingRef.current || isMicKilledRef.current) return;

    diagnosticLogger.log('speech', 'Tap-to-Talk triggered by operator touch', {
      isStarted: isStartedRef.current,
      hasText: !!accumulatedTextRef.current.trim(),
    });

    if (isStartedRef.current) {
      // User tapped while active -> stop and process
      stopEngine();
      if (accumulatedTextRef.current.trim() && onSpeechCompleteRef.current) {
        const text = accumulatedTextRef.current.trim();
        const t0 = latencyTracker.markT0(text);
        accumulatedTextRef.current = '';
        setInterimTranscript('');
        setIsUserSpeaking(false);
        diagnosticLogger.log('speech', `Turn completed via touch stop: "${text}"`);
        onSpeechCompleteRef.current(text, t0);
      }
    } else {
      // User tapped to begin turn -> fresh user gesture satisfies mobile constraints
      accumulatedTextRef.current = '';
      setInterimTranscript('');
      setIsMuted(false);
      isMutedRef.current = false;
      startEngine();
    }
  }, [startEngine, stopEngine]);

  // ── Synchronous TTS Suppression & Post-Speech Acoustic Settling Delay ──
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;

    if (isSpeaking) {
      // TTS started: synchronously stop recognition, wipe accumulated text, and cancel any pending timers
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }

      accumulatedTextRef.current = '';
      setInterimTranscript('');
      setIsUserSpeaking(false);

      diagnosticLogger.log('speech', 'TTS speech active -> Synchronously pausing STT engine');
      stopEngine();
    } else {
      // TTS finished or cancelled: apply deliberate settling delay (250ms) to allow mobile speaker acoustic tail to clear
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);

      resumeTimerRef.current = setTimeout(() => {
        if (
          !isMicKilledRef.current &&
          !isMutedRef.current &&
          !isSpeakingRef.current &&
          !isTapToTalkRef.current &&
          typeof document !== 'undefined' &&
          document.visibilityState === 'visible'
        ) {
          diagnosticLogger.log('speech', 'Post-settle STT resume executing (250ms)');
          startEngine();
        }
      }, 250);
    }

    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [isSpeaking, startEngine, stopEngine]);

  // ── Initialize Web Speech Recognition ──
  useEffect(() => {
    if (!isSupported) {
      setPermissionStatus('unsupported');
      diagnosticLogger.log('speech', 'SpeechRecognition not supported in browser');
      return;
    }

    try {
      const SpeechRecognitionConstructor =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionConstructor();

      // In tap-to-talk mode, continuous is disabled for single-utterance reliability
      recognition.continuous = !isTapToTalkRef.current;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        if (isMicKilledRef.current) {
          try {
            recognition.abort();
          } catch {}
          isStartedRef.current = false;
          setIsListening(false);
          return;
        }
        isStartedRef.current = true;
        setIsListening(true);
        setPermissionStatus('granted');
        rapidAbortCountRef.current = 0;
        diagnosticLogger.log('speech', 'SpeechRecognition onstart: Listening active');
      };

      recognition.onaudiostart = () => {
        diagnosticLogger.log('speech', 'Audio capture active (onaudiostart)');
      };

      recognition.onsoundstart = () => {
        diagnosticLogger.log('speech', 'Sound detected (onsoundstart)');
      };

      recognition.onspeechstart = () => {
        if (isMicKilledRef.current) return;
        diagnosticLogger.log('speech', 'Human speech detected (onspeechstart)');
        setIsUserSpeaking(true);
      };

      recognition.onspeechend = () => {
        diagnosticLogger.log('speech', 'Speech pause/end detected (onspeechend)');
      };

      recognition.onnomatch = () => {
        diagnosticLogger.log('speech', 'No speech pattern match (onnomatch)');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (isMicKilledRef.current || isMutedRef.current) return;

        // Defensive Layer 1: Synchronously suppress ALL speech accumulation during active TTS playback
        if (isSpeakingRef.current) {
          diagnosticLogger.log('speech', 'Suppressed mic result during active TTS playback');
          if (onBargeInRef.current) {
            console.log('[Always-On Voice] ⚡ User barge-in detected. Interrupting JARVIS.');
            diagnosticLogger.log('speech', 'User barge-in detected -> Interrupting speech');
            onBargeInRef.current();
          }
          accumulatedTextRef.current = '';
          setInterimTranscript('');
          setIsUserSpeaking(false);
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
          return;
        }

        let finalPart = '';
        let interimPart = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalPart += res[0].transcript + ' ';
          } else {
            interimPart += res[0].transcript;
          }
        }

        if (finalPart) {
          accumulatedTextRef.current += finalPart;
        }

        const currentSpoken = `${accumulatedTextRef.current} ${interimPart}`
          .replace(/\s+/g, ' ')
          .trim();

        if (currentSpoken && !isMicKilledRef.current) {
          rapidAbortCountRef.current = 0; // reset error threshold
          setInterimTranscript(currentSpoken);
          setIsUserSpeaking(true);

          diagnosticLogger.log(
            'speech',
            finalPart ? `Final: "${finalPart.trim()}"` : `Interim: "${interimPart.trim()}"`
          );

          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }

          const capturedSpoken = currentSpoken;
          silenceTimeoutRef.current = setTimeout(() => {
            if (capturedSpoken.length > 1 && !isLoadingRef.current && !isMicKilledRef.current) {
              console.log('[Always-On Voice] 🎙️ Turn complete:', capturedSpoken);
              const t0 = latencyTracker.markT0(capturedSpoken);
              diagnosticLogger.log('speech', `Turn complete: "${capturedSpoken}"`);
              accumulatedTextRef.current = '';
              setInterimTranscript('');
              setIsUserSpeaking(false);

              if (onSpeechCompleteRef.current) {
                onSpeechCompleteRef.current(capturedSpoken, t0);
              }

              // In tap-to-talk mode, stop recognition cleanly after turn completion
              if (isTapToTalkRef.current) {
                stopEngine();
              }
            }
          }, silenceDebounceMs);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        diagnosticLogger.log('speech', `onerror: ${event.error}`, { error: event.error });

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setPermissionStatus('denied');
          setIsListening(false);
          isStartedRef.current = false;
        } else if (event.error === 'no-speech') {
          // Normal pause in mobile Chrome/Android; do not increment rapidAbortCount
        } else if (event.error === 'aborted') {
          rapidAbortCountRef.current += 1;
          // If 3+ rapid aborts occur on continuous mode, gracefully switch to tap-to-talk!
          if (rapidAbortCountRef.current >= 3 && !isTapToTalkRef.current && !isMicKilledRef.current) {
            console.warn('[Always-On Voice] ⚠️ Continuous mode restricted by browser. Engaging Tap-to-Talk fallback.');
            setIsTapToTalk(true);
            isTapToTalkRef.current = true;
            setModeReason('Continuous mic restricted by browser — tap-to-talk mode active');
            diagnosticLogger.log('speech', 'Continuous restricted -> Switched to Tap-to-Talk');
          }
        } else {
          console.warn('[Always-On Voice] Recognition status:', event.error);
        }
      };

      // ── Auto-Restart or Tap-to-Talk Stop ──
      recognition.onend = () => {
        isStartedRef.current = false;
        setIsListening(false);
        diagnosticLogger.log('speech', 'recognition.onend event');

        // Do not auto-restart if mic is killed, muted, TTS is actively speaking, in tap-to-talk mode, or tab is hidden
        if (
          !isMicKilledRef.current &&
          !isMutedRef.current &&
          !isSpeakingRef.current &&
          !isTapToTalkRef.current &&
          typeof document !== 'undefined' &&
          document.visibilityState === 'visible'
        ) {
          restartTimerRef.current = setTimeout(() => {
            if (!isMicKilledRef.current) {
              startEngine();
            }
          }, 300);
        }
      };

      recognitionRef.current = recognition;

      // Automatically engage always-on listening if not muted, not killed, and not mobile tap-to-talk
      if (!initialMuted && !isMicKilledRef.current && !isTapToTalkRef.current) {
        startEngine();
      }
    } catch (err: any) {
      console.warn('[Always-On Voice] Engine initialization error:', err);
      diagnosticLogger.log('speech', `Init error: ${err?.message || err}`);
    }

    // ── Tab Visibility & Lock Screen Handling ──
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setIsBackgrounded(true);
        setIsListening(false);
        stopEngine();
      } else if (document.visibilityState === 'visible') {
        setIsBackgrounded(false);
        if (!isMicKilledRef.current && !isMutedRef.current && !isTapToTalkRef.current) {
          startEngine();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      stopEngine();
    };
  }, [isSupported, initialMuted, silenceDebounceMs, startEngine, stopEngine]);

  // ── Mute / Unmute Controls ──
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      if (next) {
        stopEngine();
        setInterimTranscript('');
        setIsUserSpeaking(false);
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      } else {
        if (!isMicKilledRef.current) {
          startEngine();
        }
      }
      return next;
    });
  }, [startEngine, stopEngine]);

  const setMuted = useCallback(
    (muted: boolean) => {
      setIsMuted(muted);
      isMutedRef.current = muted;
      if (muted) {
        stopEngine();
        setInterimTranscript('');
        setIsUserSpeaking(false);
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      } else {
        if (!isMicKilledRef.current) {
          startEngine();
        }
      }
    },
    [startEngine, stopEngine]
  );

  // ── Global Mic Kill-Switch (Hard Hardware Stream Sever) ──
  const toggleMicKill = useCallback(() => {
    setIsMicKilled((prev) => {
      const next = !prev;
      isMicKilledRef.current = next;
      if (next) {
        stopEngine();
        setInterimTranscript('');
        accumulatedTextRef.current = '';
        setIsUserSpeaking(false);
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        diagnosticLogger.log('speech', '🛑 Global Mic Kill-Switch ENGAGED — Hardware mic stream terminated');
      } else {
        diagnosticLogger.log('speech', '🟢 Global Mic Kill-Switch DISENGAGED — Hardware mic stream restored');
        if (!isMutedRef.current && !isTapToTalkRef.current) {
          startEngine();
        }
      }
      return next;
    });
  }, [startEngine, stopEngine]);

  const setMicKilled = useCallback(
    (killed: boolean) => {
      setIsMicKilled(killed);
      isMicKilledRef.current = killed;
      if (killed) {
        stopEngine();
        setInterimTranscript('');
        accumulatedTextRef.current = '';
        setIsUserSpeaking(false);
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        diagnosticLogger.log('speech', '🛑 Global Mic Kill-Switch ENGAGED — Hardware mic stream terminated');
      } else {
        diagnosticLogger.log('speech', '🟢 Global Mic Kill-Switch DISENGAGED — Hardware mic stream restored');
        if (!isMutedRef.current && !isTapToTalkRef.current) {
          startEngine();
        }
      }
    },
    [startEngine, stopEngine]
  );

  const resetTranscript = useCallback(() => {
    setInterimTranscript('');
    accumulatedTextRef.current = '';
    setIsUserSpeaking(false);
  }, []);

  return {
    interimTranscript,
    isListening,
    isUserSpeaking,
    isMuted,
    isMicKilled,
    isSupported,
    permissionStatus,
    isTapToTalk,
    modeReason,
    isBackgrounded,
    triggerTapToTalk,
    toggleMute,
    setMuted,
    toggleMicKill,
    setMicKilled,
    resetTranscript,
  };
}
