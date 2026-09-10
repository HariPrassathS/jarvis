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
  onPersonaChange?: (persona: VoicePersona) => void;
  onNewChat?: () => void;
  onSignOut?: () => void;
}

export default function HudOverlay({
  userName,
  persona = 'jarvis',
  clearanceLevel = 9,
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
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <svg
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors duration-300 flex-shrink-0 ${
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
        </div>

        {/* Centered Top: Persona Badge Title (Desktop only) */}
        <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center pointer-events-none">
          <span
            className={`text-[11px] font-mono tracking-[0.32em] uppercase font-normal select-none transition-colors duration-300 ${
              isFriday ? 'text-amber-300/60 shadow-[0_0_15px_rgba(251,191,36,0.15)]' : 'text-[#4DE8E8]/45'
            }`}
          >
            {isFriday ? 'F.R.I.D.A.Y // CORE v1.0' : 'J.A.R.V.I.S // CORE v1.0'}
          </span>
        </div>

        {/* Top-Right: Dual Persona HUD Switch + NEW CHAT | SIGN OUT */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
          {/* Dual Persona Switch */}
          {onPersonaChange && (
            <div
              className="flex items-center bg-black/80 border border-[#4DE8E8]/25 rounded-full p-0.5 backdrop-blur-xl shadow-[0_0_15px_rgba(0,0,0,0.8)]"
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

          <div className="w-px h-3 bg-white/15" />

          {/* New Chat */}
          {onNewChat && (
            <motion.button
              onClick={onNewChat}
              whileTap={{ scale: 0.94 }}
              className="text-[10px] sm:text-[10.5px] font-mono tracking-wider text-white/60 hover:text-[#4DE8E8] active:text-[#4DE8E8]
                        transition-colors uppercase cursor-pointer py-1.5 px-1.5 sm:px-1"
              aria-label="Start new chat"
            >
              <span className="hidden sm:inline">NEW CHAT</span>
              <span className="sm:hidden flex items-center gap-1">
                <span className="text-[#4DE8E8]">+</span> NEW
              </span>
            </motion.button>
          )}

          <div className="w-px h-3 bg-white/15" />

          {/* Sign Out */}
          {onSignOut && (
            <motion.button
              onClick={onSignOut}
              whileTap={{ scale: 0.94 }}
              className="text-[10px] sm:text-[10.5px] font-mono tracking-wider text-white/60 hover:text-red-400 active:text-red-400
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
