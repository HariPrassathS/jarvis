'use client';

// ──────────────────────────────────────────────
// HudOverlay — Top Bar & Viewfinder Corner Marks
// Features: Dual Persona Switch (JARVIS / FRIDAY), Operator ID, Session Actions
// ──────────────────────────────────────────────

import { motion } from 'framer-motion';
import type { VoicePersona, ClearanceLevel } from '@/types';

interface HudOverlayProps {
  providerUsed?: string | null;
  userName?: string | null;
  persona?: VoicePersona;
  clearanceLevel?: ClearanceLevel;
  isMicKilled?: boolean;
  onToggleMicKill?: () => void;
  onOpenPrivacyModal?: () => void;
  onOpenCommandPalette?: () => void;
  onPersonaChange?: (persona: VoicePersona) => void;
  onNewChat?: () => void;
  onSignOut?: () => void;
}

export default function HudOverlay({
  userName,
  persona = 'jarvis',
  clearanceLevel = 9,
  isMicKilled = false,
  onToggleMicKill,
  onOpenPrivacyModal,
  onOpenCommandPalette,
  onPersonaChange,
  onNewChat,
  onSignOut,
}: HudOverlayProps) {
  const isFriday = persona === 'friday';

  return (
    <div className="fixed inset-0 pointer-events-none z-30 flex flex-col justify-between p-3 sm:p-4 md:p-6 pt-[calc(0.75rem+var(--sat))] pb-[calc(0.5rem+var(--sab))]">
      {/* ── Top Bar Container ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative w-full flex items-center justify-between gap-2"
      >
        {/* Top-Left: Viewfinder Corner Mark & Authenticated Operator & Clearance Badge */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          {/* Circular Metallic Logo Badge */}
          <div className="relative flex-shrink-0 group cursor-default">
            <div
              className={`absolute -inset-0.5 rounded-full blur-[4px] transition-all duration-300 opacity-60 group-hover:opacity-100 ${
                isFriday ? 'bg-amber-400/50' : 'bg-[#4DE8E8]/50'
              }`}
            />
            <img
              src="/jarvis-friday-logo.png"
              alt="J.A.R.V.I.S & F.R.I.D.A.Y Logo"
              className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover border border-white/25 shadow-[0_0_12px_rgba(0,0,0,0.85)] transition-transform duration-300 group-hover:scale-105"
            />
          </div>

          <svg
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors duration-300 flex-shrink-0 hidden sm:block ${
              isFriday ? 'text-amber-400/50' : 'text-[#4DE8E8]/40'
            }`}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M1 7V1h6" />
          </svg>
          {userName && (
            <span
              className={`text-[9.5px] sm:text-[10.5px] font-mono tracking-[0.14em] sm:tracking-[0.2em] uppercase font-medium truncate max-w-[95px] sm:max-w-xs transition-colors duration-300 ${
                isFriday ? 'text-amber-200/70' : 'text-[#4DE8E8]/70'
              }`}
            >
              <span className="hidden sm:inline">OPERATOR // </span>
              <span className="sm:hidden">OP // </span>
              {userName}
            </span>
          )}
          {clearanceLevel && (
            <span
              className={`px-1.5 py-0.5 rounded text-[7.5px] sm:text-[8.5px] font-mono tracking-widest uppercase font-semibold border transition-colors duration-300 flex-shrink-0 ${
                clearanceLevel === 9
                  ? isFriday
                    ? 'border-amber-400/40 bg-amber-400/10 text-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.2)]'
                    : 'border-[#4DE8E8]/40 bg-[#4DE8E8]/10 text-[#4DE8E8] shadow-[0_0_8px_rgba(77,232,232,0.2)]'
                  : clearanceLevel === 5
                  ? 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300'
                  : 'border-white/30 bg-white/5 text-white/60'
              }`}
              title={`Security Clearance Level ${clearanceLevel}: ${
                clearanceLevel === 9 ? 'Full Suite Access / Calendar / Protocols' : clearanceLevel === 5 ? 'Tactical / Memory Core' : 'Standard Baseline Tools'
              }`}
            >
              LVL {clearanceLevel}
            </span>
          )}

          <span
            className={`hidden xl:inline text-[9px] font-mono tracking-widest uppercase font-normal select-none border-l pl-2 transition-colors duration-300 ${
              isFriday ? 'border-amber-400/20 text-amber-300/40' : 'border-[#4DE8E8]/20 text-[#4DE8E8]/40'
            }`}
          >
            {isFriday ? 'FRIDAY // v1.0' : 'JARVIS // v1.0'}
          </span>
        </div>

        {/* Top-Right: Global Mic Kill-Switch + Dual Persona HUD Switch + DATA & PRIVACY + NEW CHAT | SIGN OUT */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Global Mic Kill-Switch Control */}
          {onToggleMicKill && (
            <motion.button
              type="button"
              onClick={onToggleMicKill}
              whileTap={{ scale: 0.92 }}
              className={`px-2 sm:px-2.5 py-1 rounded-full text-[8.5px] sm:text-[9.5px] font-mono tracking-wider uppercase font-semibold flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                isMicKilled
                  ? 'bg-red-950/90 border border-red-500 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse'
                  : isFriday
                  ? 'bg-black/80 border border-rose-500/40 text-rose-300 hover:border-rose-400 hover:bg-rose-500/10 shadow-[0_0_10px_rgba(244,63,94,0.15)]'
                  : 'bg-black/80 border border-[#4DE8E8]/30 text-[#4DE8E8] hover:border-[#4DE8E8]/80 hover:bg-[#4DE8E8]/10'
              }`}
              title={
                isMicKilled
                  ? 'Global Mic Kill-Switch ENGAGED — Hardware mic disabled. Click to restore.'
                  : 'Global Mic Kill-Switch DISENGAGED — Click to terminate hardware mic stream.'
              }
              aria-label={isMicKilled ? 'Restore microphone access' : 'Kill microphone hardware stream'}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isMicKilled ? 'bg-red-400 animate-ping' : isFriday ? 'bg-rose-400 shadow-[0_0_6px_#fb7185]' : 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                }`}
              />
              <span>{isMicKilled ? 'MIC KILLED' : 'MIC ACTIVE'}</span>
              {isMicKilled ? (
                <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              ) : (
                <svg className={`w-3.5 h-3.5 flex-shrink-0 ${isFriday ? 'text-rose-300/80' : 'text-[#4DE8E8]/70'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </motion.button>
          )}

          {/* Dual Persona Switch */}
          {onPersonaChange && (
            <div
              className={`flex items-center bg-black/80 border rounded-full p-0.5 backdrop-blur-xl shadow-[0_0_15px_rgba(0,0,0,0.8)] ${
                isFriday ? 'border-amber-400/35 shadow-[0_0_15px_rgba(244,63,94,0.15)]' : 'border-[#4DE8E8]/25'
              }`}
              title="Voice Persona Matrix: Switch between JARVIS (Butler) & FRIDAY (Tactical). Browser-native synthesis."
            >
              <button
                type="button"
                onClick={() => onPersonaChange('jarvis')}
                aria-label="Switch to JARVIS persona"
                className={`px-2 sm:px-2.5 py-1 text-[9px] sm:text-[10px] font-mono tracking-wider uppercase rounded-full transition-all duration-200 cursor-pointer ${
                  !isFriday
                    ? 'bg-[#4DE8E8]/20 text-[#4DE8E8] shadow-[0_0_10px_rgba(77,232,232,0.35)] font-semibold border border-[#4DE8E8]/40'
                    : 'text-white/40 hover:text-white/80 border border-transparent'
                }`}
              >
                <span className="hidden sm:inline">JARVIS</span>
                <span className="sm:hidden">J</span>
              </button>

              <button
                type="button"
                onClick={() => onPersonaChange('friday')}
                aria-label="Switch to FRIDAY persona"
                className={`px-2 sm:px-2.5 py-1 text-[9px] sm:text-[10px] font-mono tracking-wider uppercase rounded-full transition-all duration-200 cursor-pointer ${
                  isFriday
                    ? 'bg-amber-400/20 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.35)] font-semibold border border-amber-400/40'
                    : 'text-white/40 hover:text-white/80 border border-transparent'
                }`}
              >
                <span className="hidden sm:inline">FRIDAY</span>
                <span className="sm:hidden">F</span>
              </button>
            </div>
          )}

          {/* Command Palette Button */}
          {onOpenCommandPalette && (
            <motion.button
              onClick={onOpenCommandPalette}
              whileTap={{ scale: 0.94 }}
              className={`text-[9.5px] sm:text-[10px] font-mono tracking-wider transition-colors uppercase cursor-pointer py-1 px-2 rounded-md border flex items-center gap-1.5 ${
                isFriday
                  ? 'border-amber-500/30 text-amber-300/80 hover:text-amber-200 hover:border-amber-500/60 bg-amber-950/30'
                  : 'border-[#00FFFF]/30 text-[#00FFFF]/80 hover:text-[#00FFFF] hover:border-[#00FFFF]/60 bg-cyan-950/30'
              }`}
              title="Open Command Palette (Cmd+K / Ctrl+K)"
              aria-label="Open Command Palette"
            >
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden sm:inline">CMD</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-white/10 font-bold">⌘K</span>
            </motion.button>
          )}

          <div className="w-px h-3 bg-white/15 hidden sm:block" />

          {/* Privacy & Data Governance */}
          {onOpenPrivacyModal && (
            <motion.button
              onClick={onOpenPrivacyModal}
              whileTap={{ scale: 0.94 }}
              className={`text-[9.5px] sm:text-[10px] font-mono tracking-wider transition-colors uppercase cursor-pointer py-1.5 px-1.5 sm:px-1 flex items-center gap-1 ${
                isFriday
                  ? 'text-white/60 hover:text-rose-300 active:text-rose-300'
                  : 'text-white/60 hover:text-[#4DE8E8] active:text-[#4DE8E8]'
              }`}
              title="Open Privacy & Data Governance (Export Data, Forget Everything)"
              aria-label="Privacy and Data Governance"
            >
              <svg className={`w-3.5 h-3.5 flex-shrink-0 ${isFriday ? 'text-rose-400/80' : 'text-[#4DE8E8]/80'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="hidden md:inline">DATA &amp; PRIVACY</span>
              <span className="md:hidden">PRIVACY</span>
            </motion.button>
          )}

          <div className="w-px h-3 bg-white/15" />

          {/* New Chat */}
          {onNewChat && (
            <motion.button
              onClick={onNewChat}
              whileTap={{ scale: 0.94 }}
              className={`text-[9.5px] sm:text-[10.5px] font-mono tracking-wider transition-colors uppercase cursor-pointer py-1.5 px-1.5 sm:px-1 ${
                isFriday
                  ? 'text-white/60 hover:text-amber-300 active:text-amber-300'
                  : 'text-white/60 hover:text-[#4DE8E8] active:text-[#4DE8E8]'
              }`}
              aria-label="Start new chat"
            >
              <span className="hidden sm:inline">NEW CHAT</span>
              <span className="sm:hidden flex items-center gap-1">
                <span className={isFriday ? 'text-amber-300' : 'text-[#4DE8E8]'}>+</span> NEW
              </span>
            </motion.button>
          )}

          <div className="w-px h-3 bg-white/15" />

          {/* Sign Out */}
          {onSignOut && (
            <motion.button
              onClick={onSignOut}
              whileTap={{ scale: 0.94 }}
              className="text-[9.5px] sm:text-[10.5px] font-mono tracking-wider text-white/60 hover:text-red-400 active:text-red-400
                        transition-colors uppercase cursor-pointer py-1.5 px-1.5 sm:px-1"
              aria-label="Sign out"
            >
              <span className="hidden sm:inline">SIGN OUT</span>
              <span className="sm:hidden">EXIT</span>
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* ── Bottom Corner Viewfinder Brackets ── */}
      <div className="w-full flex items-end justify-between pointer-events-none">
        <svg
          className={`w-4 h-4 transition-colors duration-300 ${
            isFriday ? 'text-amber-400/40' : 'text-[#4DE8E8]/40'
          }`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M1 9v6h6" />
        </svg>

        <svg
          className={`w-4 h-4 transition-colors duration-300 ${
            isFriday ? 'text-amber-400/40' : 'text-[#4DE8E8]/40'
          }`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 9v6h-6" />
        </svg>
      </div>
    </div>
  );
}
