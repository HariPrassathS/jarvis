'use client';

// ──────────────────────────────────────────────
// Chat Panel — Visual Spec: Clean Bottom Input Bar & Expandable Transcript Drawer
// ──────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatMessage, VoicePersona } from '@/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming?: boolean;
  error: string | null;
  onSend: (message: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
  persona?: VoicePersona;
}

export default function ChatPanel({
  messages,
  isLoading,
  isStreaming = false,
  error,
  onSend,
  isExpanded,
  onToggle,
  persona = 'jarvis',
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFriday = persona === 'friday';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isExpanded]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center pointer-events-none pb-[calc(0.75rem+var(--sab))] px-3 sm:px-4">
      {/* ── Slide-Up Collapsible Transcript Drawer ── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: 20 }}
            animate={{ height: 320, opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: 20 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="pointer-events-auto w-full max-w-3xl mb-3 bg-black/95 border border-[#4DE8E8]/30
                       rounded-2xl backdrop-blur-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.9),0_0_30px_rgba(77,232,232,0.1)]
                       overflow-hidden flex flex-col max-h-[48dvh]"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-b border-[#4DE8E8]/20 bg-[#4DE8E8]/5">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    isFriday ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-[#4DE8E8]'
                  }`}
                />
                <span
                  className={`text-xs font-mono tracking-widest uppercase font-medium ${
                    isFriday ? 'text-amber-300' : 'text-[#4DE8E8]'
                  }`}
                >
                  Live Neural Transcript ({messages.length})
                </span>
              </div>
              <button
                onClick={onToggle}
                className="text-[11px] font-mono text-[#4DE8E8]/70 hover:text-[#4DE8E8] active:text-[#4DE8E8] transition-colors cursor-pointer uppercase tracking-wider p-1"
                aria-label="Close live transcript drawer"
              >
                CLOSE [✕]
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 sm:px-5 py-3.5 space-y-3 scrollbar-thin"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center text-[#4DE8E8]/40 text-xs font-mono space-y-2">
                  <div className="w-8 h-8 rounded-full border border-dashed border-[#4DE8E8]/30 flex items-center justify-center">
                    <span className="text-[#4DE8E8]/60">✦</span>
                  </div>
                  <p>Neural transcript buffer empty. Speak aloud or enter a command.</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isLastMsg = i === messages.length - 1;
                  const showStreamingCursor = isStreaming && isLastMsg && msg.role === 'assistant';

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex gap-2.5 ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {msg.role !== 'user' && (
                        <div
                          className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center border ${
                            isFriday
                              ? 'bg-amber-400/15 border-amber-400/40 shadow-[0_0_8px_rgba(251,191,36,0.2)]'
                              : 'bg-[#4DE8E8]/15 border-[#4DE8E8]/40'
                          }`}
                        >
                          <span
                            className={`text-[10px] font-mono font-bold ${
                              isFriday ? 'text-amber-300' : 'text-[#4DE8E8]'
                            }`}
                          >
                            {isFriday ? 'F' : 'J'}
                          </span>
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] sm:max-w-[78%] px-3.5 py-2 rounded-xl text-xs leading-relaxed font-mono ${
                          msg.role === 'user'
                            ? 'bg-[#4DE8E8]/10 text-cyan-100 border border-[#4DE8E8]/30'
                            : 'bg-white/[0.03] text-white/90 border border-[#4DE8E8]/15 shadow-[0_0_15px_rgba(77,232,232,0.05)]'
                        }`}
                      >
                        <div
                          className={`text-[9px] uppercase mb-1 tracking-wider font-semibold ${
                            msg.role === 'user'
                              ? 'text-[#4DE8E8]/50'
                              : isFriday
                              ? 'text-amber-300/70'
                              : 'text-[#4DE8E8]/50'
                          }`}
                        >
                          {msg.role === 'user'
                            ? 'USER'
                            : isFriday
                            ? 'FRIDAY CORE'
                            : 'JARVIS CORE'}
                        </div>
                        {msg.content}
                        {showStreamingCursor && (
                          <span className="inline-block w-[2px] h-[14px] ml-0.5 align-text-bottom bg-[#4DE8E8] animate-pulse" />
                        )}
                      </div>

                      {msg.role === 'user' && (
                        <div className="flex-shrink-0 w-6 h-6 rounded-md bg-white/10 border border-white/20 flex items-center justify-center">
                          <span className="text-[10px] font-mono text-white/70 font-bold">U</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}

              {/* Thinking loader — only show when loading and NOT yet streaming */}
              {isLoading && !isStreaming && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-[#4DE8E8] text-xs font-mono p-1"
                >
                  <div className="w-4 h-4 rounded bg-[#4DE8E8]/20 border border-[#4DE8E8]/40 flex items-center justify-center">
                    <span className="text-[9px] text-[#4DE8E8] animate-spin">⟳</span>
                  </div>
                  <span className="tracking-wider">THINKING...</span>
                </motion.div>
              )}

              {/* Error box */}
              {error && (
                <div className="text-red-400 text-xs font-mono px-3.5 py-2 bg-red-950/40 rounded-xl border border-red-500/30">
                  ⚠️ System Notice: {error}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom Input Bar (Fixed to bottom, rounded-full container) ── */}
      <motion.div
        className="pointer-events-auto w-full max-w-3xl"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <form
          onSubmit={handleSubmit}
          className="relative flex items-center bg-black/90 border border-[#4DE8E8]/30 rounded-full
                     backdrop-blur-2xl shadow-[0_0_25px_rgba(0,0,0,0.9),0_0_15px_rgba(77,232,232,0.08)]
                     px-1.5 sm:px-2 py-1 sm:py-1.5 focus-within:border-[#4DE8E8]/85 focus-within:shadow-[0_0_32px_rgba(77,232,232,0.28)]
                     transition-all duration-300 min-h-[46px]"
        >
          {/* Left Side: Expandable TRANSCRIPT label with live count badge and caret */}
          <motion.button
            type="button"
            onClick={onToggle}
            whileTap={{ scale: 0.95 }}
            aria-label="Toggle live transcript log"
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-mono uppercase tracking-wider
                       bg-[#4DE8E8]/10 text-[#4DE8E8]/80 hover:text-[#4DE8E8] hover:bg-[#4DE8E8]/20 border border-[#4DE8E8]/30
                       transition-all cursor-pointer flex-shrink-0 select-none min-h-[38px] whitespace-nowrap"
          >
            <span className="hidden sm:inline">TRANSCRIPT</span>
            <span className="sm:hidden">LOG</span>
            <span className="w-4 h-4 rounded-full bg-[#4DE8E8] text-black font-bold text-[9px] flex items-center justify-center flex-shrink-0">
              {messages.length}
            </span>
            <svg
              className={`w-3 h-3 text-[#4DE8E8] transition-transform duration-300 ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          </motion.button>

          {/* Middle: Text input field */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isFriday ? 'Ask or command FRIDAY...' : 'Ask or command JARVIS...'}
            disabled={isLoading}
            className="flex-1 bg-transparent border-0 px-2.5 sm:px-3.5 py-1 text-xs sm:text-sm text-white/90 placeholder-white/30
                       font-mono focus:outline-none disabled:opacity-50 min-w-0"
          />

          {/* Right Side: SEND button/link with arrow icon */}
          <motion.button
            type="submit"
            disabled={isLoading || !input.trim()}
            whileTap={{ scale: 0.94 }}
            className="group flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs font-mono font-medium uppercase tracking-wider
                       text-[#4DE8E8]/80 hover:text-white hover:bg-[#4DE8E8]/20 active:bg-[#4DE8E8]/30 disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all duration-200 cursor-pointer flex-shrink-0 min-h-[38px]"
            aria-label="Send message to JARVIS"
          >
            <span className="transition-colors group-hover:text-white">SEND</span>
            <svg
              className="w-3.5 h-3.5 text-[#4DE8E8] transition-all duration-200 group-hover:translate-x-1 group-hover:text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
