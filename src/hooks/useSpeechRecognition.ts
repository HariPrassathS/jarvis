'use client';

// ──────────────────────────────────────────────
// useSpeechRecognition — Always-On Voice Engine with VAD & Barge-In
// ──────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseSpeechRecognitionOptions {
  onSpeechComplete?: (text: string) => void;
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
  isSupported: boolean;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unsupported';
  isTapToTalk: boolean;
  modeReason: string | null;
  isBackgrounded: boolean;
  triggerTapToTalk: () => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
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
  const [permissionStatus, setPermissionStatus] = useState<
    'granted' | 'denied' | 'prompt' | 'unsupported'
  >('prompt');
  const [isTapToTalk, setIsTapToTalk] = useState(false);
  const [modeReason, setModeReason] = useState<string | null>(null);
  const [isBackgrounded, setIsBackgrounded] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

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
  const isTapToTalkRef = useRef(false);
  const rapidAbortCountRef = useRef(0);

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Auto-detect mobile platforms (iOS WebKit in particular blocks continuous loops)
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      const isIOS = /iPhone|iPad|iPod/i.test(ua);
      const isMobileSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua) && /Mobile/i.test(ua);
      if (isIOS || isMobileSafari) {
        setIsTapToTalk(true);
        isTapToTalkRef.current = true;
        setModeReason('Mobile Safari touch gesture required');
      }
    }
  }, []);

  // ── Start listening loop safely ──
  const startEngine = useCallback(() => {
    if (!recognitionRef.current || isMutedRef.current || isStartedRef.current) return;
    try {
      recognitionRef.current.start();
      isStartedRef.current = true;
      setIsListening(true);
    } catch (e: any) {
      if (e?.name === 'InvalidStateError' || e?.message?.includes('already started')) {
        isStartedRef.current = true;
        setIsListening(true);
      } else {
        console.warn('[Always-On Voice] Recognition start error:', e);
      }
    }
  }, []);

  // ── Stop listening loop ──
  const stopEngine = useCallback(() => {
    if (!recognitionRef.current) return;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      recognitionRef.current.stop();
    } catch {}
    isStartedRef.current = false;
    setIsListening(false);
  }, []);

  // ── Tap-to-Talk Manual Action for Mobile/Fallback ──
  const triggerTapToTalk = useCallback(() => {
    if (!recognitionRef.current || isLoadingRef.current) return;

    if (isStartedRef.current) {
      // User tapped while active -> stop and process
      stopEngine();
      if (accumulatedTextRef.current.trim() && onSpeechCompleteRef.current) {
        const text = accumulatedTextRef.current.trim();
        accumulatedTextRef.current = '';
        setInterimTranscript('');
        setIsUserSpeaking(false);
        onSpeechCompleteRef.current(text);
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

  // ── Initialize Web Speech Recognition ──
  useEffect(() => {
    if (!isSupported) {
      setPermissionStatus('unsupported');
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

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (isMutedRef.current) return;

        if (isSpeakingRef.current) {
          console.log('[Always-On Voice] ⚡ User barge-in detected. Interrupting JARVIS.');
          if (onBargeInRef.current) {
            onBargeInRef.current();
          }
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

        if (currentSpoken) {
          rapidAbortCountRef.current = 0; // reset error threshold
          setInterimTranscript(currentSpoken);
          setIsUserSpeaking(true);

          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }

          const capturedSpoken = currentSpoken;
          silenceTimeoutRef.current = setTimeout(() => {
            if (capturedSpoken.length > 1 && !isLoadingRef.current) {
              console.log('[Always-On Voice] 🎙️ Turn complete:', capturedSpoken);
              accumulatedTextRef.current = '';
              setInterimTranscript('');
              setIsUserSpeaking(false);

              if (onSpeechCompleteRef.current) {
                onSpeechCompleteRef.current(capturedSpoken);
              }

              // In tap-to-talk mode, stop recognition cleanly after turn completion
              if (isTapToTalkRef.current) {
                stopEngine();
              }
            }
          }, silenceDebounceMs);
        }
      };

      recognition.onstart = () => {
        isStartedRef.current = true;
        setIsListening(true);
        setPermissionStatus('granted');
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setPermissionStatus('denied');
          setIsListening(false);
          isStartedRef.current = false;
        } else if (event.error === 'no-speech') {
          // Expected during pauses
        } else if (event.error === 'aborted') {
          rapidAbortCountRef.current += 1;
          // If 3+ rapid aborts occur on continuous mode, gracefully switch to tap-to-talk!
          if (rapidAbortCountRef.current >= 3 && !isTapToTalkRef.current) {
            console.warn('[Always-On Voice] ⚠️ Continuous mode restricted by browser. Engaging Tap-to-Talk fallback.');
            setIsTapToTalk(true);
            isTapToTalkRef.current = true;
            setModeReason('Continuous mic restricted by browser — tap-to-talk mode active');
          }
        } else {
          console.warn('[Always-On Voice] Recognition status:', event.error);
        }
      };

      // ── Auto-Restart or Tap-to-Talk Stop ──
      recognition.onend = () => {
        isStartedRef.current = false;
        setIsListening(false);

        // Do not auto-restart if muted, in tap-to-talk mode, or tab is hidden
        if (
          !isMutedRef.current &&
          !isTapToTalkRef.current &&
          typeof document !== 'undefined' &&
          document.visibilityState === 'visible'
        ) {
          restartTimerRef.current = setTimeout(() => {
            startEngine();
          }, 200);
        }
      };

      recognitionRef.current = recognition;

      // Automatically engage always-on listening if not muted and not mobile tap-to-talk
      if (!initialMuted && !isTapToTalkRef.current) {
        startEngine();
      }
    } catch (err) {
      console.warn('[Always-On Voice] Engine initialization error:', err);
    }

    // ── Tab Visibility & Lock Screen Handling ──
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setIsBackgrounded(true);
        setIsListening(false);
        stopEngine();
      } else if (document.visibilityState === 'visible') {
        setIsBackgrounded(false);
        if (!isMutedRef.current && !isTapToTalkRef.current) {
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
        startEngine();
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
        startEngine();
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
    isSupported,
    permissionStatus,
    isTapToTalk,
    modeReason,
    isBackgrounded,
    triggerTapToTalk,
    toggleMute,
    setMuted,
    resetTranscript,
  };
}
