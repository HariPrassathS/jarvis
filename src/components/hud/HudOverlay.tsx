'use client';

// ──────────────────────────────────────────────
// HudOverlay — Top Bar & Viewfinder Corner Marks
// Visual Spec:
// - Top-left: Small bracket/corner decoration icon (viewfinder corner mark)
// - Centered top: "J.A.R.V.I.S | v1.0" in muted cyan, letter-spaced, uppercase, monospace, ~12px
// - Top-right: "NEW CHAT" and "SIGN OUT" separated by a thin vertical divider, muted white/cyan, uppercase, small, monospace
// ──────────────────────────────────────────────

import { motion } from 'framer-motion';

interface HudOverlayProps {
  providerUsed?: string | null;
  userName?: string | null;
  onNewChat?: () => void;
  onSignOut?: () => void;
}

export default function HudOverlay({
  userName,
  onNewChat,
  onSignOut,
}: HudOverlayProps) {
  return (
    <div className="fixed inset-0 pointer-events-none z-30 flex flex-col justify-between p-3 sm:p-4 md:p-6 pt-[calc(0.75rem+var(--sat))] pb-[calc(0.5rem+var(--sab))]">
      {/* ── Top Bar Container (Utility Tier Typography: Muted, smallest, non-intrusive) ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative w-full flex items-center justify-between gap-2"
      >
        {/* Top-Left: Viewfinder Corner Mark & Authenticated Operator */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <svg
            className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#4DE8E8]/40 flex-shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M1 7V1h6" />
          </svg>
          {userName && (
            <span className="text-[9.5px] sm:text-[10.5px] font-mono tracking-[0.14em] sm:tracking-[0.2em] text-[#4DE8E8]/70 uppercase font-medium truncate max-w-[110px] sm:max-w-xs">
              <span className="hidden sm:inline">OPERATOR // </span>
              <span className="sm:hidden">OP // </span>
              {userName}
            </span>
          )}
        </div>

        {/* Centered Top: J.A.R.V.I.S | v1.0 (Hidden on small mobile to prevent text collision) */}
        <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center pointer-events-none">
          <span className="text-[11px] font-mono tracking-[0.32em] text-[#4DE8E8]/45 uppercase font-normal select-none">
            J.A.R.V.I.S | v1.0
          </span>
        </div>

        {/* Top-Right: NEW CHAT | SIGN OUT (Touch-friendly 40px targets on mobile) */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          {onNewChat && (
            <motion.button
              onClick={onNewChat}
              whileTap={{ scale: 0.94 }}
              className="text-[10px] sm:text-[10.5px] font-mono tracking-wider text-white/60 hover:text-[#4DE8E8] active:text-[#4DE8E8]
                        transition-colors uppercase cursor-pointer py-1.5 px-2 sm:px-1"
              aria-label="Start new chat"
            >
              <span className="hidden sm:inline">NEW CHAT</span>
              <span className="sm:hidden flex items-center gap-1">
                <span className="text-[#4DE8E8]">+</span> NEW
              </span>
            </motion.button>
          )}
          <div className="w-px h-3 bg-white/15" />
          {onSignOut && (
            <motion.button
              onClick={onSignOut}
              whileTap={{ scale: 0.94 }}
              className="text-[10px] sm:text-[10.5px] font-mono tracking-wider text-white/60 hover:text-red-400 active:text-red-400
                        transition-colors uppercase cursor-pointer py-1.5 px-2 sm:px-1"
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
          className="w-4 h-4 text-[#4DE8E8]/40"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M1 9v6h6" />
        </svg>

        <svg
          className="w-4 h-4 text-[#4DE8E8]/40"
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
