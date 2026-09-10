'use client';

// ──────────────────────────────────────────────
// MobileDebugOverlay — On-Device Telemetry & Performance HUD
// Essential for physical mobile devices without desktop DevTools
// ──────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import { diagnosticLogger, type DiagnosticLogEntry } from '@/lib/debug/diagnostic-logger';

interface MobileDebugOverlayProps {
  forceVisible?: boolean;
}

export default function MobileDebugOverlay({ forceVisible = false }: MobileDebugOverlayProps) {
  const [isVisible, setIsVisible] = useState(forceVisible || diagnosticLogger.isEnabled());
  const [isMinimized, setIsMinimized] = useState(false);
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>([]);
  const [fps, setFps] = useState<number>(60);
  const [deviceInfo, setDeviceInfo] = useState<{
    ua: string;
    cores?: number;
    platform?: string;
  }>({ ua: '' });

  // Check URL parameter ?debug=1 on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isDebugParam = params.get('debug') === '1' || params.get('debug') === 'true';
      if (isDebugParam || forceVisible) {
        setIsVisible(true);
        diagnosticLogger.setEnabled(true);
      }

      setDeviceInfo({
        ua: navigator.userAgent,
        cores: navigator.hardwareConcurrency,
        platform: (navigator as any).userAgentData?.platform || navigator.platform,
      });
    }

    const unsubscribe = diagnosticLogger.subscribe((newLogs) => {
      setLogs(newLogs);
    });

    return unsubscribe;
  }, [forceVisible]);

  // Live FPS monitor loop
  useEffect(() => {
    if (!isVisible || isMinimized) return;

    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const calculateFps = (now: number) => {
      frameCount++;
      const delta = now - lastTime;
      if (delta >= 1000) {
        setFps(Math.round((frameCount * 1000) / delta));
        frameCount = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(calculateFps);
    };

    animId = requestAnimationFrame(calculateFps);
    return () => cancelAnimationFrame(animId);
  }, [isVisible, isMinimized]);

  if (!isVisible) return null;

  const latestTts = logs.find((l) => l.category === 'tts');
  const latestSpeech = logs.find((l) => l.category === 'speech');

  return (
    <aside
      role="complementary"
      aria-label="Mobile Diagnostics HUD"
      className="fixed bottom-1 left-1 right-1 sm:bottom-3 sm:right-3 sm:left-auto sm:w-[420px] z-50 select-none font-mono pointer-events-auto"
    >
      {/* Minimized Pill */}
      {isMinimized ? (
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/90 border border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.3)] text-[10px] text-emerald-400 font-bold backdrop-blur-md cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>HUD DEBUG: {fps} FPS</span>
          <span className="text-white/40">▲ EXPAND</span>
        </button>
      ) : (
        /* Full Telemetry HUD Card */
        <div className="flex flex-col max-h-[50vh] sm:max-h-[65vh] rounded-xl bg-black/95 border border-emerald-500/40 shadow-[0_0_30px_rgba(0,0,0,0.9),0_0_15px_rgba(16,185,129,0.2)] backdrop-blur-xl overflow-hidden text-[10px]">
          {/* Header Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-emerald-950/40 border-b border-emerald-500/30 text-emerald-300">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold tracking-wider">MOBILE DIAGNOSTICS</span>
              <span className="px-1.5 py-0.5 rounded bg-black/50 text-[9px] text-emerald-400 font-semibold border border-emerald-500/30">
                {fps} FPS
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => diagnosticLogger.clear()}
                className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[9px] text-white/70 transition-colors"
                title="Clear Logs"
              >
                CLEAR
              </button>
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[9px] text-white/70 transition-colors"
                title="Minimize Overlay"
              >
                ▼ MIN
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsVisible(false);
                  diagnosticLogger.setEnabled(false);
                }}
                className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/40 transition-colors text-[9px]"
                title="Close Debug Overlay"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 gap-1 px-3 py-1.5 bg-black/60 border-b border-emerald-500/20 text-[9px]">
            <div>
              <span className="text-white/40">VOICE: </span>
              <span className="text-cyan-300 font-semibold truncate inline-block max-w-[140px] align-bottom">
                {latestTts?.data?.voiceName || 'None'}
              </span>
              <span className="text-white/50 ml-1">
                ({latestTts?.data?.pitch?.toFixed?.(2) || '1.0'}p)
              </span>
            </div>
            <div className="text-right">
              <span className="text-white/40">SPEECH: </span>
              <span
                className={`font-semibold ${
                  latestSpeech?.event?.includes('error')
                    ? 'text-rose-400'
                    : latestSpeech?.event?.includes('result')
                    ? 'text-emerald-300'
                    : 'text-amber-300'
                }`}
              >
                {latestSpeech?.event || 'Idle'}
              </span>
            </div>
          </div>

          {/* Device Telemetry Tagline */}
          <div className="px-3 py-1 bg-black/40 text-[8px] text-white/40 border-b border-emerald-500/10 truncate">
            DEV: {deviceInfo.platform || 'Unknown'} · {deviceInfo.cores || '?'} CORES ·{' '}
            {deviceInfo.ua.includes('iPhone')
              ? 'iOS Safari'
              : deviceInfo.ua.includes('Android')
              ? 'Android'
              : 'Desktop'}
          </div>

          {/* Log Stream Area */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-emerald-500/30">
            {logs.length === 0 ? (
              <div className="text-center py-4 text-white/30 text-[9px]">
                Awaiting Speech / TTS / System Events...
              </div>
            ) : (
              logs.map((log) => {
                const isError = log.event.toLowerCase().includes('error');
                const isTts = log.category === 'tts';
                const isResult = log.event.includes('result');

                return (
                  <div
                    key={log.id}
                    className={`flex items-start gap-1.5 p-1 rounded transition-colors ${
                      isError
                        ? 'bg-rose-950/40 text-rose-300 border border-rose-500/30'
                        : isResult
                        ? 'bg-emerald-950/40 text-emerald-200 border border-emerald-500/20'
                        : isTts
                        ? 'bg-cyan-950/30 text-cyan-200'
                        : 'bg-white/[0.02] text-white/70'
                    }`}
                  >
                    <span className="text-white/30 text-[8px] flex-shrink-0 mt-0.5">
                      {log.timeFormatted}
                    </span>
                    <span
                      className={`text-[8px] uppercase font-bold px-1 rounded flex-shrink-0 ${
                        isError
                          ? 'bg-rose-500/20 text-rose-300'
                          : isTts
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {log.category}
                    </span>
                    <div className="flex-1 break-words">
                      <span className="font-semibold">{log.event}</span>
                      {log.data && (
                        <span className="text-white/50 text-[8.5px] ml-1">
                          {typeof log.data === 'string'
                            ? log.data
                            : JSON.stringify(log.data)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
