'use client';

// ──────────────────────────────────────────────
// JarvisOrb — Volumetric Holographic Energy Core
// 6-Layer Architecture:
// 1. Ambient Glow Field (640px spread, breathing 22-44% opacity, cyan-violet)
// 2. 3 Distinct Concentric Ring Tracks (SVG viewBox 400x400)
// 3. Radar Sweep (Soft 40deg conic-gradient foggy wedge, strictly masked to 96-170px ring band)
// 4. Glass Core Sphere (Base gradient, concave inner shadow, specular reflection, frosted grain)
// 5. Plasma Motion Inside Core (3 high-visibility colored blobs, blur(8-10px), clearly visible in stills)
// 6. Integrated Arc Equalizer (16 radial bars in clear 74-98px band, z-20 foreground overlay)
// ──────────────────────────────────────────────

import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { JarvisState, VoicePersona } from '@/types';
import { useAudioVisualizer } from '@/hooks/useAudioVisualizer';

export type BootNarrativePhase =
  | 'dormant'
  | 'handshake'
  | 'verifying'
  | 'confirmed'
  | 'booting'
  | 'online';

interface JarvisOrbProps {
  state: JarvisState;
  hideLabel?: boolean;
  bootPhase?: BootNarrativePhase;
  persona?: VoicePersona;
  size?: 'sm' | 'md' | 'lg';
  isMicKilled?: boolean;
}

