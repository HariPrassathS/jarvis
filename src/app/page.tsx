'use client';

// ──────────────────────────────────────────────
// JARVIS — Main Page
// Assembles: Auth, Orb, HUD, Voice, Chat, Dual Persona System
// ──────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import JarvisOrb from '@/components/hud/JarvisOrb';
import HudOverlay from '@/components/hud/HudOverlay';
import ChatPanel from '@/components/chat/ChatPanel';
import AudioSentryToggle from '@/components/voice/AudioSentryToggle';
import AtmosphericField from '@/components/hud/AtmosphericField';
import BootSequenceLanding from '@/components/auth/BootSequenceLanding';
import type { JarvisState, VoicePersona } from '@/types';

export default function Home() {
  const { user, profile, loading: authLoading, signOut } = useAuth();

  // ── Dual Persona State (JARVIS / FRIDAY) with instant LocalStorage boot ──
  const [persona, setPersona] = useState<VoicePersona>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('jarvis_voice_persona');
      if (stored === 'friday' || stored === 'jarvis') return stored;
    }
    return 'jarvis';
  });

  const {
    messages,
    isLoading,
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

  // Voice recognition callback — sends message directly on VAD speech completion (~800ms silence)
  const handleSpeechComplete = useCallback(
    (text: string) => {
      stopSpeaking();
      sendMessage(text, persona);
    },
    [sendMessage, stopSpeaking, persona]
  );

  // Barge-In callback — immediately kills TTS playback when user interrupts JARVIS
  const handleBargeIn = useCallback(() => {
    stopSpeaking();
  }, [stopSpeaking]);

  const {
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

  // ── Sync lastSpokenIndex when past history is loaded from Supabase to prevent re-speaking old turns ──
  useEffect(() => {
    if (!isHistoryLoading && !initialHistoryProcessedRef.current) {
      initialHistoryProcessedRef.current = true;
      if (messages.length > 0) {
        lastSpokenIndexRef.current = messages.length - 1;
      }
    }
  }, [isHistoryLoading, messages.length]);

  // ── Greet authenticated user only on clean/empty session start ──
  useEffect(() => {
    if (!user || isHistoryLoading || greetedRef.current || messages.length > 0) return;
    greetedRef.current = true;

    const rawName = profile?.display_name || user.displayName;
    const email = profile?.email || user.email || '';
    let resolvedName = rawName?.trim();
    if (!resolvedName && email) {
      const emailPrefix = email.split('@')[0];
      resolvedName = emailPrefix
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    const firstName = resolvedName ? resolvedName.split(' ')[0] : 'Sir';

    const greeting =
      persona === 'friday'
        ? `Hey there, ${firstName}. All tactical systems are online and listening. What are we working on today?`
        : `Good day, ${firstName}. All systems are online and listening. How may I assist you today?`;

    setInitialGreeting(greeting);
  }, [user, profile, isHistoryLoading, messages.length, setInitialGreeting, persona]);

  // ── Determine JARVIS state dynamically without effect loops ──
  const jarvisState: JarvisState = isSpeaking
    ? 'speaking'
    : isLoading
    ? 'thinking'
    : isUserSpeaking || (isListening && !isMuted)
    ? 'listening'
    : 'idle';

  // ── Speak assistant response exactly once per new message ──
  useEffect(() => {
    if (messages.length === 0) return;
    const lastIdx = messages.length - 1;
    const lastMsg = messages[lastIdx];
    if (
      lastMsg.role === 'assistant' &&
      ttsSupported &&
      lastSpokenIndexRef.current !== lastIdx
    ) {
      lastSpokenIndexRef.current = lastIdx;
      speak(lastMsg.content, persona);
    }
  }, [messages, ttsSupported, speak, persona]);

  const handleSendFromChat = useCallback(
    (content: string) => {
      stopSpeaking();
      sendMessage(content, persona);
    },
    [sendMessage, stopSpeaking, persona]
  );

  const handleNewChat = useCallback(() => {
    stopSpeaking();
    lastSpokenIndexRef.current = -1;
    greetedRef.current = false;
    clearChat();
  }, [clearChat, stopSpeaking]);

  // ── Auth Loading State ──
  if (authLoading) {
    return (
      <div className="min-h-screen min-h-dvh flex items-center justify-center bg-[var(--jarvis-bg-primary)]">
        <motion.div
          className="w-16 h-16 rounded-full border-2 border-cyan-500/30"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        >
          <div className="w-full h-full rounded-full border-t-2 border-cyan-400" />
        </motion.div>
      </div>
    );
  }

  // ── Sign-In Screen (Cinematic Boot Sequence) ──
  if (!user) {
    return <BootSequenceLanding />;
  }

  // ── Main Interface ──
  return (
    <div className="min-h-screen min-h-dvh h-dvh bg-black hud-grid-overlay relative overflow-hidden flex flex-col justify-between select-none">
      {/* Dynamic Cinematic Atmospheric Field */}
      <AtmosphericField mode="active" />

      {/* Top Bar HUD & Corner Viewfinders */}
      <HudOverlay
        providerUsed={providerUsed}
        userName={profile?.display_name || user.displayName || user.email?.split('@')[0] || 'Operator'}
        persona={persona}
        onPersonaChange={handlePersonaChange}
        onNewChat={handleNewChat}
        onSignOut={signOut}
      />

      {/* Main Center Stage: Volumetric Orb, Equalizer, State Label, Status Pill & HUD Telemetry */}
      <main className="relative z-20 flex-1 flex flex-col items-center justify-center px-2 sm:px-4 -translate-y-1 sm:-translate-y-4">
        <div className="flex flex-col items-center">
          {/* Centerpiece Orb */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.09, ease: 'easeOut' }}
          >
            <JarvisOrb state={jarvisState} />
          </motion.div>

          {/* Status Pill */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18, ease: 'easeOut' }}
            className="mt-2 sm:mt-2.5 flex items-center justify-center"
          >
            <AudioSentryToggle
              isListening={isListening}
              isUserSpeaking={isUserSpeaking}
              isMuted={isMuted}
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
          </motion.div>

          {/* HUD Telemetry Bridge */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.28, ease: 'easeOut' }}
            className={`mt-3 sm:mt-4 flex items-center space-x-2 sm:space-x-3 text-[9px] sm:text-[10px] font-mono tracking-[0.20em] sm:tracking-[0.24em] select-none transition-colors duration-300 ${
              persona === 'friday' ? 'text-amber-300/40' : 'text-[#4DE8E8]/40'
            }`}
          >
            <div
              className={`w-10 sm:w-28 h-[1px] bg-gradient-to-r from-transparent to-transparent ${
                persona === 'friday' ? 'via-amber-400/35' : 'via-[#4DE8E8]/35'
              }`}
            />
            <span className="flex items-center space-x-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  persona === 'friday' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-[#4DE8E8]'
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
        </div>
      </main>

      {/* Bottom Input Bar with Expandable Transcript */}
      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        error={error}
        onSend={handleSendFromChat}
        isExpanded={chatExpanded}
        onToggle={() => setChatExpanded((prev) => !prev)}
        persona={persona}
      />
    </div>
  );
}
