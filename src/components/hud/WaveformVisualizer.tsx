'use client';

// ──────────────────────────────────────────────
// Waveform Visualizer — Audio bars during listen/speak
// ──────────────────────────────────────────────

import { motion } from 'framer-motion';

interface WaveformVisualizerProps {
  isActive: boolean;
  barCount?: number;
}

export default function WaveformVisualizer({
  isActive,
  barCount = 24,
}: WaveformVisualizerProps) {
  return (
    <div className="flex items-center justify-center gap-[3px] h-12">
      {Array.from({ length: barCount }).map((_, i) => {
        // Deterministic wave pattern based on position
        const delay = (i / barCount) * 0.6;
        const baseHeight = Math.sin((i / barCount) * Math.PI) * 0.7 + 0.3;
        const duration = 0.7 + (i % 4) * 0.1;

        return (
          <motion.div
            key={i}
            className="w-[2.5px] rounded-full bg-gradient-to-t from-cyan-500/70 to-cyan-300"
            animate={
              isActive
                ? {
                    height: [
                      `${baseHeight * 8}px`,
                      `${baseHeight * 38}px`,
                      `${baseHeight * 14}px`,
                      `${baseHeight * 30}px`,
                      `${baseHeight * 8}px`,
                    ],
                    opacity: [0.4, 0.95, 0.6, 0.85, 0.4],
                  }
                : {
                    height: '4px',
                    opacity: 0.25,
                  }
            }
            transition={
              isActive
                ? {
                    duration,
                    repeat: Infinity,
                    delay,
                    ease: 'easeInOut',
                  }
                : { duration: 0.3 }
            }
          />
        );
      })}
    </div>
  );
}
