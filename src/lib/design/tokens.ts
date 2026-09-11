// ──────────────────────────────────────────────
// J.A.R.V.I.S Design System Tokens & Motion Curves
// Unified physics springs, glow intensities, and color palettes
// ──────────────────────────────────────────────

export const motionTokens = {
  // Spring Physics Presets
  springs: {
    // Smooth cinematic entrance / stage changes
    cinematic: {
      type: 'spring' as const,
      stiffness: 180,
      damping: 24,
      mass: 1,
    },
    // Snappy interactive buttons and chips
    snappy: {
      type: 'spring' as const,
      stiffness: 340,
      damping: 28,
    },
    // Gentle floating / idle ambient movement
    gentle: {
      type: 'spring' as const,
      stiffness: 120,
      damping: 20,
    },
    // Bouncy feedback for actions
    bouncy: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 18,
    },
  },

  // State-specific plasma animation speeds and jitter
  plasma: {
    idle: {
      durationScale: 1.0,
      jitter: false,
    },
    listening: {
      durationScale: 1.2,
      jitter: false,
    },
    thinking: {
      durationScale: 3.8, // 3.8x faster erratic churn
      jitter: true,
    },
    speaking: {
      durationScale: 1.6,
      jitter: false,
    },
  },

  // Ring rotation durations by state
  rings: {
    jarvis: {
      outer: '24s',
      middle: '14s',
      inner: '30s',
      radar: '6.5s',
    },
    friday: {
      outer: '16s',
      middle: '9s',
      inner: '22s',
      radar: '4.8s',
    },
    thinking: {
      outer: '4s',
      middle: '2.5s',
      inner: '5s',
      radar: '1.4s',
    },
  },
};

export const glowTokens = {
  cyan: {
    subtle: '0 0 12px rgba(77, 232, 232, 0.25)',
    medium: '0 0 24px rgba(77, 232, 232, 0.45), 0 0 45px rgba(77, 232, 232, 0.18)',
    intense: '0 0 35px rgba(77, 232, 232, 0.75), 0 0 70px rgba(77, 232, 232, 0.35)',
    core: 'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 24px rgba(0, 255, 255, 0.75)',
  },
  rose: {
    subtle: '0 0 12px rgba(251, 113, 133, 0.25)',
    medium: '0 0 24px rgba(251, 113, 133, 0.45), 0 0 45px rgba(251, 113, 133, 0.18)',
    intense: '0 0 35px rgba(251, 113, 133, 0.75), 0 0 70px rgba(251, 113, 133, 0.35)',
    core: 'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 24px rgba(251, 113, 133, 0.75)',
  },
  amber: {
    subtle: '0 0 12px rgba(245, 158, 11, 0.25)',
    medium: '0 0 24px rgba(245, 158, 11, 0.45), 0 0 45px rgba(245, 158, 11, 0.18)',
    intense: '0 0 35px rgba(245, 158, 11, 0.75), 0 0 70px rgba(245, 158, 11, 0.35)',
    core: 'inset -14px -14px 28px rgba(0, 0, 0, 0.9), inset 8px 8px 24px rgba(245, 158, 11, 0.75)',
  },
};
