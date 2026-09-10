'use client';

// ──────────────────────────────────────────────
// useAudioVisualizer — Real Web Audio API Analyser Hook
// Throttled to ~30fps for smooth 60fps UI performance without re-render thrashing
// ──────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';

interface UseAudioVisualizerOptions {
  isActive: boolean;
  barCount?: number;
  fftSize?: number;
  smoothingTimeConstant?: number;
  skipHardwareMic?: boolean;
}

export interface AudioVisualizerData {
  levels: number[];
  volume: number; // 0..1 overall amplitude
}

export function useAudioVisualizer({
  isActive,
  barCount = 16,
  fftSize = 64,
  smoothingTimeConstant = 0.8,
  skipHardwareMic,
}: UseAudioVisualizerOptions): AudioVisualizerData {
  const [data, setData] = useState<AudioVisualizerData>(() => ({
    levels: new Array(barCount).fill(0.08),
    volume: 0,
  }));

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    let isMounted = true;

    // Detect mobile: mobile OSs enforce exclusive microphone hardware locks (AudioRecord on Android, AVAudioSession on iOS)
    const isMobileDevice =
      typeof navigator !== 'undefined' &&
      (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
        (typeof window !== 'undefined' && window.innerWidth < 768));

    const shouldSkipHardware = skipHardwareMic ?? isMobileDevice;

    async function initAudio() {
      if (!isActive) return;

      // On mobile devices, bypass hardware mic capture to keep the microphone stream
      // 100% free and uncontested for SpeechRecognition.
      if (shouldSkipHardware) {
        return;
      }

      try {
        if (!audioContextRef.current) {
          const AudioContextClass =
            window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            audioContextRef.current = new AudioContextClass();
          }
        }

        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }

        if (
          navigator.mediaDevices &&
          navigator.mediaDevices.getUserMedia &&
          !streamRef.current
        ) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });

          if (!isMounted) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          streamRef.current = stream;

          if (audioContextRef.current) {
            const analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = fftSize;
            analyser.smoothingTimeConstant = smoothingTimeConstant;
            analyserRef.current = analyser;

            const source = audioContextRef.current.createMediaStreamSource(stream);
            source.connect(analyser);
            sourceRef.current = source;
          }
        }
      } catch (err) {
        // User denied mic or running in simulated environment
        console.warn('[AudioVisualizer] Web Audio mic link inactive, using fallback synthesis:', err);
      }
    }

    initAudio();

    // ── Animation Loop (Throttled to ~30fps = ~33ms intervals) ──
    const targetInterval = 1000 / 30; // 33.3ms
    const dataArray = new Uint8Array(fftSize / 2);

    function updateBars(timestamp: number) {
      if (!isMounted) return;

      const delta = timestamp - lastTimeRef.current;
      if (delta >= targetInterval) {
        lastTimeRef.current = timestamp;

        if (isActive) {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);

            // Group frequency bins into barCount bars
            const step = Math.max(1, Math.floor(dataArray.length / barCount));
            const newLevels: number[] = [];
            let totalPower = 0;

            for (let i = 0; i < barCount; i++) {
              let sum = 0;
              for (let j = 0; j < step; j++) {
                const val = dataArray[i * step + j] || 0;
                sum += val;
                totalPower += val;
              }
              const avg = sum / step;
              // High sensitivity gain: normal speech drives bars vigorously into 0.4..1.0
              const speechLvl = (avg / 255) * 3.8;
              const ambientHum = Math.sin(timestamp * 0.006 + i * 0.5) * 0.05 + 0.12;
              const normalized = Math.max(0.12, Math.min(1.0, speechLvl + ambientHum));
              newLevels.push(normalized);
            }

            const rawVol = totalPower / (barCount * step * 255);
            const normalizedVol = Math.max(0, Math.min(1, rawVol * 3.6));

            setData({ levels: newLevels, volume: normalizedVol });
          } else {
            // Dynamic fallback pulse when mic stream is pending or fallback synthesis
            const time = timestamp / 240;
            let sumPulse = 0;
            const newLevels = Array.from({ length: barCount }, (_, i) => {
              const wave = Math.sin(time + i * 0.45) * 0.28 + Math.cos(time * 0.8 - i * 0.3) * 0.22;
              const lvl = Math.max(0.14, Math.min(0.92, 0.18 + Math.abs(wave)));
              sumPulse += lvl;
              return lvl;
            });
            setData({ levels: newLevels, volume: sumPulse / barCount });
          }
        } else {
          // Idle state: gentle rhythmic baseline (bars always visible at 12-16% height)
          const idleTime = timestamp / 600;
          const idleLevels = Array.from({ length: barCount }, (_, i) => {
            return 0.12 + Math.sin(idleTime + i * 0.4) * 0.04;
          });
          setData({
            levels: idleLevels,
            volume: 0,
          });
        }
      }

      animFrameIdRef.current = requestAnimationFrame(updateBars);
    }

    animFrameIdRef.current = requestAnimationFrame(updateBars);

    return () => {
      isMounted = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isActive, barCount, fftSize, smoothingTimeConstant, skipHardwareMic]);

  return data;
}
