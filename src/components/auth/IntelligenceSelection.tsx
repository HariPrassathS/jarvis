'use client';

// ──────────────────────────────────────────────
// IntelligenceSelection — Phase 3.5 Boot Narrative
// Dual Persona Pods: J.A.R.V.I.S (Core Intelligence) vs F.R.I.D.A.Y (Adaptive Intelligence)
// Features: Live Mini Orbs, Acoustic Hover Previews, Keyboard Accessibility & Smooth Handoff
// ──────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import JarvisOrb from '@/components/hud/JarvisOrb';
import type { VoicePersona } from '@/types';

interface IntelligenceSelectionProps {
  operatorName: string;
  initialPersona?: VoicePersona;
  onSelect: (persona: VoicePersona) => void;
  onPreviewVoice?: (text: string, persona: VoicePersona) => void;
  reducedMotion?: boolean;
}

export default function IntelligenceSelection({
  operatorName,
  initialPersona = 'jarvis',
  onSelect,
  onPreviewVoice,
  reducedMotion = false,
}: IntelligenceSelectionProps) {
  const [hoveredPersona, setHoveredPersona] = useState<VoicePersona | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<VoicePersona | null>(null);
  const lastPreviewedRef = useRef<{ persona: VoicePersona; timestamp: number } | null>(null);

  // Debounced audio voice preview on hover/focus to prevent stuttering
  const handleVoicePreview = useCallback(
    (persona: VoicePersona) => {
      const now = Date.now();
      if (
        lastPreviewedRef.current &&
        lastPreviewedRef.current.persona === persona &&
        now - lastPreviewedRef.current.timestamp < 3500
      ) {
        return; // Prevent repeating audio if still playing or hovered recently
      }
      lastPreviewedRef.current = { persona, timestamp: now };

      if (onPreviewVoice) {
        const sampleLine =
          persona === 'friday' ? 'Hey, boss. Ready when you are.' : 'At your service, sir.';
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

  return (
    <motion.div
      initial={{ opacity: 0, y: reducedMotion ? 0 : 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        scale: reducedMotion ? 1 : 0.96,
        filter: reducedMotion ? 'none' : 'blur(6px)',
        transition: { duration: 0.35, ease: 'easeInOut' },
      }}
      transition={{ duration: reducedMotion ? 0.2 : 0.55, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center w-full max-w-4xl px-3 sm:px-6 py-2 select-none z-20"
    >
      {/* ── Screen Header ── */}
      <div className="text-center mb-4 sm:mb-6">
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#4DE8E8]/20 bg-black/60 backdrop-blur-md mb-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#4DE8E8] animate-ping" />
          <span className="text-[9.5px] sm:text-[10.5px] font-mono tracking-[0.24em] text-[#4DE8E8]/90 uppercase font-semibold">
            BIOMETRIC LOCK VERIFIED // OPERATOR: {operatorName.toUpperCase()}
          </span>
        </motion.div>

        <h2 className="text-xl sm:text-2xl md:text-3xl font-mono tracking-[0.22em] text-white font-light uppercase drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]">
          SELECT ACTIVE INTELLIGENCE
        </h2>
        <p className="mt-1 text-[10px] sm:text-xs font-mono tracking-[0.16em] text-white/40 uppercase">
          Choose tactical neural architecture for this operational cycle
        </p>
      </div>

      {/* ── Dual Persona Interactive Cards / Pods ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full max-w-3xl">
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
                ? 1.04
                : selectedPersona === 'friday'
                ? 0.88
                : hoveredPersona === 'jarvis'
                ? 1.025
                : 1,
            opacity: selectedPersona === 'friday' ? 0.15 : 1,
            y: hoveredPersona === 'jarvis' && !selectedPersona ? -4 : 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 24,
          }}
          className={`relative group rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center cursor-pointer transition-colors duration-300 backdrop-blur-xl border ${
            selectedPersona === 'jarvis'
              ? 'bg-[#00FFFF]/10 border-[#00FFFF] shadow-[0_0_35px_rgba(0,255,255,0.45)]'
              : hoveredPersona === 'jarvis'
              ? 'bg-black/80 border-[#00FFFF]/80 shadow-[0_0_25px_rgba(0,255,255,0.25)]'
              : 'bg-black/60 border-[#4DE8E8]/25 hover:border-[#4DE8E8]/60 shadow-[0_0_15px_rgba(0,0,0,0.6)]'
          }`}
        >
          {/* Top Pill: Persona Badge & Protocol Tag */}
          <div className="w-full flex items-center justify-between gap-2 mb-1">
            <span className="text-[9px] font-mono tracking-[0.2em] text-[#4DE8E8]/60 uppercase">
              ARCH // MK-85
            </span>
            <span className="text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full border border-[#4DE8E8]/30 bg-[#4DE8E8]/10 text-[#4DE8E8] uppercase font-semibold">
              CORE AI
            </span>
          </div>

          {/* Live Mini Orb Preview (JARVIS Cyan / Violet Theme) */}
          <div className="relative my-2 sm:my-3 flex items-center justify-center h-[160px] sm:h-[180px] w-full pointer-events-none">
            <JarvisOrb
              state={selectedPersona === 'jarvis' ? 'speaking' : 'idle'}
              persona="jarvis"
              size="sm"
              hideLabel
            />
          </div>

          {/* Title & Tagline */}
          <h3 className="text-lg sm:text-xl font-mono tracking-[0.22em] text-[#E0FFFF] font-normal uppercase mt-1">
            J.A.R.V.I.S
          </h3>
          <p className="text-[10px] sm:text-[11px] font-mono tracking-[0.16em] text-[#4DE8E8]/80 font-medium uppercase mt-0.5">
            CORE INTELLIGENCE
          </p>

          <p className="text-[11px] sm:text-xs font-mono tracking-wider text-white/55 mt-2 italic px-2">
            &ldquo;Measured. Precise. Unfailingly loyal.&rdquo;
          </p>

          {/* Voice Preview Badge & Activation Button */}
          <div className="mt-4 w-full pt-3 border-t border-[#4DE8E8]/15 flex items-center justify-between gap-2">
            <span className="text-[9px] font-mono tracking-wider text-[#4DE8E8]/60 uppercase flex items-center gap-1">
              <svg className="w-3 h-3 text-[#4DE8E8]" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z"
                  clipRule="evenodd"
                />
              </svg>
              UK BRITISH // BUTLER
            </span>

            <span
              className={`px-3 py-1 rounded-full text-[10px] font-mono tracking-widest uppercase transition-all duration-200 ${
                selectedPersona === 'jarvis'
                  ? 'bg-[#00FFFF] text-black font-bold shadow-[0_0_15px_#00ffff]'
                  : 'bg-[#4DE8E8]/20 text-[#4DE8E8] group-hover:bg-[#4DE8E8] group-hover:text-black font-semibold'
              }`}
            >
              {selectedPersona === 'jarvis' ? 'ACTIVATING...' : 'ACTIVATE'}
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
                ? 1.04
                : selectedPersona === 'jarvis'
                ? 0.88
                : hoveredPersona === 'friday'
                ? 1.025
                : 1,
            opacity: selectedPersona === 'jarvis' ? 0.15 : 1,
            y: hoveredPersona === 'friday' && !selectedPersona ? -4 : 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 24,
          }}
          className={`relative group rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center cursor-pointer transition-colors duration-300 backdrop-blur-xl border ${
            selectedPersona === 'friday'
              ? 'bg-[#FB7185]/10 border-[#FB7185] shadow-[0_0_35px_rgba(251,113,133,0.45)]'
              : hoveredPersona === 'friday'
              ? 'bg-black/80 border-[#FB7185]/80 shadow-[0_0_25px_rgba(251,113,133,0.25)]'
              : 'bg-black/60 border-[#F43F5E]/25 hover:border-[#F43F5E]/60 shadow-[0_0_15px_rgba(0,0,0,0.6)]'
          }`}
        >
          {/* Top Pill: Persona Badge & Protocol Tag */}
          <div className="w-full flex items-center justify-between gap-2 mb-1">
            <span className="text-[9px] font-mono tracking-[0.2em] text-rose-300/60 uppercase">
              ARCH // TAC-02
            </span>
            <span className="text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full border border-rose-400/30 bg-rose-500/10 text-rose-300 uppercase font-semibold">
              ADAPTIVE AI
            </span>
          </div>

          {/* Live Mini Orb Preview (FRIDAY Rose / Coral / Lilac Theme) */}
          <div className="relative my-2 sm:my-3 flex items-center justify-center h-[160px] sm:h-[180px] w-full pointer-events-none">
            <JarvisOrb
              state={selectedPersona === 'friday' ? 'speaking' : 'idle'}
              persona="friday"
              size="sm"
              hideLabel
            />
          </div>

          {/* Title & Tagline */}
          <h3 className="text-lg sm:text-xl font-mono tracking-[0.22em] text-[#FFF1F2] font-normal uppercase mt-1">
            F.R.I.D.A.Y
          </h3>
          <p className="text-[10px] sm:text-[11px] font-mono tracking-[0.16em] text-rose-300 font-medium uppercase mt-0.5">
            ADAPTIVE INTELLIGENCE
          </p>

          <p className="text-[11px] sm:text-xs font-mono tracking-wider text-white/55 mt-2 italic px-2">
            &ldquo;Warmer. Faster. Endlessly resourceful.&rdquo;
          </p>

          {/* Voice Preview Badge & Activation Button */}
          <div className="mt-4 w-full pt-3 border-t border-rose-400/15 flex items-center justify-between gap-2">
            <span className="text-[9px] font-mono tracking-wider text-rose-300/60 uppercase flex items-center gap-1">
              <svg className="w-3 h-3 text-rose-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z"
                  clipRule="evenodd"
                />
              </svg>
              TACTICAL IRISH // WARM
            </span>

            <span
              className={`px-3 py-1 rounded-full text-[10px] font-mono tracking-widest uppercase transition-all duration-200 ${
                selectedPersona === 'friday'
                  ? 'bg-[#FB7185] text-black font-bold shadow-[0_0_15px_#fb7185]'
                  : 'bg-rose-500/20 text-rose-300 group-hover:bg-[#FB7185] group-hover:text-black font-semibold'
              }`}
            >
              {selectedPersona === 'friday' ? 'ACTIVATING...' : 'ACTIVATE'}
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
