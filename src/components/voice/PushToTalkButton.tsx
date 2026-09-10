'use client';

// ──────────────────────────────────────────────
// Push-to-Talk Button
// ──────────────────────────────────────────────

import { motion } from 'framer-motion';

interface PushToTalkButtonProps {
  isListening: boolean;
  isSupported: boolean;
  onStart: () => void;
  onStop: () => void;
}

export default function PushToTalkButton({
  isListening,
  isSupported,
  onStart,
  onStop,
}: PushToTalkButtonProps) {
  if (!isSupported) {
    return (
      <div className="text-xs text-white/30 italic">
        Voice not supported in this browser
      </div>
    );
  }

  return (
    <motion.button
      onClick={isListening ? onStop : onStart}
      className={`relative flex items-center justify-center w-14 h-14 rounded-full
                  border-2 transition-all duration-300 cursor-pointer
                  ${
                    isListening
                      ? 'border-red-400/80 bg-red-500/20 shadow-[0_0_25px_rgba(239,68,68,0.3)]'
                      : 'border-cyan-500/40 bg-white/5 hover:border-cyan-400/70 hover:bg-white/10'
                  }`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={isListening ? 'Stop listening' : 'Start listening'}
    >
      {/* Microphone icon */}
      {isListening ? (
        // Stop icon (square)
        <motion.div
          className="w-5 h-5 bg-red-400 rounded-sm"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400 }}
        />
      ) : (
        // Mic icon
        <svg
          className="w-6 h-6 text-cyan-400/80"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
          />
        </svg>
      )}

      {/* Recording ring animation */}
      {isListening && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-red-400/50"
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </motion.button>
  );
}