export default function JarvisOrb({
  state,
  hideLabel,
  bootPhase,
  persona = 'jarvis',
  size = 'md',
  isMicKilled = false,
}: JarvisOrbProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        const mobile =
          window.innerWidth < 768 ||
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        setIsMobile(mobile);
      };
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }
  }, []);

  const { levels: audioLevels, volume } = useAudioVisualizer({
    isActive: state === 'listening' || state === 'speaking',
    barCount: 16,
    skipHardwareMic: isMobile,
  });

  // Effective state taking bootPhase narrative into account
  const effectiveState = useMemo(() => {
    if (bootPhase === 'verifying') return 'thinking';
    return state;
  }, [bootPhase, state]);

  const isFriday = persona === 'friday';

  // ── Tri-state color discipline + boot narrative themes + dual persona identity ──
  const colorTheme = useMemo(() => {
    if (bootPhase === 'confirmed') {
      return {
        primary: isFriday ? '#FB7185' : '#00FFFF',
        secondary: isFriday ? '#F43F5E' : '#4DE8E8',
        ambient: isFriday
          ? 'radial-gradient(circle, rgba(251, 113, 133, 0.7) 0%, rgba(244, 63, 94, 0.45) 35%, rgba(192, 132, 252, 0.15) 65%, transparent 100%)'
          : 'radial-gradient(circle, rgba(0, 255, 255, 0.7) 0%, rgba(77, 232, 232, 0.45) 35%, rgba(0, 255, 255, 0.12) 65%, transparent 100%)',
        coreBase: isFriday
          ? 'radial-gradient(circle at 35% 35%, #9f1239 0%, #4c0519 45%, #1f0208 80%, #000000 100%)'
          : 'radial-gradient(circle at 35% 35%, #0891b2 0%, #0e7490 45%, #083344 80%, #000000 100%)',
        concaveShadow:
          'radial-gradient(circle at 68% 68%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, transparent 75%)',
        plasma1: isFriday ? '#FB7185' : '#00FFFF', // High-lumens rose/cyan
        plasma2: isFriday ? '#C084FC' : '#38BDF8', // Lilac/Sky
        plasma3: '#FFFFFF', // Pure white core
        radarConic: isFriday
          ? 'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(244,63,94,0.08) 8deg, rgba(251,113,133,0.35) 20deg, rgba(244,63,94,0.75) 32deg, rgba(255,228,230,0.95) 38deg, rgba(255,255,255,1) 40deg, transparent 40.5deg, transparent 360deg)'
          : 'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(0,255,255,0.08) 8deg, rgba(77,232,232,0.35) 20deg, rgba(0,255,255,0.75) 32deg, rgba(224,255,255,0.95) 38deg, rgba(255,255,255,1) 40deg, transparent 40.5deg, transparent 360deg)',
        glowFilter: isFriday
          ? 'drop-shadow(0 0 22px rgba(244, 63, 94, 0.95))'
          : 'drop-shadow(0 0 22px rgba(0, 255, 255, 0.95))',
        stateText: isFriday ? '#FB7185' : '#00FFFF',
        arcBase: isFriday ? '#FB7185' : '#00FFFF',
        arcPeak: '#FFFFFF',
        specularColor: 'rgba(255, 255, 255, 1)',
        innerShadow: isFriday
          ? 'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 24px rgba(251, 113, 133, 0.65)'
          : 'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 24px rgba(0, 255, 255, 0.65)',
      };
    }

    switch (effectiveState) {
      case 'receiving':
        return isFriday
          ? {
              primary: '#F43F5E',
              secondary: '#FDA4AF',
              ambient:
                'radial-gradient(circle, rgba(244, 63, 94, 0.75) 0%, rgba(225, 29, 72, 0.5) 40%, rgba(244, 63, 94, 0.18) 70%, transparent 100%)',
              coreBase:
                'radial-gradient(circle at 35% 35%, #9f1239 0%, #4c0519 50%, #1f0208 85%, #000000 100%)',
              concaveShadow:
                'radial-gradient(circle at 68% 68%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, transparent 75%)',
              plasma1: '#FB7185',
              plasma2: '#FDA4AF',
              plasma3: '#FFFFFF',
              radarConic:
                'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(244,63,94,0.1) 8deg, rgba(251,113,133,0.4) 20deg, rgba(244,63,94,0.85) 32deg, rgba(255,255,255,1) 40deg, transparent 40.5deg, transparent 360deg)',
              glowFilter: 'drop-shadow(0 0 22px rgba(244, 63, 94, 0.95))',
              stateText: '#FDA4AF',
              arcBase: '#F43F5E',
              arcPeak: '#FFFFFF',
              specularColor: 'rgba(255, 255, 255, 1)',
              innerShadow:
                'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 22px rgba(244, 63, 94, 0.75)',
            }
          : {
              primary: '#10B981',
              secondary: '#6EE7B7',
              ambient:
                'radial-gradient(circle, rgba(16, 185, 129, 0.75) 0%, rgba(5, 150, 105, 0.5) 40%, rgba(16, 185, 129, 0.18) 70%, transparent 100%)',
              coreBase:
                'radial-gradient(circle at 35% 35%, #065f46 0%, #064e3b 50%, #022c22 85%, #000000 100%)',
              concaveShadow:
                'radial-gradient(circle at 68% 68%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, transparent 75%)',
              plasma1: '#10B981',
              plasma2: '#34D399',
              plasma3: '#FFFFFF',
              radarConic:
                'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(16,185,129,0.1) 8deg, rgba(52,211,153,0.4) 20deg, rgba(16,185,129,0.85) 32deg, rgba(255,255,255,1) 40deg, transparent 40.5deg, transparent 360deg)',
              glowFilter: 'drop-shadow(0 0 22px rgba(16, 185, 129, 0.95))',
              stateText: '#6EE7B7',
              arcBase: '#10B981',
              arcPeak: '#FFFFFF',
              specularColor: 'rgba(255, 255, 255, 1)',
              innerShadow:
                'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 22px rgba(16, 185, 129, 0.75)',
            };
      case 'thinking':
        return {
          primary: '#F59E0B',
          secondary: '#FCD34D',
          ambient:
            'radial-gradient(circle, rgba(245, 158, 11, 0.45) 0%, rgba(217, 119, 6, 0.28) 40%, rgba(245, 158, 11, 0.08) 70%, transparent 100%)',
          coreBase:
            'radial-gradient(circle at 35% 35%, #78350f 0%, #451a03 50%, #1c0a00 85%, #000000 100%)',
          concaveShadow:
            'radial-gradient(circle at 68% 68%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, transparent 75%)',
          plasma1: '#F59E0B', // Warm amber
          plasma2: '#EA580C', // Deep orange
          plasma3: '#FFFBEB', // White-hot core
          radarConic:
            'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(245,158,11,0.04) 8deg, rgba(245,158,11,0.22) 20deg, rgba(245,158,11,0.55) 32deg, rgba(251,191,36,0.85) 38deg, rgba(255,255,255,0.95) 40deg, transparent 40.5deg, transparent 360deg)',
          glowFilter: 'drop-shadow(0 0 14px rgba(245, 158, 11, 0.75))',
          stateText: '#F59E0B',
          arcBase: '#F59E0B',
          arcPeak: '#FFFFFF',
          specularColor: 'rgba(255, 251, 235, 0.95)',
          innerShadow:
            'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 18px rgba(245, 158, 11, 0.35)',
        };
      case 'speaking':
        return isFriday
          ? {
              primary: '#FB7185',
              secondary: '#FFE4E6',
              ambient:
                'radial-gradient(circle, rgba(251, 113, 133, 0.5) 0%, rgba(244, 63, 94, 0.3) 40%, rgba(251, 113, 133, 0.08) 70%, transparent 100%)',
              coreBase:
                'radial-gradient(circle at 35% 35%, #9f1239 0%, #4c0519 50%, #1f0208 85%, #000000 100%)',
              concaveShadow:
                'radial-gradient(circle at 68% 68%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, transparent 75%)',
              plasma1: '#FB7185', // Electric coral
              plasma2: '#E11D48', // Deep crimson
              plasma3: '#FFFFFF', // Pure white
              radarConic:
                'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(251,113,133,0.04) 8deg, rgba(251,113,133,0.22) 20deg, rgba(251,113,133,0.55) 32deg, rgba(255,228,230,0.85) 38deg, rgba(255,255,255,0.95) 40deg, transparent 40.5deg, transparent 360deg)',
              glowFilter: 'drop-shadow(0 0 16px rgba(251, 113, 133, 0.8))',
              stateText: '#FFE4E6',
              arcBase: '#FB7185',
              arcPeak: '#FFFFFF',
              specularColor: 'rgba(255, 255, 255, 0.95)',
              innerShadow:
                'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 18px rgba(251, 113, 133, 0.4)',
            }
          : {
              primary: '#38BDF8',
              secondary: '#E0F2FE',
              ambient:
                'radial-gradient(circle, rgba(56, 189, 248, 0.5) 0%, rgba(14, 165, 233, 0.3) 40%, rgba(56, 189, 248, 0.08) 70%, transparent 100%)',
              coreBase:
                'radial-gradient(circle at 35% 35%, #0369a1 0%, #082f49 50%, #031826 85%, #000000 100%)',
              concaveShadow:
                'radial-gradient(circle at 68% 68%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, transparent 75%)',
              plasma1: '#38BDF8', // Electric sky blue
              plasma2: '#2563EB', // Deep royal blue
              plasma3: '#FFFFFF', // Pure white
              radarConic:
                'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(56,189,248,0.04) 8deg, rgba(56,189,248,0.22) 20deg, rgba(56,189,248,0.55) 32deg, rgba(186,230,253,0.85) 38deg, rgba(255,255,255,0.95) 40deg, transparent 40.5deg, transparent 360deg)',
              glowFilter: 'drop-shadow(0 0 16px rgba(56, 189, 248, 0.8))',
              stateText: '#E0F2FE',
              arcBase: '#38BDF8',
              arcPeak: '#FFFFFF',
              specularColor: 'rgba(255, 255, 255, 0.95)',
              innerShadow:
                'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 18px rgba(56, 189, 248, 0.4)',
            };
      case 'listening':
      case 'idle':
      default:
        return isFriday
          ? {
              primary: '#F43F5E', // Rose 500
              secondary: '#C084FC', // Lilac 400
              ambient:
                'radial-gradient(circle, rgba(244, 63, 94, 0.48) 0%, rgba(192, 132, 252, 0.3) 40%, rgba(245, 158, 11, 0.08) 70%, transparent 100%)',
              coreBase:
                'radial-gradient(circle at 35% 35%, #881337 0%, #4c0519 50%, #1a0208 85%, #000000 100%)',
              concaveShadow:
                'radial-gradient(circle at 68% 68%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, transparent 75%)',
              plasma1: '#FB7185', // Electric coral-rose
              plasma2: '#C084FC', // Radiant lilac
              plasma3: '#FFF1F2', // Warm radiant core
              radarConic:
                'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(244,63,94,0.04) 8deg, rgba(251,113,133,0.22) 20deg, rgba(244,63,94,0.55) 32deg, rgba(253,164,175,0.85) 38deg, rgba(255,255,255,0.95) 40deg, transparent 40.5deg, transparent 360deg)',
              glowFilter: 'drop-shadow(0 0 16px rgba(244, 63, 94, 0.8))',
              stateText: '#FB7185',
              arcBase: '#FB7185',
              arcPeak: '#FFF1F2',
              specularColor: 'rgba(255, 241, 242, 0.95)',
              innerShadow:
                'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 18px rgba(251, 113, 133, 0.45)',
            }
          : {
              primary: '#4DE8E8',
              secondary: '#C026D3',
              ambient:
                'radial-gradient(circle, rgba(77, 232, 232, 0.48) 0%, rgba(192, 38, 211, 0.3) 40%, rgba(77, 232, 232, 0.08) 70%, transparent 100%)',
              coreBase:
                'radial-gradient(circle at 35% 35%, #0e7490 0%, #083344 50%, #02121e 85%, #000000 100%)',
              concaveShadow:
                'radial-gradient(circle at 68% 68%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, transparent 75%)',
              plasma1: '#00F5FF', // Electric vibrant cyan
              plasma2: '#C026D3', // Vibrant purple/magenta
              plasma3: '#FFFFFF', // High-lumens white core
              radarConic:
                'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(77,232,232,0.04) 8deg, rgba(77,232,232,0.22) 20deg, rgba(77,232,232,0.55) 32deg, rgba(125,245,245,0.85) 38deg, rgba(255,255,255,0.95) 40deg, transparent 40.5deg, transparent 360deg)',
              glowFilter: 'drop-shadow(0 0 14px rgba(77, 232, 232, 0.75))',
              stateText: isMicKilled ? '#F87171' : (isFriday ? '#FB7185' : '#4DE8E8'),
              arcBase: isFriday ? '#FB7185' : '#4DE8E8',
              arcPeak: '#FFFFFF',
              specularColor: 'rgba(224, 255, 255, 0.95)',
              innerShadow:
                'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 18px rgba(77, 232, 232, 0.4)',
            };
    }
  }, [effectiveState, bootPhase, isFriday, isMicKilled]);

  const voiceScale = 1 + (state === 'listening' || state === 'speaking' || state === 'receiving' ? volume * 0.14 : 0);

  const stateLabel =
    state === 'receiving'
      ? 'RECEIVING STREAM...'
      : state === 'listening'
      ? 'LISTENING...'
      : state === 'thinking'
      ? 'THINKING...'
      : state === 'speaking'
      ? 'SPEAKING...'
      : isMicKilled
      ? 'MIC DISABLED'
      : 'IDLE';

  // ── Arc Equalizer geometry ──
  // 16 bars spanning the lower 110 degrees (35deg to 145deg)
  // Base radius rStart = 74px (just outside the 70px core radius)
  // End radius rEnd extends outward towards r=98px (inner side of ring 3 at r=100)
  // Completely clear of the core, clearly visible, and distinctly hugging the inner arc!
  const arcBars = useMemo(() => {
    const cx = 200;
    const cy = 200;
    const rStart = 74;
    const count = 16;
    const startAngle = 35;
    const endAngle = 145;
    const angleStep = (endAngle - startAngle) / (count - 1);

    return audioLevels.map((lvl, idx) => {
      const deg = startAngle + idx * angleStep;
      const rad = (deg * Math.PI) / 180;
      // Bar length ranges from 7px base up to 24px on strong input (reaches r=98px)
      const barLen = 7 + lvl * 17;
      const rEnd = rStart + barLen;

      const x1 = cx + rStart * Math.cos(rad);
      const y1 = cy + rStart * Math.sin(rad);
      const x2 = cx + rEnd * Math.cos(rad);
      const y2 = cy + rEnd * Math.sin(rad);

      const isPeak = lvl > 0.5;
      const strokeColor = isPeak ? colorTheme.arcPeak : colorTheme.arcBase;
      const opacity = state === 'idle' ? 0.6 : Math.min(1, 0.65 + lvl * 0.35);

      return { x1, y1, x2, y2, strokeColor, opacity, isPeak, lvl, barLen };
    });
  }, [audioLevels, colorTheme, state]);

  // Plasma churn speed multiplier from voice volume
  const plasmaDriftMul = 1 + volume * 1.2;

  // ── Dynamic boot narrative animation timings & persona kinematics ──
  const radarSweepDuration = useMemo(() => {
    if (bootPhase === 'handshake') return '2s';
    if (bootPhase === 'verifying') return '3s';
    if (bootPhase === 'confirmed') return '1.4s';
    if (effectiveState === 'receiving') return '1.2s';
    if (isFriday) return effectiveState === 'thinking' ? '2.8s' : '4.8s';
    return effectiveState === 'thinking' ? '3.5s' : '7s';
  }, [bootPhase, effectiveState, isFriday]);

  const ring1Duration = useMemo(() => {
    if (bootPhase === 'handshake') return '4.5s';
    if (bootPhase === 'verifying') return '8s';
    if (bootPhase === 'confirmed') return '2s';
    if (effectiveState === 'receiving') return '3.5s';
    if (isFriday) return '16s';
    return '25s';
  }, [bootPhase, effectiveState, isFriday]);

  const ring2Duration = useMemo(() => {
    if (bootPhase === 'handshake') return '2.6s';
    if (bootPhase === 'verifying') return '5s';
    if (bootPhase === 'confirmed') return '1.5s';
    if (effectiveState === 'receiving') return '2.2s';
    if (isFriday) return effectiveState === 'thinking' ? '5.2s' : '9s';
    return effectiveState === 'thinking' ? '7s' : '14s';
  }, [bootPhase, effectiveState, isFriday]);

  const coreBrightnessFilter = useMemo(() => {
    if (bootPhase === 'handshake') return 'brightness(1.24) contrast(1.1)';
    if (bootPhase === 'confirmed')
      return `brightness(1.5) drop-shadow(0 0 28px ${isFriday ? '#fb7185' : '#00ffff'})`;
    return 'none';
  }, [bootPhase, isFriday]);

  const stageSizeClasses = useMemo(() => {
    if (size === 'sm') {
      return 'w-[110px] h-[110px] sm:w-[125px] sm:h-[125px] md:w-[135px] md:h-[135px] min-w-[95px] min-h-[95px]';
    }
    return 'w-[220px] h-[220px] sm:w-[270px] sm:h-[270px] md:w-[330px] md:h-[330px] lg:w-[400px] lg:h-[400px] min-w-[200px] min-h-[200px]';
  }, [size]);

  const ambientSpreadClasses = useMemo(() => {
    if (size === 'sm') {
      return 'w-[130px] h-[130px] sm:w-[155px] sm:h-[155px] blur-[16px] sm:blur-[22px]';
    }
    return 'w-[280px] h-[280px] sm:w-[360px] sm:h-[360px] md:w-[480px] md:h-[480px] lg:w-[640px] lg:h-[640px] blur-[36px] sm:blur-[50px] md:blur-[72px] lg:blur-[95px]';
  }, [size]);

  return (
    <div className="relative flex flex-col items-center justify-center select-none">

      {/* ═══ AMBIENT GLOW FIELD ═══ */}
      <motion.div
        className={`absolute rounded-full pointer-events-none -z-10 ${ambientSpreadClasses}`}
        style={{
          background: colorTheme.ambient,
        }}
        animate={{
          opacity:
            bootPhase === 'confirmed'
              ? [0.6, 0.95, 0.6]
              : state === 'idle'
              ? [0.22, 0.44, 0.22]
              : [0.28, 0.55, 0.28],
          scale: bootPhase === 'confirmed' ? [1, 1.18, 1] : [0.94, 1.10, 0.94],
        }}
        transition={{
          duration: bootPhase === 'confirmed' ? 0.6 : state === 'thinking' ? 2 : 4.5,
          repeat: bootPhase === 'confirmed' ? 1 : Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* ═══ Main Holographic Stage Container ═══ */}
      <motion.div
        className={`relative flex items-center justify-center ${stageSizeClasses}`}
        animate={{
          scale: bootPhase === 'confirmed' ? voiceScale * 1.06 : voiceScale,
        }}
        transition={{ type: 'spring', stiffness: 280, damping: 18 }}
      >

        {/* ═══ FIX 1: RADAR SWEEP — Soft Foggy 40deg Conic Wedge ═══
            Confined strictly to ring band (r: 23.5% to 42.5%) via scalable percentage radial mask.
            Bright leading edge at 40deg fading backward to 0deg, rotating smoothly as a glow. */}
        <div
          className="absolute inset-0 w-full h-full rounded-full pointer-events-none origin-center animate-ring-slow"
          style={{
            background: colorTheme.radarConic,
            /* Scalable percentage mask: transparent inside core (r < 23.5%), visible across ring band (24.5% - 42%), transparent outside (r > 43%) */
            maskImage: 'radial-gradient(circle at center, transparent 23.5%, black 24.5%, black 42%, transparent 43%)',
            WebkitMaskImage: 'radial-gradient(circle at center, transparent 23.5%, black 24.5%, black 42%, transparent 43%)',
            animationDuration: radarSweepDuration,
          }}
        />

        {/* ═══ 3 DISTINCT RING TRACKS & SATELLITE DOTS (SVG 400x400) ═══ */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          viewBox="0 0 400 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colorTheme.primary} stopOpacity="0.95" />
              <stop offset="40%" stopColor={colorTheme.secondary} stopOpacity="0.85" />
              <stop offset="100%" stopColor={colorTheme.primary} stopOpacity="0.9" />
            </linearGradient>

            <filter id="orbBloom" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3" result="blur1" />
              <feGaussianBlur stdDeviation="8" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="glassGrain" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="1" result="noise" />
              <feColorMatrix
                type="matrix"
                values="1 0 0 0 0
                        0 1 0 0 0
                        0 0 1 0 0
                        0 0 0 0.12 0"
              />
            </filter>

            <filter id="eqBarGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.5" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ── RING 1 (OUTERMOST): Solid gradient, r=168, clockwise ── */}
          <circle
            cx="200" cy="200" r="168"
            stroke="url(#ringGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
            style={{
              filter: colorTheme.glowFilter,
              transformOrigin: '200px 200px',
              animation: `ring-rotate ${ring1Duration} linear infinite`,
            }}
          />

          {/* ── RING 2 (MIDDLE): Segmented tick-mark bezel, r=125, counter-clockwise ── */}
          <circle
            cx="200" cy="200" r="125"
            stroke={colorTheme.primary}
            strokeWidth="2.5"
            strokeOpacity="0.6"
            strokeDasharray="4 10"
            style={{
              transformOrigin: '200px 200px',
              animation: `ring-rotate ${ring2Duration} linear infinite reverse`,
            }}
          />

          {/* ── RING 3 (INNER): Static baseline guide ring, r=100 ── */}
          <circle
            cx="200" cy="200" r="100"
            stroke={colorTheme.secondary}
            strokeWidth="1.2"
            strokeOpacity="0.4"
          />

          {/* ═══ FIX 2: 3 INDEPENDENTLY ORBITING SATELLITE DOTS ═══
              All 3 dots orbit on the inner ring track (r=100) around center (200, 200).
              Each uses distinct orbital periods (6s, 9s, 14s) so relative positions visibly shift every second.
              SVG animateTransform guarantees 100% reliable hardware-accelerated rotation. */}

          {/* Satellite 1: Fast clockwise orbit (6s period = 60deg/sec) */}
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 200 200"
              to="360 200 200"
              dur="6s"
              repeatCount="indefinite"
            />
            <circle cx="300" cy="200" r="4.5" fill={colorTheme.primary} filter={isMobile ? undefined : 'url(#orbBloom)'} />
            <circle cx="300" cy="200" r="2" fill="#ffffff" />
          </g>

          {/* Satellite 2: Medium counter-clockwise orbit (9s period = -40deg/sec, starts at 120deg) */}
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="360 200 200"
              to="0 200 200"
              dur="9s"
              repeatCount="indefinite"
            />
            <circle cx="150" cy="286.6" r="4" fill={colorTheme.primary} filter={isMobile ? undefined : 'url(#orbBloom)'} />
            <circle cx="150" cy="286.6" r="1.8" fill="#ffffff" />
          </g>

          {/* Satellite 3: Slower clockwise orbit (14s period = 25.7deg/sec, starts at 240deg) */}
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 200 200"
              to="360 200 200"
              dur="14s"
              repeatCount="indefinite"
            />
            <circle cx="150" cy="113.4" r="4" fill={colorTheme.secondary} filter={isMobile ? undefined : 'url(#orbBloom)'} />
            <circle cx="150" cy="113.4" r="1.8" fill="#ffffff" />
          </g>
        </svg>

        {/* ═══ FIX 3: GLASS CORE SPHERE (Responsive 35% of Stage: 78px to 140px) ═══
            Deep volumetric ball with concave inner shadow, upper-left specular reflection,
            frosted grain, and 3 high-contrast drifting plasma blobs distinctly visible in stills. */}
        <div
          className={`relative w-[35%] h-[35%] rounded-full overflow-hidden flex items-center justify-center z-10 transition-[filter] duration-500 ease-out ${
            size === 'sm' ? 'min-w-[36px] min-h-[36px]' : 'min-w-[72px] min-h-[72px]'
          }`}
          style={{
            filter: coreBrightnessFilter,
            boxShadow: `
              0 0 35px ${colorTheme.primary}66,
              0 0 70px ${colorTheme.secondary}33,
              ${colorTheme.innerShadow}
            `,
          }}
        >
          {/* LAYER 4a: Base volumetric sphere gradient */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: colorTheme.coreBase }}
          />

          {/* LAYER 4b: Concave depth shadow layer — reinforces spherical interior */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: colorTheme.concaveShadow,
              mixBlendMode: 'multiply',
            }}
          />

          {/* ═══ 3 INDEPENDENTLY-DRIFTING COLORED PLASMA BLOBS ═══
              Vibrant, high-opacity, moderate-blur masses (clearly discernible in any screenshot). */}

          {/* Plasma Blob 1: Vibrant Cyan (Electric Primary) — 48% width, blur 8px, opacity 0.88 */}
          <motion.div
            className="absolute rounded-full pointer-events-none blur-[6px] sm:blur-[8px] md:blur-[10px]"
            style={{
              width: '48%',
              height: '48%',
              background: `radial-gradient(circle, ${colorTheme.plasma1} 0%, ${colorTheme.plasma1}bb 45%, transparent 75%)`,
              mixBlendMode: 'screen',
              opacity: 0.88,
            }}
            animate={{
              x: [-12, 14, -8, 8, -12],
              y: [-8, 8, 12, -10, -8],
              scale: [0.9 + volume * 0.2, 1.15 + volume * 0.15, 0.95 + volume * 0.2, 1.1 + volume * 0.15, 0.9 + volume * 0.2],
            }}
            transition={{
              duration: 8 / plasmaDriftMul,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Plasma Blob 2: Vibrant Violet / Magenta (Secondary Contrast) — 42% width, blur 8px, opacity 0.82 */}
          <motion.div
            className="absolute rounded-full pointer-events-none blur-[6px] sm:blur-[8px] md:blur-[10px]"
            style={{
              width: '42%',
              height: '42%',
              background: `radial-gradient(circle, ${colorTheme.plasma2} 0%, ${colorTheme.plasma2}aa 45%, transparent 75%)`,
              mixBlendMode: 'screen',
              opacity: 0.82,
            }}
            animate={{
              x: [12, -14, 12, -8, 12],
              y: [12, -8, -10, 8, 12],
              scale: [1.05 + volume * 0.2, 0.85 + volume * 0.15, 1.12 + volume * 0.2, 0.9 + volume * 0.15, 1.05 + volume * 0.2],
            }}
            transition={{
              duration: 6.5 / plasmaDriftMul,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Plasma Blob 3: White / Gold Radiant Core — 30% width, blur 6px, opacity 0.92 */}
          <motion.div
            className="absolute rounded-full pointer-events-none blur-[4px] sm:blur-[6px] md:blur-[8px]"
            style={{
              width: '30%',
              height: '30%',
              background: `radial-gradient(circle, ${colorTheme.plasma3} 0%, ${colorTheme.plasma3}cc 35%, transparent 70%)`,
              mixBlendMode: 'screen',
              opacity: 0.92,
            }}
            animate={{
              x: [-6, 10, -10, 8, -6],
              y: [8, -10, 6, -8, 8],
              scale: [0.8 + volume * 0.25, 1.25 + volume * 0.2, 0.85 + volume * 0.25, 1.15 + volume * 0.2, 0.8 + volume * 0.25],
            }}
            transition={{
              duration: 4.5 / plasmaDriftMul,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Frosted Glass Grain Texture Overlay (desktop only, omitted on mobile to prevent feTurbulence GPU lag) */}
          {!isMobile && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none rounded-full" style={{ opacity: 0.12 }}>
              <rect width="100%" height="100%" filter="url(#glassGrain)" />
            </svg>
          )}

          {/* Upper-Left Specular Highlight — Distinct bright crescent reflecting light on curved glass */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: '9%',
              left: '11%',
              width: '34%',
              height: '18%',
              borderRadius: '50%',
              background: `radial-gradient(ellipse at center, ${colorTheme.specularColor} 0%, rgba(255,255,255,0.7) 35%, rgba(77,232,232,0.25) 65%, transparent 80%)`,
              transform: 'rotate(-28deg)',
              mixBlendMode: 'screen',
              opacity: 0.9,
              filter: 'blur(1.2px)',
            }}
          />

          {/* Secondary Rim Refraction Glint (Bottom-Right) */}
          <div
            className="absolute pointer-events-none"
            style={{
              bottom: '7%',
              right: '12%',
              width: '24%',
              height: '12%',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.6) 0%, transparent 70%)',
              transform: 'rotate(18deg)',
              mixBlendMode: 'screen',
              opacity: 0.45,
              filter: 'blur(2px)',
            }}
          />
        </div>

        {/* ═══ FIX 4: ARC EQUALIZER (Z-20 Foreground Overlay) ═══
            16 radial bars positioned strictly in the clear band between core rim (r=74)
            and inner ring (r=98). Hugs the lower 110deg arc (35deg to 145deg).
            Visually distinct, rendered in front, and reacting dynamically to audio. */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
          viewBox="0 0 400 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g id="arc-equalizer-bars">
            {arcBars.map((bar, i) => (
              <line
                key={`arc-bar-${i}`}
                x1={bar.x1} y1={bar.y1}
                x2={bar.x2} y2={bar.y2}
                stroke={bar.strokeColor}
                strokeWidth={bar.isPeak ? 3.8 : 3.0}
                strokeLinecap="round"
                opacity={bar.opacity}
                style={{
                  transition: 'all 60ms ease-out',
                  filter: isMobile
                    ? `drop-shadow(0 0 3px ${bar.isPeak ? '#ffffff' : bar.strokeColor})`
                    : bar.isPeak
                    ? `drop-shadow(0 0 8px ${bar.strokeColor}) drop-shadow(0 0 3px #ffffff)`
                    : `drop-shadow(0 0 4px ${colorTheme.arcBase})`,
                }}
              />
            ))}
          </g>
        </svg>
      </motion.div>

      {/* ── State Label (Tier 1 Typography) ── */}
      {!hideLabel && (
        <div className="h-6 mt-2 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.span
              key={stateLabel}
              initial={{ opacity: 0, y: 3, letterSpacing: '0.2em' }}
              animate={{
                opacity: 1,
                y: 0,
                letterSpacing: state === 'thinking' ? '0.35em' : '0.28em',
              }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="text-[10px] sm:text-[11px] md:text-[12px] font-mono font-semibold uppercase tracking-[0.20em] sm:tracking-[0.28em]"
              style={{
                color: colorTheme.stateText,
                filter: `drop-shadow(0 0 8px ${colorTheme.stateText}99)`,
              }}
            >
              {stateLabel}
            </motion.span>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
