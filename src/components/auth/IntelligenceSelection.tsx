'use client';

// ──────────────────────────────────────────────
// IntelligenceSelection — Phase 3.5 Boot Narrative
// HARI PRASSATH PRESENTS: Autonomous Intelligence Systems
// Dual Persona Pods: J.A.R.V.I.S (Core Intelligence) vs F.R.I.D.A.Y (Adaptive Intelligence)
// Features: Live Mini Orbs, Interactive Voice Previews with Soundwave Visualizers,
// Tactical Telemetry Chips, Responsive Viewport Proportions & Seamless Morphing Handoff
// ──────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import JarvisOrb from '@/components/hud/JarvisOrb';
import type { VoicePersona, ClearanceLevel } from '@/types';

interface IntelligenceSelectionProps {
  operatorName: string;
  initialPersona?: VoicePersona;
  clearanceLevel?: ClearanceLevel;
  onSelect: (persona: VoicePersona) => void;
  onPreviewVoice?: (text: string, persona: VoicePersona) => void;
  reducedMotion?: boolean;
}

export default function IntelligenceSelection({
  operatorName,
  initialPersona = 'jarvis',
  clearanceLevel = 9,
  onSelect,
  onPreviewVoice,
  reducedMotion = false,
}: IntelligenceSelectionProps) {
  const [hoveredPersona, setHoveredPersona] = useState<VoicePersona | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<VoicePersona | null>(null);
  const [playingVoice, setPlayingVoice] = useState<VoicePersona | null>(null);
  const lastPreviewedRef = useRef<{ persona: VoicePersona; timestamp: number } | null>(null);
  const voiceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
    };
  }, []);

  // Debounced audio voice preview on hover or button click
  const handleVoicePreview = useCallback(
    (persona: VoicePersona, force: boolean = false) => {
      const now = Date.now();
      if (
        !force &&
        lastPreviewedRef.current &&
        lastPreviewedRef.current.persona === persona &&
        now - lastPreviewedRef.current.timestamp < 3500
      ) {
        return; // Prevent repeating audio if still playing or hovered recently
      }
      lastPreviewedRef.current = { persona, timestamp: now };
      setPlayingVoice(persona);

      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = setTimeout(() => {
        setPlayingVoice(null);
      }, 2800);

      if (onPreviewVoice) {
        const sampleLine =
          persona === 'friday'
            ? 'Hey, boss. Systems hot and ready when you are.'
            : 'At your service, sir. Standing by for your command.';
        onPreviewVoice(sampleLine, persona);
      }
    },
    [onPreviewVoice]
  );

  const handleCardClick = useCallback(
    (persona: VoicePersona) => {
      if (selectedPersona) return; // already committing
      setSelectedPersona(persona);

      // 450ms confirmation pulse before triggering Phase 4 system boot
      setTimeout(() => {
        onSelect(persona);
      }, reducedMotion ? 150 : 450);
    },
    [selectedPersona, onSelect, reducedMotion]
  );

  const displayOperator =
    operatorName && operatorName !== 'Operator' && operatorName.length > 1
      ? operatorName.toUpperCase()
      : 'HARI PRASSATH';

  return (
    <motion.div
      initial={{ opacity: 0, y: reducedMotion ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        scale: reducedMotion ? 1 : 0.96,
        filter: reducedMotion ? 'none' : 'blur(6px)',
        transition: { duration: 0.3, ease: 'easeInOut' },
      }}
      transition={{ duration: reducedMotion ? 0.2 : 0.45, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center w-full max-w-4xl px-2 sm:px-4 py-1 select-none z-20 overflow-y-auto max-h-[calc(100dvh-1.5rem)] scrollbar-none"
    >
      {/* ── Presentation Header ── */}
      <div className="text-center mb-2 sm:mb-3 flex flex-col items-center">
        {/* Security Clearance Pill */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-[#4DE8E8]/30 bg-black/70 backdrop-blur-md mb-1 shadow-[0_0_15px_rgba(77,232,232,0.15)]"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#4DE8E8] animate-ping" />
          <span className="text-[8.5px] sm:text-[9.5px] font-mono tracking-[0.22em] text-[#4DE8E8] uppercase font-semibold">
            STARK INDUSTRIES // OPERATOR: {displayOperator} · LEVEL {clearanceLevel}{clearanceLevel === 9 ? ' · DIRECT ACCESS' : clearanceLevel === 5 ? ' · TACTICAL' : ' · STANDARD'}
          </span>
        </motion.div>

        {/* HARI PRASSATH PRESENTS — Impressive Holographic Supertitle */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="flex items-center gap-2 mb-0.5"
        >
          <div className="h-px w-5 sm:w-10 bg-gradient-to-r from-transparent to-[#4DE8E8]/60" />
          <span className="text-[10px] sm:text-[11px] md:text-xs font-mono tracking-[0.3em] uppercase font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#4DE8E8] via-[#FFFFFF] to-[#FB7185] drop-shadow-[0_0_12px_rgba(77,232,232,0.5)]">
            HARI PRASSATH PRESENTS
          </span>
          <div className="h-px w-5 sm:w-10 bg-gradient-to-l from-transparent to-[#FB7185]/60" />
        </motion.div>

        {/* Main Title */}
        <h2 className="text-lg sm:text-xl md:text-2xl font-mono tracking-[0.18em] sm:tracking-[0.22em] text-white font-light uppercase drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]">
          AUTONOMOUS INTELLIGENCE MATRIX
        </h2>

        {/* In-Universe Subtitle */}
        <p className="mt-0.5 text-[9px] sm:text-[10.5px] font-mono tracking-[0.14em] text-white/50 uppercase max-w-xl mx-auto">
          Engineered by Hari Prassath // Select active neural persona for this operational cycle
        </p>
      </div>

      {/* ── Dual Persona Interactive Cards / Pods ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-5 w-full max-w-2xl lg:max-w-3xl">
        {/* ═══ JARVIS CARD (Core Intelligence) ═══ */}
        <motion.div
          role="button"
          tabIndex={0}
          aria-label="Activate J.A.R.V.I.S core intelligence"
          onClick={() => handleCardClick('jarvis')}
          onMouseEnter={() => {
            setHoveredPersona('jarvis');
            handleVoicePreview('jarvis');
          }}
          onMouseLeave={() => setHoveredPersona(null)}
          onFocus={() => {
            setHoveredPersona('jarvis');
            handleVoicePreview('jarvis');
          }}
          onBlur={() => setHoveredPersona(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick('jarvis');
            }
          }}
          animate={{
            scale:
              selectedPersona === 'jarvis'
                ? 1.03
                : selectedPersona === 'friday'
                ? 0.9
                : hoveredPersona === 'jarvis'
                ? 1.02
                : 1,
            opacity: selectedPersona === 'friday' ? 0.15 : 1,
            y: hoveredPersona === 'jarvis' && !selectedPersona ? -3 : 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 24,
          }}
          className={`relative group rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col items-center text-center cursor-pointer transition-colors duration-300 backdrop-blur-xl border ${
            selectedPersona === 'jarvis'
              ? 'bg-[#00FFFF]/10 border-[#00FFFF] shadow-[0_0_30px_rgba(0,255,255,0.4)]'
              : hoveredPersona === 'jarvis'
              ? 'bg-black/80 border-[#00FFFF]/80 shadow-[0_0_20px_rgba(0,255,255,0.2)]'
              : 'bg-black/60 border-[#4DE8E8]/25 hover:border-[#4DE8E8]/60 shadow-[0_0_15px_rgba(0,0,0,0.6)]'
          }`}
        >
          {/* Top Pill: Persona Badge & Protocol Tag */}
          <div className="w-full flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[8.5px] sm:text-[9px] font-mono tracking-[0.18em] text-[#4DE8E8]/70 uppercase font-semibold">
              ARCH // MK-85 · STARK TECH
            </span>
            <span className="text-[8.5px] sm:text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full border border-[#4DE8E8]/30 bg-[#4DE8E8]/10 text-[#4DE8E8] uppercase font-semibold">
              CORE AI
            </span>
          </div>

          {/* Live Mini Orb Preview (JARVIS Cyan / Violet Theme) */}
          <div className="relative my-1 sm:my-1.5 flex items-center justify-center h-[120px] sm:h-[130px] md:h-[140px] w-full pointer-events-none">
            <JarvisOrb
              state={
                selectedPersona === 'jarvis' || playingVoice === 'jarvis'
                  ? 'speaking'
                  : hoveredPersona === 'jarvis'
                  ? 'thinking'
                  : 'idle'
              }
              persona="jarvis"
              size="sm"
              hideLabel
            />
          </div>

          {/* Title & Tagline */}
          <h3 className="text-base sm:text-lg font-mono tracking-[0.2em] text-[#E0FFFF] font-normal uppercase mt-0.5">
            J.A.R.V.I.S
          </h3>
          <p className="text-[9.5px] sm:text-[10px] font-mono tracking-[0.14em] text-[#4DE8E8]/80 font-medium uppercase mt-0.5">
            CORE COGNITIVE INTELLIGENCE
          </p>

          <p className="text-[10.5px] sm:text-[11.5px] font-mono tracking-wider text-white/60 mt-1 italic px-2 line-clamp-1">
            &ldquo;Measured. Precise. Unfailingly loyal.&rdquo;
          </p>

          {/* Interactive Tactical Telemetry Specs */}
          <div className="mt-2 w-full grid grid-cols-3 gap-1 py-1 px-1.5 rounded-md bg-black/40 border border-[#4DE8E8]/15 text-[8.5px] sm:text-[9px] font-mono">
            <div className="flex flex-col items-center">
              <span className="text-white/40 uppercase text-[7.5px] tracking-wider">RESPONSE</span>
              <span className="text-[#4DE8E8] font-bold tracking-widest">12ms</span>
            </div>
            <div className="flex flex-col items-center border-x border-[#4DE8E8]/10">
              <span className="text-white/40 uppercase text-[7.5px] tracking-wider">FIDELITY</span>
              <span className="text-[#4DE8E8] font-bold tracking-widest">99.7%</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-white/40 uppercase text-[7.5px] tracking-wider">ARCHITECT</span>
              <span className="text-white/80 font-semibold tracking-wider">HARI P.</span>
            </div>
          </div>

          {/* Interactive Voice Preview Button & Activation Button */}
          <div className="mt-2.5 w-full pt-2 border-t border-[#4DE8E8]/15 flex items-center justify-between gap-2">
            {/* Interactive Audio Preview Trigger */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleVoicePreview('jarvis', true);
              }}
              title="Click to preview JARVIS synthesized voice"
              className="group/btn flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[#4DE8E8]/25 bg-[#4DE8E8]/10 hover:bg-[#4DE8E8]/20 hover:border-[#4DE8E8]/50 text-[8.5px] sm:text-[9px] font-mono tracking-wider text-[#4DE8E8] transition-all duration-200 cursor-pointer"
            >
              {/* Animated Soundwave Frequency Bars */}
              <div className="flex items-center gap-0.5 h-2.5">
                {[3, 6, 9, 5].map((h, idx) => (
                  <span
                    key={idx}
                    className={`w-0.5 rounded-full transition-all duration-150 ${
                      playingVoice === 'jarvis'
                        ? 'bg-[#00FFFF] animate-pulse'
                        : 'bg-[#4DE8E8]/40 group-hover/btn:bg-[#4DE8E8]'
                    }`}
                    style={{
                      height: playingVoice === 'jarvis' ? `${h}px` : '3px',
                    }}
                  />
                ))}
              </div>
              <span className="uppercase font-semibold">
                {playingVoice === 'jarvis' ? 'PLAYING...' : 'PREVIEW VOICE'}
              </span>
            </button>

            {/* Activation Button */}
            <span
              className={`px-2.5 py-0.5 rounded-full text-[9px] sm:text-[9.5px] font-mono tracking-widest uppercase transition-all duration-200 ${
                selectedPersona === 'jarvis'
                  ? 'bg-[#00FFFF] text-black font-bold shadow-[0_0_12px_#00ffff]'
                  : 'bg-[#4DE8E8]/20 text-[#4DE8E8] group-hover:bg-[#4DE8E8] group-hover:text-black font-semibold'
              }`}
            >
              {selectedPersona === 'jarvis' ? 'ACTIVATING...' : 'ENGAGE'}
            </span>
          </div>
        </motion.div>

        {/* ═══ FRIDAY CARD (Adaptive Intelligence) ═══ */}
        <motion.div
          role="button"
          tabIndex={0}
          aria-label="Activate F.R.I.D.A.Y adaptive intelligence"
          onClick={() => handleCardClick('friday')}
          onMouseEnter={() => {
            setHoveredPersona('friday');
            handleVoicePreview('friday');
          }}
          onMouseLeave={() => setHoveredPersona(null)}
          onFocus={() => {
            setHoveredPersona('friday');
            handleVoicePreview('friday');
          }}
          onBlur={() => setHoveredPersona(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick('friday');
            }
          }}
          animate={{
            scale:
              selectedPersona === 'friday'
                ? 1.03
                : selectedPersona === 'jarvis'
                ? 0.9
                : hoveredPersona === 'friday'
                ? 1.02
                : 1,
            opacity: selectedPersona === 'jarvis' ? 0.15 : 1,
            y: hoveredPersona === 'friday' && !selectedPersona ? -3 : 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 24,
          }}
          className={`relative group rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col items-center text-center cursor-pointer transition-colors duration-300 backdrop-blur-xl border ${
            selectedPersona === 'friday'
              ? 'bg-[#FB7185]/10 border-[#FB7185] shadow-[0_0_30px_rgba(251,113,133,0.4)]'
              : hoveredPersona === 'friday'
              ? 'bg-black/80 border-[#FB7185]/80 shadow-[0_0_20px_rgba(251,113,133,0.2)]'
              : 'bg-black/60 border-[#F43F5E]/25 hover:border-[#F43F5E]/60 shadow-[0_0_15px_rgba(0,0,0,0.6)]'
          }`}
        >
          {/* Top Pill: Persona Badge & Protocol Tag */}
          <div className="w-full flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[8.5px] sm:text-[9px] font-mono tracking-[0.18em] text-rose-300/70 uppercase font-semibold">
              ARCH // TAC-02 · ADAPTIVE CORE
            </span>
            <span className="text-[8.5px] sm:text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full border border-rose-400/30 bg-rose-500/10 text-rose-300 uppercase font-semibold">
              ADAPTIVE AI
            </span>
          </div>

          {/* Live Mini Orb Preview (FRIDAY Rose / Coral / Lilac Theme) */}
          <div className="relative my-1 sm:my-1.5 flex items-center justify-center h-[120px] sm:h-[130px] md:h-[140px] w-full pointer-events-none">
            <JarvisOrb
              state={
                selectedPersona === 'friday' || playingVoice === 'friday'
                  ? 'speaking'
                  : hoveredPersona === 'friday'
                  ? 'thinking'
                  : 'idle'
              }
              persona="friday"
              size="sm"
              hideLabel
            />
          </div>

          {/* Title & Tagline */}
          <h3 className="text-base sm:text-lg font-mono tracking-[0.2em] text-[#FFF1F2] font-normal uppercase mt-0.5">
            F.R.I.D.A.Y
          </h3>
          <p className="text-[9.5px] sm:text-[10px] font-mono tracking-[0.14em] text-rose-300 font-medium uppercase mt-0.5">
            ADAPTIVE NEURAL INTELLIGENCE
          </p>

          <p className="text-[10.5px] sm:text-[11.5px] font-mono tracking-wider text-white/60 mt-1 italic px-2 line-clamp-1">
            &ldquo;Warmer. Faster. Endlessly resourceful.&rdquo;
          </p>

          {/* Interactive Tactical Telemetry Specs */}
          <div className="mt-2 w-full grid grid-cols-3 gap-1 py-1 px-1.5 rounded-md bg-black/40 border border-rose-400/15 text-[8.5px] sm:text-[9px] font-mono">
            <div className="flex flex-col items-center">
              <span className="text-white/40 uppercase text-[7.5px] tracking-wider">RESPONSE</span>
              <span className="text-rose-300 font-bold tracking-widest">8ms</span>
            </div>
            <div className="flex flex-col items-center border-x border-rose-400/10">
              <span className="text-white/40 uppercase text-[7.5px] tracking-wider">AGILITY</span>
              <span className="text-rose-300 font-bold tracking-widest">99.9%</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-white/40 uppercase text-[7.5px] tracking-wider">ARCHITECT</span>
              <span className="text-white/80 font-semibold tracking-wider">HARI P.</span>
            </div>
          </div>

          {/* Interactive Voice Preview Button & Activation Button */}
          <div className="mt-2.5 w-full pt-2 border-t border-rose-400/15 flex items-center justify-between gap-2">
            {/* Interactive Audio Preview Trigger */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleVoicePreview('friday', true);
              }}
              title="Click to preview FRIDAY synthesized voice"
              className="group/btn flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-rose-400/25 bg-rose-500/10 hover:bg-rose-500/20 hover:border-rose-400/50 text-[8.5px] sm:text-[9px] font-mono tracking-wider text-rose-300 transition-all duration-200 cursor-pointer"
            >
              {/* Animated Soundwave Frequency Bars */}
              <div className="flex items-center gap-0.5 h-2.5">
                {[5, 9, 6, 8].map((h, idx) => (
                  <span
                    key={idx}
                    className={`w-0.5 rounded-full transition-all duration-150 ${
                      playingVoice === 'friday'
                        ? 'bg-[#FB7185] animate-pulse'
                        : 'bg-rose-400/40 group-hover/btn:bg-rose-300'
                    }`}
                    style={{
                      height: playingVoice === 'friday' ? `${h}px` : '3px',
                    }}
                  />
                ))}
              </div>
              <span className="uppercase font-semibold">
                {playingVoice === 'friday' ? 'PLAYING...' : 'PREVIEW VOICE'}
              </span>
            </button>

            {/* Activation Button */}
            <span
              className={`px-2.5 py-0.5 rounded-full text-[9px] sm:text-[9.5px] font-mono tracking-widest uppercase transition-all duration-200 ${
                selectedPersona === 'friday'
                  ? 'bg-[#FB7185] text-black font-bold shadow-[0_0_12px_#fb7185]'
                  : 'bg-rose-500/20 text-rose-300 group-hover:bg-[#FB7185] group-hover:text-black font-semibold'
              }`}
            >
              {selectedPersona === 'friday' ? 'ACTIVATING...' : 'ENGAGE'}
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
