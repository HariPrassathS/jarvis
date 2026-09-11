'use client';

// ──────────────────────────────────────────────
// CommandPalette — HUD Quick-Action & Command Bar (Cmd+K / Ctrl+K)
// Features: Full keyboard navigation (↑/↓/Enter/Esc), search filtering,
// Stark HUD aesthetics with persona-aware accents.
// ──────────────────────────────────────────────

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VoicePersona } from '@/types';

export interface CommandAction {
  id: string;
  category: 'DIRECTIVES' | 'PERSONA' | 'HARDWARE & PRIVACY' | 'SESSION';
  title: string;
  description: string;
  badge?: string;
  shortcut?: string;
  icon?: string;
  perform: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  persona?: VoicePersona;
  onSelectPrompt: (prompt: string) => void;
  onSwitchPersona: (persona: VoicePersona) => void;
  onToggleMicKill: () => void;
  isMicKilled?: boolean;
  onOpenPrivacy: () => void;
  onNewChat: () => void;
  onInitiateSignOut: () => void;
  reducedMotion?: boolean;
}

export default function CommandPalette({
  isOpen,
  onClose,
  persona = 'jarvis',
  onSelectPrompt,
  onSwitchPersona,
  onToggleMicKill,
  isMicKilled = false,
  onOpenPrivacy,
  onNewChat,
  onInitiateSignOut,
  reducedMotion = false,
}: CommandPaletteProps) {
  const isFriday = persona === 'friday';
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Define full command registry
  const actions: CommandAction[] = useMemo(() => [
    // Directives
    {
      id: 'weather',
      category: 'DIRECTIVES',
      title: 'Atmospheric Telemetry',
      description: "Query current meteorological conditions in Tokyo",
      badge: 'TOOL',
      perform: () => onSelectPrompt("What's the weather in Tokyo right now?"),
    },
    {
      id: 'armor',
      category: 'DIRECTIVES',
      title: 'Mark VII Suit Telemetry',
      description: 'Check Mark VII suit integrity and micro-thruster levels',
      badge: 'STARK',
      perform: () => onSelectPrompt('Report Mark VII armor integrity and power cell diagnostics.'),
    },
    {
      id: 'flight',
      category: 'DIRECTIVES',
      title: 'Flight Dynamics & Trajectory',
      description: 'Run supersonic aerodynamics and repulsor balance calculations',
      badge: 'STARK',
      perform: () => onSelectPrompt('Check flight dynamics and supersonic aerodynamic stability.'),
    },
    {
      id: 'diagnostics',
      category: 'DIRECTIVES',
      title: 'Autonomous System Diagnostics',
      description: 'Execute self-test across all cognitive and audio subroutines',
      badge: 'TOOL',
      perform: () => onSelectPrompt('Run full system diagnostics and memory integrity check.'),
    },
    {
      id: 'calendar',
      category: 'DIRECTIVES',
      title: 'Stark Executive Schedule',
      description: 'Inspect upcoming events from Google Calendar databank',
      badge: 'LVL 9',
      perform: () => onSelectPrompt("What is on my executive calendar for today?"),
    },
    {
      id: 'recall-files',
      category: 'DIRECTIVES',
      title: 'Recall Uploaded Files & Telemetry',
      description: 'Query databank for past uploaded images, schematics, and documents',
      badge: 'TOOL',
      perform: () => onSelectPrompt("What files, photos, or documents have I uploaded previously?"),
    },

    // Persona
    {
      id: 'persona-jarvis',
      category: 'PERSONA',
      title: 'Switch to J.A.R.V.I.S',
      description: 'Activate British formal intelligence with cyan telemetry',
      badge: persona === 'jarvis' ? 'ACTIVE' : undefined,
      perform: () => onSwitchPersona('jarvis'),
    },
    {
      id: 'persona-friday',
      category: 'PERSONA',
      title: 'Switch to F.R.I.D.A.Y',
      description: 'Activate Irish tactical intelligence with amber/coral telemetry',
      badge: persona === 'friday' ? 'ACTIVE' : undefined,
      perform: () => onSwitchPersona('friday'),
    },

    // Hardware & Privacy
    {
      id: 'mic-kill',
      category: 'HARDWARE & PRIVACY',
      title: isMicKilled ? 'Restore Hardware Mic' : 'Engage Global Mic Kill-Switch',
      description: isMicKilled
        ? 'Re-enable audio sentry listening loops'
        : 'Immediately terminate Web Speech instances and block restart loops',
      badge: isMicKilled ? 'KILLED' : 'ACTIVE',
      perform: onToggleMicKill,
    },
    {
      id: 'privacy-matrix',
      category: 'HARDWARE & PRIVACY',
      title: 'Data & Privacy Matrix',
      description: 'Access self-serve data export and guarded account purge',
      badge: 'SOVEREIGNTY',
      perform: onOpenPrivacy,
    },
    {
      id: 'new-chat',
      category: 'HARDWARE & PRIVACY',
      title: 'Flush Conversation Buffer',
      description: 'Clear active transcript and reset dialogue context',
      badge: 'NEW',
      perform: onNewChat,
    },

    // Session
    {
      id: 'sign-out',
      category: 'SESSION',
      title: 'Initiate Mission Debrief & Stand Down',
      description: 'Summarize session directives and terminate operator session',
      badge: 'SIGN OUT',
      perform: onInitiateSignOut,
    },
  ], [
    onSelectPrompt,
    onSwitchPersona,
    persona,
    onToggleMicKill,
    isMicKilled,
    onOpenPrivacy,
    onNewChat,
    onInitiateSignOut,
  ]);

  // Filter actions by search query
  const filteredActions = useMemo(() => {
    if (!search.trim()) return actions;
    const query = search.toLowerCase().trim();
    return actions.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query) ||
        a.category.toLowerCase().includes(query)
    );
  }, [actions, search]);

  // Reset selection index when query changes or modal opens
  useEffect(() => {
    setSelectedIndex(0);
  }, [search, isOpen]);

  // Auto-focus search input upon opening
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Execute action and close modal
  const executeAction = useCallback(
    (action: CommandAction) => {
      onClose();
      // Slight delay so closing animation doesn't jitter execution
      setTimeout(() => {
        action.perform();
      }, 100);
    },
    [onClose]
  );

  // Global keyboard listener inside modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredActions.length > 0 ? (prev + 1) % filteredActions.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredActions.length > 0 ? (prev - 1 + filteredActions.length) % filteredActions.length : 0
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredActions[selectedIndex]) {
          executeAction(filteredActions[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredActions, selectedIndex, executeAction, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-3 sm:px-4 select-none">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md -z-10"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: reducedMotion ? 0 : -14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: reducedMotion ? 0 : -14 }}
            transition={{ duration: reducedMotion ? 0.15 : 0.25, ease: 'easeOut' }}
            className={`w-full max-w-2xl rounded-2xl bg-black/90 border p-0 shadow-2xl backdrop-blur-xl overflow-hidden flex flex-col max-h-[80vh] ${
              isFriday
                ? 'border-amber-500/40 shadow-[0_0_35px_rgba(245,158,11,0.25)]'
                : 'border-[#00FFFF]/40 shadow-[0_0_35px_rgba(0,255,255,0.25)]'
            }`}
          >
            {/* Header / Search Input */}
            <div
              className={`p-3.5 sm:p-4 border-b flex items-center gap-3 bg-white/[0.02] ${
                isFriday ? 'border-amber-500/20' : 'border-[#4DE8E8]/20'
              }`}
            >
              <svg
                className={`w-5 h-5 flex-shrink-0 transition-colors ${
                  isFriday ? 'text-amber-400' : 'text-[#00FFFF]'
                }`}
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="8.5" cy="8.5" r="5.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12.5 12.5L17.5 17.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>

              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type a command, query, or protocol..."
                className={`w-full bg-transparent font-mono text-sm sm:text-base outline-none tracking-wider placeholder:text-zinc-600 ${
                  isFriday ? 'text-amber-200 placeholder:text-amber-900/50' : 'text-cyan-100 placeholder:text-cyan-900/50'
                }`}
              />

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-widest bg-zinc-800/80 text-zinc-400 border border-zinc-700">
                  ESC
                </span>
              </div>
            </div>

            {/* Command List */}
            <div
              ref={listRef}
              className="p-2 sm:p-3 overflow-y-auto space-y-1 divide-y divide-zinc-900/50 max-h-[55vh]"
            >
              {filteredActions.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 font-mono text-xs tracking-wider">
                  NO DIRECTIVES FOUND MATCHING &quot;{search.toUpperCase()}&quot;
                </div>
              ) : (
                filteredActions.map((action, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={action.id}
                      data-index={idx}
                      onClick={() => executeAction(action)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`group flex items-center justify-between p-2.5 sm:p-3 rounded-xl cursor-pointer transition-all duration-150 ${
                        isSelected
                          ? isFriday
                            ? 'bg-amber-950/50 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                            : 'bg-cyan-950/50 border border-[#00FFFF]/50 shadow-[0_0_15px_rgba(0,255,255,0.2)]'
                          : 'bg-transparent border border-transparent hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs sm:text-sm font-mono font-medium tracking-wide ${
                              isSelected
                                ? isFriday
                                  ? 'text-amber-300'
                                  : 'text-[#00FFFF]'
                                : 'text-zinc-200 group-hover:text-white'
                            }`}
                          >
                            {action.title}
                          </span>
                          {action.badge && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wider font-semibold ${
                                isSelected
                                  ? isFriday
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-[#00FFFF]/20 text-[#00FFFF] border border-[#00FFFF]/40'
                                  : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/60'
                              }`}
                            >
                              {action.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-zinc-400 truncate mt-0.5">
                          {action.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`text-[9px] font-mono tracking-widest hidden sm:inline-block uppercase ${
                            isSelected
                              ? isFriday
                                ? 'text-amber-400/80'
                                : 'text-cyan-400/80'
                              : 'text-zinc-600'
                          }`}
                        >
                          {action.category}
                        </span>
                        {isSelected && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider animate-pulse ${
                              isFriday
                                ? 'bg-amber-500/30 text-amber-200 border border-amber-500/60'
                                : 'bg-cyan-500/30 text-cyan-200 border border-cyan-500/60'
                            }`}
                          >
                            [↵]
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Bar with Navigation Hints */}
            <div
              className={`p-2.5 sm:p-3 border-t flex items-center justify-between text-[10px] font-mono bg-white/[0.01] ${
                isFriday ? 'border-amber-500/20 text-amber-400/60' : 'border-[#4DE8E8]/20 text-[#4DE8E8]/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">↑↓</span>
                  <span className="hidden sm:inline">Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">↵</span>
                  <span className="hidden sm:inline">Execute</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">ESC</span>
                  <span className="hidden sm:inline">Close</span>
                </span>
              </div>

              <div className="tracking-widest flex items-center gap-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>COMMAND PROTOCOL ACTIVE</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
