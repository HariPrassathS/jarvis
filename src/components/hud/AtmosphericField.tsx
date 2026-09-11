'use client';

// ──────────────────────────────────────────────
// AtmosphericField — Depth particles, HUD scanline sweep & cinematic vignette
// 60fps lightweight canvas + CSS hardware acceleration
// ──────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import type { VoicePersona } from '@/types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  maxAlpha: number;
  swaySpeed: number;
  swayOffset: number;
  color: string;
}

interface AtmosphericFieldProps {
  mode?: 'landing' | 'active';
  persona?: VoicePersona;
}

export default function AtmosphericField({ mode = 'active', persona = 'jarvis' }: AtmosphericFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isFriday = persona === 'friday';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let isPaused = false;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Adaptive density: 16 (mobile) vs 95 (desktop) in active mode, 12 vs 45 on landing
    const isMobile =
      width < 768 ||
      (typeof navigator !== 'undefined' &&
        (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)));
    const particleCount = mode === 'active' ? (isMobile ? 16 : 95) : isMobile ? 12 : 45;
    // On mobile, eliminate canvas shadowBlur (set to 0) to prevent GPU rasterization bottlenecks
    const shadowBlurAmount = isMobile ? 0 : mode === 'active' ? 5 : 3;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const particles: Particle[] = Array.from({ length: particleCount }, () => {
      const isAltColor = mode === 'active' && Math.random() > 0.8;
      const baseAlpha = mode === 'active' ? 0.08 + Math.random() * 0.22 : 0.04 + Math.random() * 0.12;
      const color = isFriday
        ? isAltColor ? '251, 191, 36' : '244, 63, 94'
        : isAltColor ? '192, 38, 211' : '77, 232, 232';

      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * (mode === 'active' ? 0.3 : 0.2),
        vy: -(0.18 + Math.random() * (mode === 'active' ? 0.45 : 0.35)),
        size: 0.9 + Math.random() * (mode === 'active' ? 2.0 : 1.4),
        alpha: baseAlpha,
        maxAlpha: baseAlpha + 0.15,
        swaySpeed: 0.001 + Math.random() * 0.002,
        swayOffset: Math.random() * Math.PI * 2,
        color,
      };
    });

    let lastTime = performance.now();

    function render(time: number) {
      if (isPaused || !ctx) return;
      const delta = Math.min((time - lastTime) / 16.66, 2.0); // normalize ~60fps
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        p.y += p.vy * delta;
        p.x += (p.vx + Math.sin(time * p.swaySpeed + p.swayOffset) * 0.2) * delta;

        // Wrap around borders
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        // Draw particle (clean un-blurred on mobile, soft glow on desktop)
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
        if (shadowBlurAmount > 0) {
          ctx.shadowBlur = shadowBlurAmount;
          ctx.shadowColor = `rgba(${p.color}, 0.5)`;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    }

    // Start loop
    animId = requestAnimationFrame(render);

    // Page Visibility API: pause when tab is backgrounded / screen locked to save battery
    const handleVisibility = () => {
      if (document.hidden) {
        isPaused = true;
        cancelAnimationFrame(animId);
      } else {
        if (isPaused) {
          isPaused = false;
          lastTime = performance.now();
          animId = requestAnimationFrame(render);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [mode, isFriday]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* 1. Canvas particle field */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ${
          mode === 'active' ? 'opacity-90' : 'opacity-70'
        }`}
      />

      {/* 2. Low-frequency horizontal scanline radar sweep (every 7s) */}
      <div className={`${isFriday ? 'hud-scan-sweep-friday' : 'hud-scan-sweep'} absolute inset-x-0 h-36 pointer-events-none opacity-40`} />

      {/* 3. Volumetric dark edge vignette & persona tactical border ambiance */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: isFriday
            ? 'radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(20,2,6,0.5) 75%, rgba(0,0,0,0.96) 100%)'
            : 'radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.95) 100%)',
          boxShadow: isFriday
            ? 'inset 0 0 70px rgba(244, 63, 94, 0.25), inset 0 0 140px rgba(159, 18, 57, 0.15)'
            : 'inset 0 0 70px rgba(77, 232, 232, 0.12), inset 0 0 140px rgba(8, 145, 178, 0.08)',
        }}
      />
    </div>
  );
}
