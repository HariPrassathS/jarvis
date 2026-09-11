'use client';

// ──────────────────────────────────────────────
// JARVIS — Main Page
// Features: Multi-Stage Biometric Handshake & System Boot Narrative
// Continuous single-instance centerpiece Orb across all 6 phases
// Phase 0: Dormant Landing
// Phase 1: Handshake Initiated (morphing button + accelerated orb spin)
// Phase 2: Verifying (amber radar sweep + biometric signature scan)
// Phase 3: Identity Confirmed (cyan pulse + Stark chime + personalized welcome)
// Phase 4: System Boot (continuous orb repositioning + staggered HUD draw-in)
// Phase 5: Operator Online (idle HUD settle + synchronized vocal greeting)
// ──────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import JarvisOrb, { type BootNarrativePhase } from '@/components/hud/JarvisOrb';
import HudOverlay from '@/components/hud/HudOverlay';
import ChatPanel from '@/components/chat/ChatPanel';
import AudioSentryToggle from '@/components/voice/AudioSentryToggle';
import AtmosphericField from '@/components/hud/AtmosphericField';
import SignInButton from '@/components/auth/SignInButton';
import IntelligenceSelection from '@/components/auth/IntelligenceSelection';
import MobileDebugOverlay from '@/components/debug/MobileDebugOverlay';
import PrivacyModal from '@/components/privacy/PrivacyModal';
import CommandPalette from '@/components/hud/CommandPalette';
import SessionDebrief from '@/components/hud/SessionDebrief';
import { diagnosticLogger } from '@/lib/debug/diagnostic-logger';
import { playStarkChime } from '@/lib/audio/stark-chime';
import { getFirebaseAuth, getGoogleProvider } from '@/lib/firebase';
import { signInWithPopup } from 'firebase/auth';
import { processUploadedFile } from '@/lib/document/extractor';
import type { JarvisState, VoicePersona, ChatAttachment, ClearanceLevel } from '@/types';

/**
 * Circuit-breaker: Checks if recognized user speech is an echo
 * of JARVIS's own immediately preceding response.
 */
function isEchoArtifact(
  candidateText: string,
  referenceText: string,
  elapsedMs: number
): boolean {
  if (!candidateText || !referenceText) return false;
  // If more than 12 seconds have elapsed since JARVIS spoke, it's not an echo
  if (elapsedMs > 12000) return false;

  const cleanCandidate = candidateText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanReference = referenceText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanCandidate || !cleanReference) return false;

  // 1. Direct substring match (if candidate is a substantial part of assistant response)
  if (cleanCandidate.length >= 8 && cleanReference.includes(cleanCandidate)) {
    return true;
  }
  if (cleanReference.length >= 8 && cleanCandidate.includes(cleanReference)) {
    return true;
  }

  // 2. Token overlap similarity
  const candWords = cleanCandidate.split(' ').filter((w) => w.length > 2);
  const refWords = new Set(cleanReference.split(' ').filter((w) => w.length > 2));

  if (candWords.length === 0) return false;

  let matchCount = 0;
  for (const word of candWords) {
    if (refWords.has(word)) matchCount++;
  }

  const overlapRatio = matchCount / candWords.length;
  // If 75%+ of candidate words match the assistant response and at least 2 words exist
  if (overlapRatio >= 0.75 && candWords.length >= 2) {
    return true;
  }

  return false;
}

// Characters for the scan-in title animation on initial landing
const TITLE_CHARS = 'J.A.R.V.I.S'.split('');

export type NarrativePhase =
  | 'phase0_dormant'
  | 'phase1_handshake'
  | 'phase2_verifying'
  | 'phase3_confirmed'
  | 'phase3_5_selection'
  | 'phase4_booting'
  | 'phase5_online';

type LandingEntranceStep = 'black' | 'seed' | 'bloom' | 'core' | 'title' | 'ready';

