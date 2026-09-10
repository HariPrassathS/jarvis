'use client';

// ──────────────────────────────────────────────
// JARVIS — Main Page
// Assembles: Auth, Orb, HUD, Voice, Chat
// ──────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import type { JarvisState } from '@/types';

export default function Home() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const {
    messages,
    isLoading,
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
  } = useSpeechSynthesis();

  // Voice recognition callback — sends message directly on VAD speech completion (~800ms silence)
  const handleSpeechComplete = useCallback(
    (text: string) => {
      stopSpeaking();
      sendMessage(text);
    },
    [sendMessage, stopSpeaking]
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

  // ── Greet authenticated user according to their profile/email ──
  useEffect(() => {
    if (!user || greetedRef.current || messages.length > 0) return;
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

    const greeting = `Good day, ${firstName}. All systems are online and listening. How may I assist you today?`;
    setInitialGreeting(greeting);
  }, [user, profile, messages.length, setInitialGreeting]);

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
      speak(lastMsg.content);
    }
  }, [messages, ttsSupported, speak]);

  const handleSendFromChat = useCallback(
    (content: string) => {
      stopSpeaking();
      sendMessage(content);
    },
    [sendMessage, stopSpeaking]
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

  // ── Main JARVIS Interface ──
  return (
    <div className="min-h-screen min-h-dvh h-dvh bg-black hud-grid-overlay relative overflow-hidden flex flex-col justify-between select-none">
      {/* Dynamic Cinematic Atmospheric Field: 95 High-density Embers + Scanline Sweep + Vignette */}
      <AtmosphericField mode="active" />

      {/* Top Bar HUD & Corner Viewfinders (Entrance delay: 0ms) */}
      <HudOverlay
        providerUsed={providerUsed}
        userName={profile?.display_name || user.displayName || user.email?.split('@')[0] || 'Operator'}
        onNewChat={handleNewChat}
        onSignOut={signOut}
      />

      {/* Main Center Stage: Volumetric Orb, Equalizer, State Label, Status Pill & HUD Telemetry */}
      <main className="relative z-20 flex-1 flex flex-col items-center justify-center px-2 sm:px-4 -translate-y-1 sm:-translate-y-4">
        <div className="flex flex-col items-center">
          {/* JARVIS Centerpiece Orb (Entrance delay: ~90ms) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.09, ease: 'easeOut' }}
          >
            <JarvisOrb state={jarvisState} />
          </motion.div>

          {/* Status Pill (Always-On Sentinel or Tap-to-Talk Button - Entrance delay: ~180ms) */}
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

          {/* HUD Telemetry Bridge — Fills dead space with Stark HUD system metrics */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.28, ease: 'easeOut' }}
            className="mt-3 sm:mt-4 flex items-center space-x-2 sm:space-x-3 text-[9px] sm:text-[10px] font-mono tracking-[0.20em] sm:tracking-[0.24em] text-[#4DE8E8]/40 select-none"
          >
            <div className="w-10 sm:w-28 h-[1px] bg-gradient-to-r from-transparent via-[#4DE8E8]/35 to-transparent" />
            <span className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4DE8E8] animate-pulse" />
              <span>{isTapToTalk ? 'VOICE.TOUCH' : 'SYS.ACTIVE'}</span>
              <span className="text-[#4DE8E8]/20">|</span>
              <span className="hidden sm:inline">{isTapToTalk ? 'IOS.GUARD' : 'VAD.AUTO'}</span>
              <span className="hidden sm:inline text-[#4DE8E8]/20">|</span>
              <span>44.1kHz</span>
            </span>
            <div className="w-10 sm:w-28 h-[1px] bg-gradient-to-r from-transparent via-[#4DE8E8]/35 to-transparent" />
          </motion.div>
        </div>
      </main>

      {/* Bottom Input Bar with Expandable Transcript (Entrance delay: ~280ms / 360ms) */}
      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        error={error}
        onSend={handleSendFromChat}
        isExpanded={chatExpanded}
        onToggle={() => setChatExpanded((prev) => !prev)}
      />
    </div>
  );
}
