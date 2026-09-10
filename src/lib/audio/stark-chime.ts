// ──────────────────────────────────────────────
// Stark Industries Biometric Audio Chime
// Synthesizes a futuristic, crystal-clear dual-harmonic chime
// via the browser's native Web Audio API (zero external assets)
// ──────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play an authentic holographic confirmation chime:
 * 880Hz (A5) fundamental with 1760Hz (A6) overtone and exponential decay
 */
export function playStarkChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Master gain node
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.28, now + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    masterGain.connect(ctx.destination);

    // Fundamental Tone: 880Hz sine wave (A5)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(920, now + 0.15); // subtle pitch bloom
    osc1.connect(masterGain);

    // Harmonic Overtone: 1760Hz sine wave (A6) with faster decay
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1760, now);

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0.18, now);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc2.connect(overtoneGain);
    overtoneGain.connect(masterGain);

    // Sparkle Accent: 2640Hz high shimmer
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(2640, now);

    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.08, now);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc3.connect(shimmerGain);
    shimmerGain.connect(masterGain);

    // Start and stop oscillators
    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    osc1.stop(now + 0.6);
    osc2.stop(now + 0.4);
    osc3.stop(now + 0.25);
  } catch (err) {
    console.warn('[StarkChime] Audio playback suppressed:', err);
  }
}
