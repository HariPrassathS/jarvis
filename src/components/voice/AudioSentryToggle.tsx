'use client';

// ──────────────────────────────────────────────
// AudioSentryToggle — Always-On Voice Status Pill
// Visual Spec: Horizontal pill-shaped badge, dark bg, thin cyan border, rounded-full.
// Contains: small pulsing green dot, 'ALWAYS-ON VOICE [ACTIVE]' in cyan uppercase monospace, mic icon.
// Represents mute/unmute toggle for always-on listening.
// ──────────────────────────────────────────────

import { motion } from 'framer-motion';

interface AudioSentryToggleProps {
  isListening: boolean;
  isUserSpeaking: boolean;
  isMuted: boolean;
  isMicKilled?: boolean;
  isSpeaking: boolean;
  isLoading: boolean;
  interimTranscript: string;
  isSupported: boolean;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unsupported';
  isTapToTalk?: boolean;
  modeReason?: string | null;
  isBackgrounded?: boolean;
  onTapToTalk?: () => void;
  onToggleMute: () => void;
}

export default function AudioSentryToggle({
  isListening,
  isUserSpeaking,
  isMuted,
  isMicKilled = false,
  isSpeaking,
  isLoading,
  interimTranscript,
  isSupported,
  permissionStatus,
  isTapToTalk = false,
  modeReason,
  isBackgrounded = false,
  onTapToTalk,
  onToggleMute,
}: AudioSentryToggleProps) {
  if (!isSupported || permissionStatus === 'unsupported') {
    return (
      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/80 border border-red-500/40 text-[10.5px] font-mono text-red-400">
        <span>⚠️ Web Speech API not supported in browser</span>
      </div>
    );
  }

  if (permissionStatus === 'denied') {
    return (
      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/80 border border-red-500/40 text-[10.5px] font-mono text-red-300">
        <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
        <span>Microphone blocked — allow access in browser</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Real-time live transcript bubble when user is speaking */}
      {isUserSpeaking && interimTranscript && !isMicKilled && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="px-3.5 py-1 rounded-full bg-black/85 border border-[#4DE8E8]/40
                     backdrop-blur-md shadow-[0_0_20px_rgba(77,232,232,0.2)]
                     text-[11px] font-mono text-[#4DE8E8] flex items-center gap-2 max-w-[280px] sm:max-w-md text-center"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[#4DE8E8] animate-ping flex-shrink-0" />
          <span className="truncate">&ldquo;{interimTranscript}&rdquo;</span>
        </motion.div>
      )}

      {/* ── Case 0: Global Mic Kill-Switch Engaged (Highest Priority) ── */}
      {isMicKilled ? (
        <div className="flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-full bg-red-950/90 border border-red-500/80 text-[10px] sm:text-[11px] font-mono text-red-200 shadow-[0_0_25px_rgba(239,68,68,0.4)] select-none">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-ping flex-shrink-0" />
          <span className="uppercase tracking-[0.16em] font-bold">MIC TERMINATED [KILL-SWITCH ACTIVE]</span>
          <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
      ) : isBackgrounded ? (
        /* ── Case 1: Tab Backgrounded or Screen Locked ── */
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/90 border border-amber-500/40 text-[10.5px] font-mono text-amber-300/90 select-none">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="uppercase tracking-[0.14em]">MIC SUSPENDED [BACKGROUND]</span>
        </div>
      ) : isTapToTalk ? (
        /* ── Case 2: Mobile Safari Tap-to-Talk Mode ── */
        <div className="flex flex-col items-center gap-1">
          <motion.button
            onClick={onTapToTalk}
            disabled={isLoading || isSpeaking}
            whileTap={{ scale: 0.94 }}
            className={`flex items-center gap-2 px-5 py-2 rounded-full border font-mono text-xs font-semibold tracking-[0.15em] min-h-[44px]
                        backdrop-blur-xl transition-all duration-200 cursor-pointer select-none ${
                          isListening
                            ? 'bg-red-950/80 border-red-500/80 text-red-200 shadow-[0_0_25px_rgba(239,68,68,0.4)] animate-pulse'
                            : 'bg-black/90 border-[#4DE8E8]/50 text-[#4DE8E8] hover:border-[#4DE8E8] hover:shadow-[0_0_20px_rgba(77,232,232,0.3)] active:bg-[#4DE8E8]/20'
                        }`}
            aria-label={isListening ? 'Stop recording and send' : 'Tap to speak to JARVIS'}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${isListening ? 'bg-red-400 animate-ping' : 'bg-[#4DE8E8]'}`} />
            <span>{isListening ? 'LISTENING... [TAP TO SEND]' : 'TAP TO SPEAK'}</span>
            <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </motion.button>
          <span className="text-[9.5px] font-mono text-[#4DE8E8]/50 tracking-wider uppercase">
            {modeReason || 'Tap-to-talk mode active'}
          </span>
        </div>
      ) : (
        /* ── Case 3: Desktop Continuous Always-On Voice Sentinel Pill ── */
        <motion.button
          onClick={onToggleMute}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`group flex items-center gap-2.5 px-3.5 sm:px-4 py-1.5 rounded-full border font-mono text-[10.5px] sm:text-[11px] font-medium tracking-[0.14em]
                      backdrop-blur-xl transition-all duration-200 cursor-pointer select-none min-h-[38px] ${
                        isMuted
                          ? 'bg-black/90 border-red-500/30 text-red-300/80 hover:border-red-400/60 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                          : 'bg-black/85 border-[#4DE8E8]/35 text-[#4DE8E8]/85 hover:text-[#4DE8E8] hover:border-[#4DE8E8]/70 hover:shadow-[0_0_22px_rgba(77,232,232,0.3)]'
                      }`}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {/* Living Indicator: Independent 2s cycle dual-pulse green dot */}
          <div className="relative flex items-center justify-center w-2.5 h-2.5 flex-shrink-0">
            <div
              className={`w-2 h-2 rounded-full transition-colors ${
                isMuted ? 'bg-red-400' : 'bg-emerald-400'
              }`}
            />
            {!isMuted && (
              <motion.div
                className="absolute inset-0 rounded-full border border-emerald-400"
                animate={{
                  scale: [1, 2.2, 1],
                  opacity: [0.8, 0, 0.8],
                }}
                transition={{
                  duration: 2.1,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            )}
            {!isMuted && (
              <div className="absolute inset-0 rounded-full bg-emerald-400/40 blur-[2px]" />
            )}
          </div>

          {/* Status Pill Text */}
          <span className="uppercase tracking-[0.16em] transition-colors group-hover:text-[#4DE8E8]">
            {isMuted ? 'ALWAYS-ON VOICE [MUTED]' : 'ALWAYS-ON VOICE [ACTIVE]'}
          </span>

          {/* Mic Icon */}
          <div className="pl-1 transition-transform group-hover:scale-105 flex-shrink-0">
            {isMuted ? (
              <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-[#4DE8E8]/70 group-hover:text-[#4DE8E8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </div>
        </motion.button>
      )}
    </div>
  );
}
