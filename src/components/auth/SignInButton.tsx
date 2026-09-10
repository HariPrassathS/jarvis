'use client';

// ──────────────────────────────────────────────
// Sign In — Real Google Authentication Button
// Thin cyan border, subtle inner glow, bloom hover, HUD aesthetic
// ──────────────────────────────────────────────

import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';

interface SignInButtonProps {
  isHandshaking?: boolean;
  isVerifying?: boolean;
  onStartHandshake?: () => void;
  customError?: string | null;
  onRetry?: () => void;
}

export default function SignInButton({
  isHandshaking = false,
  isVerifying = false,
  onStartHandshake,
  customError,
  onRetry,
}: SignInButtonProps) {
  const { signIn, loading, error: authError } = useAuth();
  const isLoading = loading || isHandshaking || isVerifying;
  const activeError = customError || authError;

  const handleClick = async () => {
    if (isLoading) return;
    if (activeError && onRetry) {
      onRetry();
      return;
    }
    if (onStartHandshake) {
      onStartHandshake();
    } else {
      signIn();
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* ── Primary Action: Sign in with Google / Morphing Handshake Pill ── */}
      <motion.button
        onClick={handleClick}
        disabled={isLoading && !isHandshaking && !isVerifying}
        layout
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className={`group relative flex items-center gap-3 px-7 py-3.5 rounded-full
                   border backdrop-blur-xl cursor-pointer overflow-hidden transition-all duration-300 select-none
                   ${
                     activeError
                       ? 'bg-red-500/[0.1] border-red-500/50 hover:border-red-400 hover:bg-red-500/[0.18] shadow-[0_0_25px_rgba(239,68,68,0.25)]'
                       : isLoading
                       ? 'bg-[#4DE8E8]/[0.15] border-[#4DE8E8]/80 shadow-[0_0_35px_rgba(77,232,232,0.4),inset_0_0_15px_rgba(77,232,232,0.2)]'
                       : 'bg-[#4DE8E8]/[0.08] border-[#4DE8E8]/40 hover:border-[#4DE8E8]/80 hover:bg-[#4DE8E8]/[0.15] hover:shadow-[0_0_30px_rgba(77,232,232,0.3),inset_0_0_16px_rgba(77,232,232,0.12)] active:scale-95'
                   }`}
        whileHover={{ scale: isLoading ? 1 : 1.03 }}
        whileTap={{ scale: isLoading ? 1 : 0.96 }}
      >
        {/* Dynamic Icon: Spinning HUD ring during handshake vs Google Icon vs Warning Tri */}
        <div className="flex-shrink-0 flex items-center justify-center">
          {activeError ? (
            <svg className="w-5 h-5 text-red-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : isLoading ? (
            <div className="relative w-5 h-5 flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border border-[#4DE8E8]/30 border-t-[#4DE8E8] border-r-[#4DE8E8] animate-spin" />
              <div className="absolute w-2 h-2 rounded-full bg-[#4DE8E8] shadow-[0_0_8px_#4DE8E8] animate-ping" />
            </div>
          ) : (
            <div className="opacity-90 group-hover:opacity-100 transition-opacity">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Morphing Label */}
        <span
          className={`font-mono font-medium text-xs sm:text-sm tracking-wider uppercase whitespace-nowrap transition-colors duration-300 ${
            activeError
              ? 'text-red-300'
              : isLoading
              ? 'text-[#E0FFFF]'
              : 'text-white'
          }`}
        >
          {activeError
            ? 'SIGNAL DISRUPTED — RETRY'
            : isHandshaking
            ? 'INITIATING HANDSHAKE...'
            : isVerifying
            ? 'VERIFYING CREDENTIALS...'
            : 'SIGN IN WITH GOOGLE'}
        </span>

        {/* Inner edge glow line (top) */}
        <div
          className="absolute top-0 left-[10%] right-[10%] h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: activeError
              ? 'linear-gradient(90deg, transparent, rgba(239,68,68,0.8), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(77,232,232,0.8), transparent)',
          }}
        />
      </motion.button>

      {/* In-character error feedback if any */}
      {activeError && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[11px] sm:text-xs font-mono text-red-400/90 tracking-wider text-center max-w-sm mt-0.5"
        >
          Signal lost, sir — let's try that again.
        </motion.p>
      )}
    </div>
  );
}