export default function Home() {
  const { user, profile, googleAccessToken, loading: authLoading, signOut, devSignIn } = useAuth();


  // ── Dual Persona State (JARVIS / FRIDAY) with SSR-safe hydration ──
  const [persona, setPersona] = useState<VoicePersona>('jarvis');
  const [clearanceLevel, setClearanceLevel] = useState<ClearanceLevel>(9);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('jarvis_voice_persona');
      if (stored === 'friday' || stored === 'jarvis') {
        setPersona(stored);
      }
    }
  }, []);

  // ── Reduced Motion Preference ──
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(mq.matches);
      const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, []);

  // ── Narrative Boot State Machine ──
  const [narrativePhase, setNarrativePhase] = useState<NarrativePhase>(() => {
    // If initialized with user already present, start directly in online
    return user ? 'phase5_online' : 'phase0_dormant';
  });

  // Landing entrance internal step machine for Phase 0
  const [entranceStep, setEntranceStep] = useState<LandingEntranceStep>('black');
  const [titleRevealCount, setTitleRevealCount] = useState(0);
  const [customAuthError, setCustomAuthError] = useState<string | null>(null);

  // ── Multi-Modal Drag-and-Drop & File Staging State ──
  const [isOrbReceiving, setIsOrbReceiving] = useState(false);
  const [stagedAttachments, setStagedAttachments] = useState<ChatAttachment[]>([]);

  // ── Privacy & Data Governance Modal State ──
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [purgeNotification, setPurgeNotification] = useState<string | null>(null);

  // ── Command Palette & Mission Debrief State ──
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSessionDebriefOpen, setIsSessionDebriefOpen] = useState(false);
  const [sessionStartTime] = useState<number>(() => Date.now());
  const [sessionQueryCount, setSessionQueryCount] = useState(0);

  // Global keyboard listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // ── Mobile Telemetry Debug Overlay Toggle (3-tap gesture) ──
  const [debugOverlayVisible, setDebugOverlayVisible] = useState(false);
  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);

  const handleDebugGesture = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTimeRef.current < 600) {
      tapCountRef.current += 1;
      if (tapCountRef.current >= 3) {
        setDebugOverlayVisible((prev) => !prev);
        tapCountRef.current = 0;
      }
    } else {
      tapCountRef.current = 1;
    }
    lastTapTimeRef.current = now;
  }, []);

  // ── Sync narrativePhase on authentication state changes ──
  useEffect(() => {
    if (
      user &&
      (narrativePhase === 'phase0_dormant' ||
        narrativePhase === 'phase1_handshake' ||
        narrativePhase === 'phase2_verifying')
    ) {
      setNarrativePhase('phase3_confirmed');
      playStarkChime();
    } else if (!user && !authLoading && narrativePhase === 'phase5_online') {
      // User signed out
      setNarrativePhase('phase0_dormant');
      setEntranceStep('ready');
      setTitleRevealCount(TITLE_CHARS.length);
    }
  }, [user, authLoading, narrativePhase]);

  // ── Auto-advance sequence: Phase 3 (Confirmed) -> Phase 3.5 (Intelligence Selection) ──
  useEffect(() => {
    if (narrativePhase === 'phase3_confirmed') {
      const timer = setTimeout(() => {
        setNarrativePhase('phase3_5_selection');
      }, reducedMotion ? 200 : 700);
      return () => clearTimeout(timer);
    }

    if (narrativePhase === 'phase4_booting') {
      const timer = setTimeout(() => {
        setNarrativePhase('phase5_online');
      }, reducedMotion ? 250 : 900);
      return () => clearTimeout(timer);
    }
  }, [narrativePhase, reducedMotion]);

  // Initial landing entrance choreographies for cold visits
  useEffect(() => {
    if (user || narrativePhase !== 'phase0_dormant') return;

    const timers: NodeJS.Timeout[] = [];
    timers.push(setTimeout(() => setEntranceStep('seed'), 250));
    timers.push(setTimeout(() => setEntranceStep('bloom'), 600));
    timers.push(setTimeout(() => setEntranceStep('core'), 1050));
    timers.push(setTimeout(() => setEntranceStep('title'), 1550));
    timers.push(setTimeout(() => setEntranceStep('ready'), 2150));

    return () => timers.forEach(clearTimeout);
  }, [user, narrativePhase]);

  // Character-by-character scan-in for title
  useEffect(() => {
    if (entranceStep !== 'title' && entranceStep !== 'ready') return;
    if (titleRevealCount < TITLE_CHARS.length) {
      const timer = setTimeout(() => {
        setTitleRevealCount((prev) => prev + 1);
      }, 55);
      return () => clearTimeout(timer);
    }
  }, [entranceStep, titleRevealCount]);

  const entranceIndex = useMemo(() => {
    const map: Record<LandingEntranceStep, number> = {
      black: 0,
      seed: 1,
      bloom: 2,
      core: 3,
      title: 4,
      ready: 5,
    };
    return map[entranceStep];
  }, [entranceStep]);

  // ── Operator Identity Resolution ──
  const rawName = profile?.display_name || user?.displayName;
  const email = profile?.email || user?.email || '';
  let resolvedName = rawName?.trim();
  if (!resolvedName && email) {
    const emailPrefix = email.split('@')[0];
    resolvedName = emailPrefix
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const firstName = resolvedName ? resolvedName.split(' ')[0] : 'Operator';

  // ── Handshake Trigger Handler ──
  const handleStartHandshake = useCallback(async () => {
    setCustomAuthError(null);
    setNarrativePhase('phase1_handshake');

    // 600ms perceivable initiation window for button morph & ring acceleration
    await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 120 : 600));

    setNarrativePhase('phase2_verifying');

    try {
      // If in development mode and URL parameter ?auth=demo or flag is present, simulate biometric verification latency & sign in
      if (
        process.env.NODE_ENV === 'development' &&
        typeof window !== 'undefined' &&
        (window.location.search.includes('auth=demo') ||
          window.location.search.includes('demo=1') ||
          (window as any).__DEV_SIMULATE_LOGIN__)
      ) {
        // Hold in Phase 2 Verifying for 1.8s so the user/recording can clearly see the amber radar sweep and "VERIFYING BIOMETRIC SIGNATURE..."
        await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 400 : 1800));
        if (devSignIn) {
          await devSignIn('Hari Prassath');
        }
        return;
      }

      const auth = getFirebaseAuth();
      const provider = getGoogleProvider();
      await signInWithPopup(auth, provider);
      // Firebase auth triggers onAuthStateChanged which moves to phase3_confirmed
    } catch (err: any) {
      console.warn('[Handshake] Authentication failed or cancelled:', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setCustomAuthError('Authentication handshake cancelled by operator.');
      } else {
        setCustomAuthError('Signal lost, sir — let\'s try that again.');
      }
      setNarrativePhase('phase0_dormant');
    }
  }, [reducedMotion, devSignIn]);

  // Expose global trigger in development for testing / automation
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      (window as any).__TRIGGER_BIOMETRIC_HANDSHAKE__ = handleStartHandshake;
    }
  }, [handleStartHandshake]);

  const {
    messages,
    isLoading,
    isStreaming,
    isHistoryLoading,
    error,
    providerUsed,
    sendMessage,
    clearChat,
    setInitialGreeting,
  } = useChat();

  const {
    speak,
    stop: stopSpeaking,
    queueSentence,
    clearQueue: clearTtsQueue,
    isSpeaking,
    isSupported: ttsSupported,
  } = useSpeechSynthesis(persona);

  // ── Load persisted operator persona from Supabase on authentication ──
  useEffect(() => {
    if (!user) return;
    const fetchSettings = async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/settings', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.settings?.voice_persona) {
            setPersona(data.settings.voice_persona);
            if (typeof window !== 'undefined') {
              localStorage.setItem('jarvis_voice_persona', data.settings.voice_persona);
            }
          }
          if (data.settings?.clearance_level) {
            setClearanceLevel(data.settings.clearance_level);
          }
        }
      } catch (e) {
        console.warn('[Home] Failed to load operator settings:', e);
      }
    };
    fetchSettings();
  }, [user]);

  // ── Handle Persona Change with instant UI update & background Supabase save ──
  const handlePersonaChange = useCallback(
    async (newPersona: VoicePersona) => {
      setPersona(newPersona);
      if (typeof window !== 'undefined') {
        localStorage.setItem('jarvis_voice_persona', newPersona);
      }
      if (user) {
        try {
          const idToken = await user.getIdToken();
          await fetch('/api/settings', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ voice_persona: newPersona }),
          });
        } catch (e) {
          console.warn('[Home] Failed to persist voice persona:', e);
        }
      }
    },
    [user]
  );

  const lastAssistantResponseRef = useRef<{ text: string; timestamp: number } | null>(null);

  // Voice recognition callback
  const handleSpeechComplete = useCallback(
    (text: string) => {
      console.log('[Page:VoicePipeline] 🎙️ handleSpeechComplete received speech text:', text);

      // 1. Immediately stop any active speech synthesis (barge-in / interruption)
      stopSpeaking();

      // 2. Circuit breaker against self-echo
      if (lastAssistantResponseRef.current) {
        const elapsed = Date.now() - lastAssistantResponseRef.current.timestamp;
        if (isEchoArtifact(text, lastAssistantResponseRef.current.text, elapsed)) {
          console.warn('[Page:VoicePipeline] 🛑 Intercepted self-echo artifact. Discarding:', text);
          diagnosticLogger.log('speech', 'Echo artifact intercepted by circuit breaker', {
            text,
            elapsedMs: elapsed,
            matchedSnippet: lastAssistantResponseRef.current.text.slice(0, 50),
          });
          return;
        }
      }

      console.log('[Page:VoicePipeline] 📨 Forwarding to useChat sendMessage...');
      sendMessage(text, persona);
      setSessionQueryCount((c) => c + 1);
    },
    [sendMessage, stopSpeaking, persona]
  );

  // Barge-In callback
  const handleBargeIn = useCallback(() => {
    console.log('[Page:VoicePipeline] ⚡ User barge-in triggered -> stopping speech');
    stopSpeaking();
  }, [stopSpeaking]);

  const {
    isMicKilled,
    toggleMicKill,
    interimTranscript,
    isListening,
    isUserSpeaking,
    isMuted,
    isSupported: sttSupported,
    permissionStatus,
    isTapToTalk,
    modeReason,
    isBackgrounded,
    triggerTapToTalk,
    toggleMute,
  } = useSpeechRecognition({
    onSpeechComplete: handleSpeechComplete,
    onBargeIn: handleBargeIn,
    isSpeaking,
    isLoading,
    silenceDebounceMs: 800,
    initialMuted: false,
  });

  const [chatExpanded, setChatExpanded] = useState(false);
  const lastSpokenIndexRef = useRef<number>(-1);
  const greetedRef = useRef(false);
  const initialHistoryProcessedRef = useRef(false);

  // Sync lastSpokenIndex when past history is loaded from Supabase
  useEffect(() => {
    if (!isHistoryLoading && !initialHistoryProcessedRef.current) {
      initialHistoryProcessedRef.current = true;
      if (messages.length > 0) {
        lastSpokenIndexRef.current = messages.length - 1;
      }
    }
  }, [isHistoryLoading, messages.length]);

  // ── Greet authenticated user synchronized with Phase 5 Operator Online ──
  useEffect(() => {
    if (
      narrativePhase !== 'phase5_online' ||
      !user ||
      isHistoryLoading ||
      greetedRef.current ||
      messages.length > 0
    ) {
      return;
    }
    greetedRef.current = true;

    const fallbackGreeting =
      persona === 'friday'
        ? `Hey there, ${firstName}. All tactical systems are online and listening. What are we working on today?`
        : `Good day, ${firstName}. All systems are online and listening. How may I assist you today?`;

    // Asynchronously fetch contextual dynamic greeting (Time of Day + Recent Topic + Calendar)
    const loadDynamicGreeting = async () => {
      try {
        const idToken = await user.getIdToken();
        const headers: Record<string, string> = {
          Authorization: `Bearer ${idToken}`,
        };
        if (googleAccessToken) {
          headers['x-google-access-token'] = googleAccessToken;
        }

        const res = await fetch(`/api/greeting?persona=${encodeURIComponent(persona)}`, {
          headers,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.greeting && typeof data.greeting === 'string') {
            lastAssistantResponseRef.current = { text: data.greeting, timestamp: Date.now() };
            setInitialGreeting(data.greeting);
            return;
          }
        }
      } catch (err) {
        console.warn('[Home] Dynamic greeting fetch fallback:', err);
      }

      // Fallback greeting if network delay or error
      lastAssistantResponseRef.current = { text: fallbackGreeting, timestamp: Date.now() };
      setInitialGreeting(fallbackGreeting);
    };

    loadDynamicGreeting();
  }, [
    user,
    narrativePhase,
    firstName,
    isHistoryLoading,
    messages.length,
    setInitialGreeting,
    persona,
    googleAccessToken,
  ]);


  // Determine JARVIS state dynamically without effect loops (with priority to receiving during file upload/drag)
  const jarvisState: JarvisState = isOrbReceiving
    ? 'receiving'
    : isSpeaking
    ? 'speaking'
    : isLoading
    ? 'thinking'
    : !isMicKilled && (isUserSpeaking || (isListening && !isMuted))
    ? 'listening'
    : 'idle';

  // ── Drag and Drop handlers for central Orb holographic target ──
  const handleOrbDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOrbReceiving(true);
  }, []);

  const handleOrbDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOrbReceiving(true);
  }, []);

  const handleOrbDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsOrbReceiving(false);
  }, []);

  const handleOrbDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) {
        setIsOrbReceiving(false);
        return;
      }

      setIsOrbReceiving(true);
      try {
        const extracted: ChatAttachment[] = [];
        for (let i = 0; i < files.length; i++) {
          const att = await processUploadedFile(files[i]);
          extracted.push(att);
        }

        if (extracted.length > 0) {
          stopSpeaking();
          setChatExpanded(true); // Automatically expand live transcript so operator observes real-time vision telemetry
          await sendMessage('', persona, extracted);
        }
      } catch (err) {
        console.error('[Home] Error parsing dropped files on orb:', err);
      } finally {
        setIsOrbReceiving(false);
      }
    },
    [sendMessage, persona, stopSpeaking]
  );

  // ── Streaming Sentence-Boundary TTS ──
  // Track which sentences have already been queued during streaming
  const lastQueuedSentenceIdxRef = useRef(0);
  const streamingMsgIndexRef = useRef(-1);

  // Sentence boundary detector: splits on .!? followed by space or end-of-string
  const SENTENCE_BOUNDARY_REGEX = /[.!?](?:\s|$)/g;

  useEffect(() => {
    if (messages.length === 0) return;
    const lastIdx = messages.length - 1;
    const lastMsg = messages[lastIdx];

    if (lastMsg.role !== 'assistant' || !ttsSupported) return;

    // During streaming: progressively queue completed sentences
    if (isStreaming && lastMsg.content) {
      // Reset sentence tracker if this is a new streaming message
      if (streamingMsgIndexRef.current !== lastIdx) {
        console.log(`[Page:TTS] 🎬 Started streaming message at index ${lastIdx}`);
        streamingMsgIndexRef.current = lastIdx;
        lastQueuedSentenceIdxRef.current = 0;
        lastSpokenIndexRef.current = lastIdx; // Mark as being handled
      }

      // Find all sentence boundaries in current content
      const content = lastMsg.content;
      const boundaries: number[] = [];
      let match;
      const regex = new RegExp(SENTENCE_BOUNDARY_REGEX.source, 'g');
      while ((match = regex.exec(content)) !== null) {
        boundaries.push(match.index + match[0].length);
      }

      // Queue any newly completed sentences
      for (let i = lastQueuedSentenceIdxRef.current; i < boundaries.length; i++) {
        const start = i === 0 ? 0 : boundaries[i - 1];
        const end = boundaries[i];
        const sentence = content.slice(start, end).trim();
        if (sentence.length > 0) {
          console.log(`[Page:TTS] 🗣️ Queuing completed streaming sentence [${i + 1}/${boundaries.length}]: "${sentence}"`);
          queueSentence(sentence, persona);
        }
      }
      lastQueuedSentenceIdxRef.current = boundaries.length;

      // Update echo reference progressively
      lastAssistantResponseRef.current = { text: content, timestamp: Date.now() };
      return;
    }

    // Stream just finished — queue all newly completed sentences and any remaining un-spoken tail
    if (!isStreaming && streamingMsgIndexRef.current === lastIdx && lastMsg.content) {
      console.log(`[Page:TTS] 🏁 Stream finished for message at index ${lastIdx}. Flushing remaining sentences & tail.`);
      const content = lastMsg.content;
      const boundaries: number[] = [];
      let match;
      const regex = new RegExp(SENTENCE_BOUNDARY_REGEX.source, 'g');
      while ((match = regex.exec(content)) !== null) {
        boundaries.push(match.index + match[0].length);
      }

      // Queue any newly completed sentences that arrived with the final chunk
      for (let i = lastQueuedSentenceIdxRef.current; i < boundaries.length; i++) {
        const start = i === 0 ? 0 : boundaries[i - 1];
        const end = boundaries[i];
        const sentence = content.slice(start, end).trim();
        if (sentence.length > 0) {
          console.log(`[Page:TTS] 🗣️ Flushing final sentence: "${sentence}"`);
          queueSentence(sentence, persona);
        }
      }
      lastQueuedSentenceIdxRef.current = boundaries.length;

      // Queue the tail (text after the last sentence boundary without a trailing period/mark)
      const lastBoundary = boundaries.length > 0 ? boundaries[boundaries.length - 1] : 0;
      if (lastBoundary < content.length) {
        const tail = content.slice(lastBoundary).trim();
        if (tail.length > 0) {
          console.log(`[Page:TTS] 🗣️ Flushing final tail: "${tail}"`);
          queueSentence(tail, persona);
        }
      }

      streamingMsgIndexRef.current = -1;
      lastAssistantResponseRef.current = { text: content, timestamp: Date.now() };
      return;
    }

    // Non-streaming / single-payload: speak full message (greetings, history replay, fallback)
    if (!isStreaming && lastSpokenIndexRef.current !== lastIdx) {
      console.log(`[Page:TTS] 📢 Speaking non-streaming full message at index ${lastIdx}: "${lastMsg.content.slice(0, 50)}..."`);
      lastSpokenIndexRef.current = lastIdx;
      lastAssistantResponseRef.current = { text: lastMsg.content, timestamp: Date.now() };
      speak(lastMsg.content, persona);
    }
  }, [messages, ttsSupported, speak, queueSentence, persona, isStreaming]);

  const handleSendFromChat = useCallback(
    (content: string, attachments?: ChatAttachment[]) => {
      stopSpeaking();
      sendMessage(content, persona, attachments);
      setStagedAttachments([]);
      setSessionQueryCount((c) => c + 1);
    },
    [sendMessage, stopSpeaking, persona]
  );

  const handleNewChat = useCallback(() => {
    stopSpeaking();
    lastSpokenIndexRef.current = -1;
    greetedRef.current = false;
    clearChat();
  }, [clearChat, stopSpeaking]);

  const handleInitiateSignOut = useCallback(() => {
    stopSpeaking();
    setIsSessionDebriefOpen(true);
  }, [stopSpeaking]);

  const handleCompleteSignOut = useCallback(async () => {
    stopSpeaking();
    clearChat();
    setIsSessionDebriefOpen(false);
    await signOut();
    setNarrativePhase('phase0_dormant');
    setEntranceStep('ready');
    setTitleRevealCount(TITLE_CHARS.length);
  }, [signOut, clearChat, stopSpeaking]);

  const handleAccountPurged = useCallback(async () => {
    stopSpeaking();
    clearChat();
    setIsPrivacyModalOpen(false);
    await signOut();
    setNarrativePhase('phase0_dormant');
    setEntranceStep('ready');
    setTitleRevealCount(TITLE_CHARS.length);
    setPurgeNotification('ALL STORED RECORDS PERMANENTLY EXPUNGED. OPERATOR SIGNED OUT.');
    setTimeout(() => {
      setPurgeNotification(null);
    }, 6000);
  }, [signOut, clearChat, stopSpeaking]);

  // ── Handle Persona Selection in Phase 3.5 ──
  const handleSelectPersona = useCallback(
    (chosenPersona: VoicePersona) => {
      handlePersonaChange(chosenPersona);
      setNarrativePhase('phase4_booting');
    },
    [handlePersonaChange]
  );

  // ── Map Narrative Phase to Orb's internal boot phase ──
  const orbBootPhase: BootNarrativePhase = useMemo(() => {
    switch (narrativePhase) {
      case 'phase1_handshake':
        return 'handshake';
      case 'phase2_verifying':
        return 'verifying';
      case 'phase3_confirmed':
        return 'confirmed';
      case 'phase4_booting':
        return 'booting';
      case 'phase5_online':
        return 'online';
      case 'phase0_dormant':
      case 'phase3_5_selection':
      default:
        return 'dormant';
    }
  }, [narrativePhase]);

  const isLandingMode =
    narrativePhase === 'phase0_dormant' ||
    narrativePhase === 'phase1_handshake' ||
    narrativePhase === 'phase2_verifying' ||
    narrativePhase === 'phase3_confirmed';
  const isSelectionMode = narrativePhase === 'phase3_5_selection';
  const isTransitioning = narrativePhase === 'phase4_booting';
  const isHudActive = narrativePhase === 'phase5_online';

  return (
    <div className="min-h-screen min-h-dvh h-dvh bg-black hud-grid-overlay relative overflow-hidden flex flex-col justify-between select-none">
      {/* ── Dynamic Cinematic Atmospheric Field ── */}
      <AtmosphericField mode={isLandingMode || isSelectionMode ? 'landing' : 'active'} />

      {/* ═══ HUD OVERLAY (TOP BAR & VIEWFINDFERS) — Animates in during Phase 4 & 5 ═══ */}
      <AnimatePresence>
        {(isTransitioning || isHudActive) && (
          <motion.div
            key="hud-top-bar"
            initial={{ opacity: 0, y: reducedMotion ? 0 : -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -14 }}
            transition={{ duration: reducedMotion ? 0.2 : 0.5, ease: 'easeOut' }}
            className="fixed inset-0 pointer-events-none z-30"
          >
            <HudOverlay
              providerUsed={providerUsed}
              userName={profile?.display_name || user?.displayName || user?.email?.split('@')[0] || 'Operator'}
              persona={persona}
              clearanceLevel={clearanceLevel || profile?.clearance_level || 9}
              isMicKilled={isMicKilled}
              onToggleMicKill={toggleMicKill}
              onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
              onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
              onPersonaChange={handlePersonaChange}
              onNewChat={handleNewChat}
              onSignOut={handleInitiateSignOut}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MAIN STAGE: THE CONTINUOUS CENTERPIECE ORB & STAGED CONTENT ═══ */}
      <main
        className={`relative z-20 flex-1 flex flex-col items-center justify-center px-2 sm:px-4 ${
          isSelectionMode ? 'py-1 sm:py-2' : '-translate-y-1 sm:-translate-y-4'
        }`}
      >
        <div className={`flex flex-col items-center w-full transition-[max-width] duration-500 ${isSelectionMode ? 'max-w-4xl' : 'max-w-lg'}`}>

          {/* ═══ SEED POINT OF LIGHT (Phase 0 entrance only) ═══ */}
          {isLandingMode && entranceIndex === 1 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 3, opacity: 0 }}
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 8,
                height: 8,
                background: '#4DE8E8',
                boxShadow:
                  '0 0 35px 14px rgba(77, 232, 232, 0.8), 0 0 70px 28px rgba(77, 232, 232, 0.35)',
              }}
            />
          )}

          {/* ═══ THE CONTINUOUS HOLOGRAPHIC ORB (Never Unmounted) — Multi-Modal Drag & Drop Target ═══ */}
          <motion.div
            layout="position"
            onDragOver={handleOrbDragOver}
            onDragEnter={handleOrbDragEnter}
            onDragLeave={handleOrbDragLeave}
            onDrop={handleOrbDrop}
            className={`${
              isSelectionMode
                ? 'absolute pointer-events-none opacity-0 scale-0 -z-50'
                : 'relative flex items-center justify-center cursor-pointer group'
            } ${isOrbReceiving ? 'ring-2 ring-[#4DE8E8]/60 ring-offset-8 ring-offset-black rounded-full' : ''}`}
            initial={false}
            animate={{
              scale: isLandingMode
                ? entranceIndex >= 3
                  ? 0.84
                  : entranceIndex >= 2
                  ? 0.65
                  : 0.1
                : isSelectionMode
                ? 0
                : isOrbReceiving
                ? 1.05
                : 1,
              y: isLandingMode ? 0 : 0,
              opacity: isLandingMode
                ? entranceIndex >= 2
                  ? 1
                  : 0
                : isSelectionMode
                ? 0
                : 1,
            }}
            transition={{
              scale: {
                type: 'spring',
                stiffness: reducedMotion ? 300 : 220,
                damping: reducedMotion ? 25 : 22,
                duration: reducedMotion ? 0.25 : 0.85,
              },
              y: {
                type: 'spring',
                stiffness: 240,
                damping: 24,
                duration: 0.85,
              },
              opacity: { duration: 0.35 },
            }}
          >
            <JarvisOrb
              state={jarvisState}
              bootPhase={orbBootPhase}
              persona={persona}
              hideLabel={!isHudActive}
              isMicKilled={isMicKilled}
            />
          </motion.div>

          {/* ═══ LANDING CHROME: Title, Tagline, Verification Status & Buttons ═══ */}
          <AnimatePresence mode="wait">
            {isLandingMode && (
              <motion.div
                key="landing-chrome"
                initial={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  y: reducedMotion ? 0 : -20,
                  filter: reducedMotion ? 'none' : 'blur(4px)',
                  transition: { duration: reducedMotion ? 0.2 : 0.45, ease: 'easeInOut' },
                }}
                className="flex flex-col items-center w-full"
              >
                {/* Title Scan-In ("J.A.R.V.I.S") */}
                <motion.div
                  className="mt-1 sm:mt-2 flex items-center justify-center transition-opacity duration-300"
                  animate={{
                    opacity:
                      narrativePhase === 'phase2_verifying'
                        ? 0.25
                        : entranceIndex >= 4
                        ? 1
                        : 0,
                  }}
                  transition={{ duration: 0.4 }}
                >
                  <h1 className="flex items-center text-3xl sm:text-4xl md:text-5xl font-light tracking-[0.22em] sm:tracking-[0.35em] md:tracking-[0.4em] font-mono select-none">
                    {TITLE_CHARS.map((char, i) => {
                      const isRevealed = entranceIndex >= 4 && i < titleRevealCount;
                      return (
                        <span
                          key={i}
                          className="inline-block transition-all duration-200 ease-out"
                          style={{
                            color: '#e0ffff',
                            opacity: isRevealed ? 1 : 0,
                            transform: isRevealed ? 'translateX(0)' : 'translateX(8px)',
                            filter: isRevealed ? 'blur(0px)' : 'blur(6px)',
                            textShadow: isRevealed
                              ? '0 0 14px rgba(77, 232, 232, 0.8), 0 0 30px rgba(77, 232, 232, 0.4), 0 0 55px rgba(77, 232, 232, 0.2)'
                              : 'none',
                          }}
                        >
                          {char}
                        </span>
                      );
                    })}
                  </h1>
                </motion.div>

                {/* Subtitle Tagline / Verification Status / Confirmed Status */}
                <div className="h-9 mt-2 flex items-center justify-center text-center">
                  <AnimatePresence mode="wait">
                    {narrativePhase === 'phase2_verifying' ? (
                      <motion.div
                        key="verifying-status"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center gap-2 text-[#F59E0B] font-mono text-[11px] sm:text-xs tracking-[0.22em] uppercase font-semibold drop-shadow-[0_0_10px_rgba(245,158,11,0.6)]"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-ping" />
                        <span>AUTHENTICATING OPERATOR CLEARANCE</span>
                        <span className="inline-flex gap-0.5 tracking-normal">
                          <span className="animate-pulse">.</span>
                          <span className="animate-pulse delay-100">.</span>
                          <span className="animate-pulse delay-200">.</span>
                        </span>
                      </motion.div>
                    ) : narrativePhase === 'phase3_confirmed' ? (
                      <motion.div
                        key="confirmed-status"
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.05 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        className="flex items-center gap-2 text-[#00FFFF] font-mono text-[11px] sm:text-xs tracking-[0.24em] uppercase font-bold drop-shadow-[0_0_15px_rgba(0,255,255,0.85)]"
                      >
                        <svg className="w-4 h-4 text-[#00FFFF] flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span>IDENTITY CONFIRMED — WELCOME, {firstName.toUpperCase()}</span>
                      </motion.div>
                    ) : (
                      <motion.p
                        key="tagline"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{
                          opacity: entranceIndex >= 5 ? 1 : 0,
                          y: entranceIndex >= 5 ? 0 : 6,
                        }}
                        exit={{ opacity: 0 }}
                        className="text-[10px] sm:text-xs font-mono tracking-[0.14em] sm:tracking-[0.22em] text-[#4DE8E8]/60 uppercase text-center max-w-[290px] sm:max-w-none"
                        style={{
                          textShadow: '0 0 8px rgba(77, 232, 232, 0.3)',
                        }}
                      >
                        Just A Rather Very Intelligent System
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Staggered Sign In Button with Morphing Handshake State */}
                <motion.div
                  className="mt-4 sm:mt-6 w-full max-w-[300px] sm:max-w-xs flex justify-center"
                  animate={{
                    opacity: entranceIndex >= 5 ? 1 : 0,
                    y: entranceIndex >= 5 ? 0 : 20,
                  }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                >
                  <SignInButton
                    isHandshaking={narrativePhase === 'phase1_handshake'}
                    isVerifying={narrativePhase === 'phase2_verifying'}
                    onStartHandshake={handleStartHandshake}
                    customError={customAuthError}
                    onRetry={handleStartHandshake}
                  />
                </motion.div>

                {/* In-Universe Footer Brand Line (3-tap gesture toggles diagnostic overlay) */}
                <motion.p
                  onClick={handleDebugGesture}
                  className="mt-4 sm:mt-6 text-[10px] sm:text-[11px] font-mono tracking-wider text-center select-none cursor-pointer"
                  animate={{
                    opacity: entranceIndex >= 5 ? 1 : 0,
                  }}
                  transition={{ duration: 0.6 }}
                >
                  <span className="text-[#4DE8E8]/40">Powered by </span>
                  <span
                    className="text-[#4DE8E8]/75 hover:text-[#4DE8E8] transition-all duration-300 tracking-widest font-semibold inline-block relative group"
                    title="Stark Industries // Advanced Systems Division (Tap 3x for Diagnostics)"
                  >
                    Stark Industries
                    <span className="absolute -bottom-0.5 left-0 w-0 h-[1px] bg-[#4DE8E8] transition-all duration-300 group-hover:w-full opacity-70 shadow-[0_0_8px_#4DE8E8]" />
                  </span>
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ PHASE 3.5: INTELLIGENCE SELECTION SCREEN ═══ */}
          <AnimatePresence mode="wait">
            {isSelectionMode && (
              <IntelligenceSelection
                key="intelligence-selection-pod"
                operatorName={firstName}
                initialPersona={persona}
                clearanceLevel={clearanceLevel || profile?.clearance_level || 9}
                onSelect={handleSelectPersona}
                onPreviewVoice={(text, p) => speak(text, p)}
                reducedMotion={reducedMotion}
              />
            )}
          </AnimatePresence>

          {/* ═══ MAIN HUD ELEMENTS: Status Pill & Telemetry Bridge — Draw in during Phase 4 & 5 ═══ */}
          <AnimatePresence>
            {(isTransitioning || isHudActive) && (
              <motion.div
                key="hud-core-elements"
                initial={{ opacity: 0, y: reducedMotion ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reducedMotion ? 0 : 16 }}
                transition={{
                  duration: reducedMotion ? 0.2 : 0.55,
                  delay: reducedMotion ? 0 : 0.2,
                  ease: 'easeOut',
                }}
                className="flex flex-col items-center w-full"
              >
                {/* Audio Sentry Status Pill */}
                <div className="mt-2 sm:mt-2.5 flex items-center justify-center">
                  <AudioSentryToggle
                    isListening={isListening}
                    isUserSpeaking={isUserSpeaking}
                    isMuted={isMuted}
                    isMicKilled={isMicKilled}
                    isSpeaking={isSpeaking}
                    isLoading={isLoading}
                    interimTranscript={interimTranscript}
                    isSupported={sttSupported}
                    permissionStatus={permissionStatus}
                    isTapToTalk={isTapToTalk}
                    modeReason={modeReason}
                    isBackgrounded={isBackgrounded}
                    onTapToTalk={triggerTapToTalk}
                    onToggleMute={toggleMute}
                  />
                </div>

                {/* HUD Telemetry Bridge (3-tap gesture toggles diagnostic overlay) */}
                <motion.div
                  onClick={handleDebugGesture}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: reducedMotion ? 0 : 0.35, ease: 'easeOut' }}
                  className={`mt-3 sm:mt-4 flex items-center space-x-2 sm:space-x-3 text-[9px] sm:text-[10px] font-mono tracking-[0.20em] sm:tracking-[0.24em] select-none transition-colors duration-300 cursor-pointer ${
                    persona === 'friday' ? 'text-amber-300/40' : 'text-[#4DE8E8]/40'
                  }`}
                  title="Tap 3 times to toggle Mobile Diagnostics HUD"
                >
                  <div
                    className={`w-10 sm:w-28 h-[1px] bg-gradient-to-r from-transparent to-transparent ${
                      persona === 'friday' ? 'via-amber-400/35' : 'via-[#4DE8E8]/35'
                    }`}
                  />
                  <span className="flex items-center space-x-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                        persona === 'friday'
                          ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                          : 'bg-[#4DE8E8]'
                      }`}
                    />
                    <span>{persona === 'friday' ? 'FRIDAY.ONLINE' : isTapToTalk ? 'VOICE.TOUCH' : 'SYS.ACTIVE'}</span>
                    <span className="text-[#4DE8E8]/20">|</span>
                    <span className="hidden sm:inline">{isTapToTalk ? 'IOS.GUARD' : 'VAD.AUTO'}</span>
                    <span className="hidden sm:inline text-[#4DE8E8]/20">|</span>
                    <span>44.1kHz</span>
                  </span>
                  <div
                    className={`w-10 sm:w-28 h-[1px] bg-gradient-to-r from-transparent to-transparent ${
                      persona === 'friday' ? 'via-amber-400/35' : 'via-[#4DE8E8]/35'
                    }`}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ═══ BOTTOM INPUT BAR WITH EXPANDABLE TRANSCRIPT ═══ */}
      <AnimatePresence>
        {(isTransitioning || isHudActive) && (
          <motion.div
            key="chat-panel-container"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : 28 }}
            transition={{
              duration: reducedMotion ? 0.2 : 0.6,
              delay: reducedMotion ? 0 : 0.35,
              ease: 'easeOut',
            }}
          >
            <ChatPanel
              messages={messages}
              isLoading={isLoading}
              isStreaming={isStreaming}
              error={error}
              onSend={handleSendFromChat}
              isExpanded={chatExpanded}
              onToggle={() => setChatExpanded((prev) => !prev)}
              persona={persona}
              stagedAttachments={stagedAttachments}
              onRemoveStagedAttachment={(id) => setStagedAttachments((prev) => prev.filter((a) => a.id !== id))}
              onAddStagedAttachments={(atts) => setStagedAttachments((prev) => [...prev, ...atts])}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MOBILE TELEMETRY & DIAGNOSTICS OVERLAY ═══ */}
      <MobileDebugOverlay forceVisible={debugOverlayVisible} />

      {/* ═══ PRIVACY & DATA GOVERNANCE MODAL ═══ */}
      <PrivacyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
        getIdToken={async () => (user ? await user.getIdToken() : null)}
        onAccountPurged={handleAccountPurged}
        persona={persona}
        reducedMotion={reducedMotion}
      />

      {/* ═══ COMMAND PALETTE (CMD+K / CTRL+K) ═══ */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        persona={persona}
        onSelectPrompt={(prompt) => {
          stopSpeaking();
          sendMessage(prompt, persona);
          setSessionQueryCount((c) => c + 1);
        }}
        onSwitchPersona={handlePersonaChange}
        onToggleMicKill={toggleMicKill}
        isMicKilled={isMicKilled}
        onOpenPrivacy={() => setIsPrivacyModalOpen(true)}
        onNewChat={handleNewChat}
        onInitiateSignOut={handleInitiateSignOut}
        reducedMotion={reducedMotion}
      />

      {/* ═══ MISSION DEBRIEF ON LOGOUT ═══ */}
      <SessionDebrief
        isOpen={isSessionDebriefOpen}
        operatorName={firstName}
        persona={persona}
        clearanceLevel={clearanceLevel || profile?.clearance_level || 9}
        queryCount={sessionQueryCount}
        sessionStartTime={sessionStartTime}
        onCompleteSignOut={handleCompleteSignOut}
        reducedMotion={reducedMotion}
      />

      {/* ═══ PURGE TOAST NOTIFICATION ═══ */}
      <AnimatePresence>
        {purgeNotification && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-red-950/90 border border-red-500/60 shadow-[0_0_25px_rgba(239,68,68,0.4)] text-red-200 font-mono text-xs tracking-wider flex items-center gap-3 backdrop-blur-md pointer-events-none"
          >
            <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
            <span>{purgeNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
