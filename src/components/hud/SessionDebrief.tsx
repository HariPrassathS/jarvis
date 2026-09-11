'use client';

// ──────────────────────────────────────────────
// SessionDebrief — In-Character Mission Summary on Logout
// Displays session metrics (duration, queries executed, memories logged)
// with a 3.5-second skippable countdown and immediate stand-down trigger.
// ──────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VoicePersona, ClearanceLevel } from '@/types';

interface SessionDebriefProps {
  isOpen: boolean;
  operatorName?: string;
  persona?: VoicePersona;
  clearanceLevel?: ClearanceLevel;
  queryCount: number;
  sessionStartTime: number;
  onCompleteSignOut: () => void;
  reducedMotion?: boolean;
}

export default function SessionDebrief({
  isOpen,
  operatorName = 'Operator',
  persona = 'jarvis',
  clearanceLevel = 9,
  queryCount,
  sessionStartTime,
  onCompleteSignOut,
  reducedMotion = false,
}: SessionDebriefProps) {
  const isFriday = persona === 'friday';
  const COUNTDOWN_SECONDS = 3.5;
  const [progress, setProgress] = useState(100);
  const [secondsRemaining, setSecondsRemaining] = useState(COUNTDOWN_SECONDS);
  const startTimeRef = useRef<number>(Date.now());
  const completedRef = useRef(false);

  // Format active session elapsed time
  const sessionDurationFormatted = useCallback(() => {
    const elapsedMs = Math.max(0, Date.now() - sessionStartTime);
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [sessionStartTime]);

  const handleFinish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteSignOut();
  }, [onCompleteSignOut]);

  // Countdown timer when open
  useEffect(() => {
    if (!isOpen) {
      completedRef.current = false;
      setProgress(100);
      setSecondsRemaining(COUNTDOWN_SECONDS);
      return;
    }

    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
      const remaining = Math.max(0, COUNTDOWN_SECONDS - elapsedSec);
      const pct = (remaining / COUNTDOWN_SECONDS) * 100;

      setSecondsRemaining(parseFloat(remaining.toFixed(1)));
      setProgress(pct);

      if (remaining <= 0) {
        clearInterval(interval);
        handleFinish();
      }
    }, 40);

    return () => clearInterval(interval);
  }, [isOpen, handleFinish]);

  // Keyboard dismiss (Escape or Enter)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleFinish();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleFinish]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 select-none">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-lg -z-10"
          />

          {/* Holographic Debrief Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: reducedMotion ? 0 : 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: reducedMotion ? 0 : 20 }}
            transition={{ duration: reducedMotion ? 0.15 : 0.3, ease: 'easeOut' }}
            className={`w-full max-w-lg rounded-2xl bg-black/95 border p-5 sm:p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden flex flex-col ${
              isFriday
                ? 'border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.25)]'
                : 'border-[#00FFFF]/40 shadow-[0_0_40px_rgba(0,255,255,0.25)]'
            }`}
          >
            {/* Top Scanning Line */}
            <div
              className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-current to-transparent ${
                isFriday ? 'text-amber-400' : 'text-[#00FFFF]'
              }`}
            />

            {/* Header Badge */}
            <div className="flex items-center justify-between border-b pb-3 mb-4 border-zinc-800/80">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full animate-ping ${
                    isFriday ? 'bg-amber-400' : 'bg-[#00FFFF]'
                  }`}
                />
                <span
                  className={`text-[10px] sm:text-xs font-mono font-bold tracking-[0.25em] uppercase ${
                    isFriday ? 'text-amber-400' : 'text-[#00FFFF]'
                  }`}
                >
                  MISSION DEBRIEF // STANDING DOWN
                </span>
              </div>

              <span className="px-2 py-0.5 rounded text-[9px] font-mono tracking-wider bg-zinc-800/80 text-zinc-400 border border-zinc-700">
                LVL {clearanceLevel}
              </span>
            </div>

            {/* Operator Greeting & In-Character Message */}
            <div className="mb-5">
              <h3 className="text-lg sm:text-xl font-mono font-semibold text-white tracking-wide">
                Operator {operatorName}
              </h3>
              <p
                className={`text-xs sm:text-sm font-mono mt-1 ${
                  isFriday ? 'text-amber-300/80' : 'text-cyan-200/80'
                }`}
              >
                {isFriday
                  ? '"Mission metrics archived, boss. All systems locked down safe and sound. Standing by for next deployment."'
                  : '"All directives logged, sir. Primary cognitive subroutines parked. Standing down."'}
              </p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-5">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-zinc-800 flex flex-col items-center justify-center text-center">
                <span className="text-xl sm:text-2xl font-mono font-bold text-white">
                  {queryCount}
                </span>
                <span className="text-[9px] font-mono text-zinc-400 tracking-wider uppercase mt-0.5">
                  Directives
                </span>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-zinc-800 flex flex-col items-center justify-center text-center">
                <span
                  className={`text-xl sm:text-2xl font-mono font-bold ${
                    isFriday ? 'text-amber-400' : 'text-[#00FFFF]'
                  }`}
                >
                  {sessionDurationFormatted()}
                </span>
                <span className="text-[9px] font-mono text-zinc-400 tracking-wider uppercase mt-0.5">
                  Duration
                </span>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-zinc-800 flex flex-col items-center justify-center text-center">
                <span className="text-xl sm:text-2xl font-mono font-bold text-emerald-400">
                  NOMINAL
                </span>
                <span className="text-[9px] font-mono text-zinc-400 tracking-wider uppercase mt-0.5">
                  Telemetry
                </span>
              </div>
            </div>

            {/* System Status Readouts */}
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5 mb-5 font-mono text-[10px] sm:text-[11px]">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Mark VII Chassis Telemetry:</span>
                <span className="text-emerald-400 font-semibold">SECURED & DOCKED</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Audio Sentry Engine:</span>
                <span className="text-zinc-500 font-semibold">DORMANT</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Quantum Memory Core:</span>
                <span className="text-cyan-400 font-semibold">SYNCHRONIZED</span>
              </div>
            </div>

            {/* Auto-Dismiss Progress Bar */}
            <div className="w-full bg-zinc-800/60 h-1.5 rounded-full overflow-hidden mb-4">
              <motion.div
                className={`h-full ${
                  isFriday ? 'bg-amber-400' : 'bg-[#00FFFF]'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono text-zinc-500">
                Standing down in {secondsRemaining}s...
              </span>

              <button
                onClick={handleFinish}
                className={`px-4 py-2 rounded-xl font-mono text-xs font-bold tracking-wider uppercase flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                  isFriday
                    ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                    : 'bg-[#00FFFF] text-black hover:bg-[#4DE8E8] shadow-[0_0_15px_rgba(0,255,255,0.4)]'
                }`}
              >
                <span>STAND DOWN [SKIP]</span>
                <span className="text-[9px] opacity-75 font-normal">↵</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
