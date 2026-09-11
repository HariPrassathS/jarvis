'use client';

// ──────────────────────────────────────────────
// PrivacyModal — Data Governance & Security Matrix
// Features: Instant Self-Serve Data Export, Guarded Permanent Account Purge ("Forget Everything")
// ──────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VoicePersona } from '@/types';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  getIdToken: () => Promise<string | null>;
  onAccountPurged: () => Promise<void>;
  persona?: VoicePersona;
  reducedMotion?: boolean;
}

const REQUIRED_CONFIRMATION = 'DELETE ALL DATA';

export default function PrivacyModal({
  isOpen,
  onClose,
  getIdToken,
  onAccountPurged,
  persona = 'jarvis',
  reducedMotion = false,
}: PrivacyModalProps) {
  const isFriday = persona === 'friday';
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [confirmText, setConfirmText] = useState('');
  const [isPurging, setIsPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setExportError(null);
      setPurgeError(null);
      setExportSuccess(false);
    }
  }, [isOpen]);

  // ── Handle Self-Serve Data Export ──
  const handleExportData = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(false);

    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Authentication required for data export.');
      }

      const res = await fetch('/api/privacy/export', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate export archive.');
      }

      // Download file to client
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      let filename = 'jarvis-data-export.json';
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportSuccess(true);
    } catch (err: any) {
      console.error('[PrivacyModal] Export error:', err);
      setExportError(err?.message || 'Data export failed.');
    } finally {
      setIsExporting(false);
    }
  }, [getIdToken]);

  // ── Handle Irreversible Data Purge ──
  const handlePurgeAccount = useCallback(async () => {
    if (confirmText.trim() !== REQUIRED_CONFIRMATION) return;
    setIsPurging(true);
    setPurgeError(null);

    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Authentication required.');
      }

      const res = await fetch('/api/privacy/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmation: REQUIRED_CONFIRMATION }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to purge account data.');
      }

      onClose();
      await onAccountPurged();
    } catch (err: any) {
      console.error('[PrivacyModal] Purge error:', err);
      setPurgeError(err?.message || 'Data purge failed.');
      setIsPurging(false);
    }
  }, [confirmText, getIdToken, onClose, onAccountPurged]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/80 backdrop-blur-md">
        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.94, y: reducedMotion ? 0 : 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.94, y: reducedMotion ? 0 : 12 }}
          transition={{ duration: reducedMotion ? 0.15 : 0.25, ease: 'easeOut' }}
          className={`relative w-full max-w-lg rounded-2xl bg-black/90 border p-4 sm:p-6 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,0,0,0.9)] max-h-[90dvh] overflow-y-auto scrollbar-none ${
            isFriday ? 'border-amber-400/30' : 'border-[#4DE8E8]/30'
          }`}
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg border ${
                  isFriday
                    ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                    : 'border-[#4DE8E8]/40 bg-[#4DE8E8]/10 text-[#4DE8E8]'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-mono font-semibold tracking-[0.16em] uppercase text-white">
                  PRIVACY & DATA GOVERNANCE
                </h3>
                <p className="text-[10px] font-mono tracking-wider text-white/50 uppercase">
                  STARK CORE // OPERATOR DATA RIGHTS MATRIX
                </p>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close Privacy Modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4 sm:space-y-5 mt-4">
            {/* 1. Privacy Standards Overview */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-[10.5px] font-mono text-white/70 leading-relaxed">
              <div className="flex items-center gap-1.5 text-[#4DE8E8] font-semibold uppercase tracking-wider mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4DE8E8]" />
                <span>Zero Telemetry Policy</span>
              </div>
              <p>
                Your voice audio, document attachments, and conversational memory are processed strictly on authenticated sessions. No diagnostic audio is ever sold or shared.
              </p>
            </div>

            {/* 2. Self-Serve Data Export Section */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-black/60 border border-[#4DE8E8]/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-white">
                    1. EXPORT MY DATA
                  </h4>
                  <p className="text-[10px] font-mono text-white/50 mt-0.5">
                    Download complete JSON archive containing your profile, memory entries, and full dialogue history.
                  </p>
                </div>
              </div>

              {exportSuccess && (
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono">
                  ✓ Data archive generated and downloaded successfully.
                </div>
              )}

              {exportError && (
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[10px] font-mono">
                  ⚠ {exportError}
                </div>
              )}

              <button
                type="button"
                onClick={handleExportData}
                disabled={isExporting}
                className={`w-full py-2 px-3 rounded-lg border font-mono text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
                  isFriday
                    ? 'border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300'
                    : 'border-[#4DE8E8]/40 bg-[#4DE8E8]/10 hover:bg-[#4DE8E8]/20 text-[#4DE8E8]'
                }`}
              >
                {isExporting ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    <span>COMPILING ARCHIVE...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>DOWNLOAD DATA ARCHIVE (.JSON)</span>
                  </>
                )}
              </button>
            </div>

            {/* 3. Guarded Account Purge Section ("Forget Everything") */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-red-950/20 border border-red-500/30 space-y-3">
              <div>
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  2. PERMANENT ACCOUNT PURGE (&ldquo;FORGET EVERYTHING&rdquo;)
                </h4>
                <p className="text-[10px] font-mono text-red-200/70 mt-1 leading-relaxed">
                  Permanently deletes all memories, conversations, messages, settings, and profile records stored about you in J.A.R.V.I.S.
                </p>
                <p className="text-[9.5px] font-mono text-white/40 mt-1 italic">
                  Note: This will NOT delete your underlying Google or Firebase account — it strictly erases all stored data inside this app.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-white/60 block">
                  To confirm, type <span className="text-red-400 font-bold">&ldquo;{REQUIRED_CONFIRMATION}&rdquo;</span> below:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE ALL DATA"
                  className="w-full px-3 py-1.5 rounded-lg bg-black/80 border border-red-500/40 text-red-200 placeholder-white/20 font-mono text-xs focus:outline-none focus:border-red-400"
                />
              </div>

              {purgeError && (
                <div className="p-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 text-[10px] font-mono">
                  ⚠ {purgeError}
                </div>
              )}

              <button
                type="button"
                onClick={handlePurgeAccount}
                disabled={confirmText.trim() !== REQUIRED_CONFIRMATION || isPurging}
                className={`w-full py-2 px-3 rounded-lg border font-mono text-[11px] font-bold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 ${
                  confirmText.trim() === REQUIRED_CONFIRMATION && !isPurging
                    ? 'border-red-500 bg-red-600 text-white hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] cursor-pointer'
                    : 'border-red-500/20 bg-red-950/30 text-red-400/40 cursor-not-allowed'
                }`}
              >
                {isPurging ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>PURGING DATABASE RECORDS...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>EXPUNGE ALL DATA &amp; SIGN OUT</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
