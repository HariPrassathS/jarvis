'use client';

// ──────────────────────────────────────────────
// BootSequenceLanding — Cinematic System Boot Intro
// The FIRST screen a user sees. Plays a 2.2s timed "power-on"
// sequence before settling into an idle ambient state.
//
// Boot timeline:
//   0ms     — Pure black, grid fades in
//   200ms   — Point of light seed appears center
//   400-900ms — Ambient glow blooms, ring system draws itself on
//   900-1400ms — Core sphere resolves (real JarvisOrb component)
//   1400-1800ms — Title types in character-by-character
//   1800-2200ms — Tagline + buttons rise in with stagger
//   2200ms+ — Continuous idle breathing loop
// ──────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import JarvisOrb from '@/components/hud/JarvisOrb';
import AtmosphericField from '@/components/hud/AtmosphericField';
import SignInButton from '@/components/auth/SignInButton';

// Characters for the scan-in title animation
const TITLE_CHARS = 'J.A.R.V.I.S'.split('');

// Boot phases controlled by timed state machine
type BootPhase = 'black' | 'seed' | 'bloom' | 'core' | 'title' | 'ready';

export default function BootSequenceLanding() {
  const [phase, setPhase] = useState<BootPhase>('black');
  const [titleRevealCount, setTitleRevealCount] = useState(0);
  const [isClient, setIsClient] = useState(false);

  // Ensure client has mounted before beginning sequence
  useEffect(() => {
    setIsClient(true);
    const timers: NodeJS.Timeout[] = [];

    // Phase 0: Pure black (0 - 250ms)
    // Phase 1: Seed point of light (250ms)
    timers.push(setTimeout(() => setPhase('seed'), 250));

    // Phase 2: Ambient bloom + ring tracks expand and rotate (650ms)
    timers.push(setTimeout(() => setPhase('bloom'), 650));

    // Phase 3: Core sphere resolves into full volumetric detail (1150ms)
    timers.push(setTimeout(() => setPhase('core'), 1150));

    // Phase 4: Title scan-in begins (1650ms)
    timers.push(setTimeout(() => setPhase('title'), 1650));

    // Phase 5: Ready — subtitle and buttons rise into place (2250ms)
    timers.push(setTimeout(() => setPhase('ready'), 2250));

    return () => timers.forEach(clearTimeout);
  }, []);

  // ── Character-by-character title reveal ──
  useEffect(() => {
    if (phase !== 'title' && phase !== 'ready') return;

    if (titleRevealCount < TITLE_CHARS.length) {
      const charTimer = setTimeout(() => {
        setTitleRevealCount((prev) => prev + 1);
      }, 55); // 55ms per character
      return () => clearTimeout(charTimer);
    }
  }, [phase, titleRevealCount]);

  // Phase index for sequential comparisons
  const phaseIndex = useMemo(() => {
    const map: Record<BootPhase, number> = {
      black: 0, seed: 1, bloom: 2, core: 3, title: 4, ready: 5,
    };
    return isClient ? map[phase] : 0;
  }, [phase, isClient]);

  return (
    <div className="min-h-screen min-h-dvh h-dvh bg-black hud-grid-overlay relative overflow-hidden flex flex-col items-center justify-center select-none px-3 sm:px-4">

      {/* ── Atmospheric Field (fades in during bloom phase) ── */}
      <div
        className="fixed inset-0 z-0 transition-opacity duration-1000 ease-out"
        style={{ opacity: phaseIndex >= 2 ? 1 : 0 }}
      >
        <AtmosphericField mode="landing" />
      </div>

      {/* ── Boot Content Container ── */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-lg" style={{ marginTop: '-2vh' }}>

        {/* ═══ Top Header Badge Lockup (Fades in during Phase 2) ═══ */}
        <div
          className="mb-1 sm:mb-2 flex items-center gap-2.5 px-3 py-1 rounded-full border border-[#4DE8E8]/20 bg-black/60 backdrop-blur-md shadow-[0_0_15px_rgba(77,232,232,0.1)] transition-all duration-700 ease-out"
          style={{
            opacity: phaseIndex >= 2 ? 1 : 0,
            transform: phaseIndex >= 2 ? 'translateY(0)' : 'translateY(-12px)',
          }}
        >
          <div className="relative group cursor-default flex-shrink-0">
            <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-[#4DE8E8]/50 to-[#FB7185]/50 blur-[4px] opacity-70 group-hover:opacity-100 transition-opacity duration-300" />
            <img
              src="/jarvis-friday-logo.png"
              alt="J.A.R.V.I.S & F.R.I.D.A.Y Logo"
              className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover border border-white/30 shadow-[0_0_10px_rgba(0,0,0,0.9)] transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <span className="text-[8.5px] sm:text-[9.5px] font-mono tracking-[0.22em] text-[#4DE8E8]/80 uppercase font-semibold">
            STARK INDUSTRIES // AI CORE v1.0
          </span>
        </div>

        {/* ═══ PHASE 1: Seed Point of Light (250ms - 650ms) ═══ */}
        <div
          className="absolute rounded-full pointer-events-none transition-all duration-500 ease-out"
          style={{
            width: 8,
            height: 8,
            top: '140px',
            background: '#4DE8E8',
            boxShadow: '0 0 35px 14px rgba(77, 232, 232, 0.8), 0 0 70px 28px rgba(77, 232, 232, 0.35)',
            opacity: phaseIndex === 1 ? 1 : 0,
            transform: phaseIndex === 1 ? 'scale(1)' : phaseIndex > 1 ? 'scale(5)' : 'scale(0)',
          }}
        />

        {/* ═══ PHASE 2 & 3: Orb Assembly (650ms: bloom & rings, 1150ms: core) ═══ */}
        <div
          className="relative transition-all duration-700 ease-out flex items-center justify-center"
          style={{
            width: 'min(320px, 85vw)',
            height: 'min(320px, 38vh)',
            opacity: phaseIndex >= 2 ? 1 : 0,
            transform: phaseIndex >= 3 ? 'scale(1)' : phaseIndex >= 2 ? 'scale(0.65)' : 'scale(0.1)',
          }}
        >
          <div className="flex items-center justify-center w-full h-full" style={{ transform: 'scale(0.82)' }}>
            <JarvisOrb state="idle" hideLabel />
          </div>
        </div>

        {/* ═══ PHASE 4: Title Scan-In ("J.A.R.V.I.S") ═══ */}
        <div
          className="mt-1 sm:mt-2 flex items-center justify-center transition-opacity duration-300"
          style={{ opacity: phaseIndex >= 4 ? 1 : 0 }}
        >
          <h1 className="flex items-center text-3xl sm:text-4xl md:text-5xl font-light tracking-[0.22em] sm:tracking-[0.35em] md:tracking-[0.4em] font-mono select-none">
            {TITLE_CHARS.map((char, i) => {
              const isRevealed = phaseIndex >= 4 && i < titleRevealCount;
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
        </div>

        {/* ═══ PHASE 5: Subtitle Tagline + Buttons ═══ */}

        {/* Tagline */}
        <p
          className="mt-2.5 sm:mt-3 text-[10px] sm:text-xs font-mono tracking-[0.14em] sm:tracking-[0.22em] text-[#4DE8E8]/60 uppercase text-center max-w-[290px] sm:max-w-none transition-all duration-600 ease-out"
          style={{
            opacity: phaseIndex >= 5 ? 1 : 0,
            transform: phaseIndex >= 5 ? 'translateY(0)' : 'translateY(8px)',
            textShadow: '0 0 8px rgba(77, 232, 232, 0.3)',
          }}
        >
          Just A Rather Very Intelligent System
        </p>

        {/* Buttons — staggered upward rise */}
        <div
          className="mt-5 sm:mt-7 w-full max-w-[280px] sm:max-w-xs flex justify-center transition-all duration-700 ease-out"
          style={{
            opacity: phaseIndex >= 5 ? 1 : 0,
            transform: phaseIndex >= 5 ? 'translateY(0)' : 'translateY(22px)',
          }}
        >
          <SignInButton />
        </div>

        {/* Footer — in-universe brand line */}
        <p
          className="mt-4 sm:mt-6 text-[10px] sm:text-[11px] font-mono tracking-wider text-center transition-opacity duration-700 ease-out select-none"
          style={{
            opacity: phaseIndex >= 5 ? 1 : 0,
          }}
        >
          <span className="text-[#4DE8E8]/40">Powered by </span>
          <span
            className="text-[#4DE8E8]/75 hover:text-[#4DE8E8] transition-all duration-300 tracking-widest cursor-default font-semibold inline-block relative group"
            title="Stark Industries // Advanced Systems Division"
          >
            Stark Industries
            <span className="absolute -bottom-0.5 left-0 w-0 h-[1px] bg-[#4DE8E8] transition-all duration-300 group-hover:w-full opacity-70 shadow-[0_0_8px_#4DE8E8]" />
          </span>
        </p>
      </div>
    </div>
  );
}

