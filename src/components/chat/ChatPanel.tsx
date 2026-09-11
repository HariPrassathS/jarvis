'use client';

// ──────────────────────────────────────────────
// Chat Panel — Multi-Modal Vision, Document Upload & Long-Term Files Vault
// Visual Spec: Clean Bottom Input Bar, Staged Media Chips, Neural Transcript & Telemetry Vault
// ──────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { processUploadedFile } from '@/lib/document/extractor';
import type { ChatMessage, VoicePersona, ChatAttachment, UploadedFileRecord } from '@/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming?: boolean;
  error: string | null;
  onSend: (message: string, attachments?: ChatAttachment[]) => void;
  isExpanded: boolean;
  onToggle: () => void;
  persona?: VoicePersona;
  stagedAttachments?: ChatAttachment[];
  onRemoveStagedAttachment?: (id: string) => void;
  onAddStagedAttachments?: (attachments: ChatAttachment[]) => void;
  getIdToken?: () => Promise<string | null>;
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
  stagedAttachments: externalStaged,
  onRemoveStagedAttachment,
  onAddStagedAttachments,
  getIdToken,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [localAttachments, setLocalAttachments] = useState<ChatAttachment[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string; size: number; aiDescription?: string } | null>(null);
  const [drawerTab, setDrawerTab] = useState<'transcript' | 'vault'>('transcript');
  const [vaultFiles, setVaultFiles] = useState<UploadedFileRecord[]>([]);
  const [isVaultLoading, setIsVaultLoading] = useState(false);
  const [vaultSearch, setVaultSearch] = useState('');
  const [expandedFileIds, setExpandedFileIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFriday = persona === 'friday';

  const allStaged = [...localAttachments, ...(externalStaged || [])];

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current && drawerTab === 'transcript') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isExpanded, allStaged.length, drawerTab]);

  // Load vault files from /api/files
  const loadVault = useCallback(async () => {
    if (!getIdToken) return;
    setIsVaultLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;

      const res = await fetch('/api/files', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.files)) {
          setVaultFiles(data.files);
        }
      }
    } catch (err) {
      console.error('[ChatPanel] Error loading vault files:', err);
    } finally {
      setIsVaultLoading(false);
    }
  }, [getIdToken]);

  // Fetch vault files when drawer opens or switches to vault
  useEffect(() => {
    if (isExpanded && drawerTab === 'vault') {
      loadVault();
    }
  }, [isExpanded, drawerTab, loadVault]);

  // Handle file picker selection
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsExtracting(true);
    setUploadError(null);
    try {
      const extracted: ChatAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const att = await processUploadedFile(files[i]);
        extracted.push(att);
      }
      if (onAddStagedAttachments) {
        onAddStagedAttachments(extracted);
      } else {
        setLocalAttachments((prev) => [...prev, ...extracted]);
      }
    } catch (err: any) {
      console.error('[ChatPanel] Error extracting attachments:', err);
      setUploadError(err.message || 'File upload failed');
      setTimeout(() => setUploadError(null), 8000);
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setLocalAttachments((prev) => prev.filter((a) => a.id !== id));
    onRemoveStagedAttachment?.(id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && allStaged.length === 0) || isLoading || isExtracting) return;
    onSend(input.trim(), allStaged.length > 0 ? allStaged : undefined);
    setInput('');
    setLocalAttachments([]);
  };

  const toggleFileExpansion = (id: string) => {
    setExpandedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredVaultFiles = vaultFiles.filter((f) => {
    if (!vaultSearch.trim()) return true;
    const q = vaultSearch.toLowerCase().trim();
    return (
      (f.original_filename || '').toLowerCase().includes(q) ||
      (f.ai_description || '').toLowerCase().includes(q) ||
      (f.file_type || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center pointer-events-none pb-[calc(0.75rem+var(--sab))] px-3 sm:px-4">
      {/* ── Slide-Up Collapsible Transcript / Vault Drawer ── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: 20 }}
            animate={{ height: 380, opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: 20 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="pointer-events-auto w-full max-w-3xl mb-3 bg-black/95 border border-[#4DE8E8]/30
                       rounded-2xl backdrop-blur-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.9),0_0_30px_rgba(77,232,232,0.1)]
                       overflow-hidden flex flex-col max-h-[55dvh]"
          >
            {/* Drawer Header Tabs */}
            <div className="flex items-center justify-between px-3 sm:px-5 py-2 border-b border-[#4DE8E8]/20 bg-[#4DE8E8]/5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setDrawerTab('transcript')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    drawerTab === 'transcript'
                      ? isFriday
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_10px_rgba(251,191,36,0.2)]'
                        : 'bg-[#4DE8E8]/20 text-[#4DE8E8] border border-[#4DE8E8]/40 shadow-[0_0_10px_rgba(77,232,232,0.2)]'
                      : 'text-white/50 hover:text-white/80 border border-transparent'
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      drawerTab === 'transcript'
                        ? isFriday
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-[#4DE8E8] animate-pulse'
                        : 'bg-white/30'
                    }`}
                  />
                  <span>TRANSCRIPT ({messages.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDrawerTab('vault');
                    loadVault();
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    drawerTab === 'vault'
                      ? isFriday
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_10px_rgba(251,191,36,0.2)]'
                        : 'bg-[#4DE8E8]/20 text-[#4DE8E8] border border-[#4DE8E8]/40 shadow-[0_0_10px_rgba(77,232,232,0.2)]'
                      : 'text-white/50 hover:text-white/80 border border-transparent'
                  }`}
                >
                  <span>📁 VAULT / ATTACHMENTS</span>
                  {vaultFiles.length > 0 && (
                    <span className="text-[10px] px-1 rounded bg-[#4DE8E8]/20 text-[#4DE8E8] font-bold">
                      {vaultFiles.length}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                {drawerTab === 'vault' && (
                  <button
                    type="button"
                    onClick={loadVault}
                    disabled={isVaultLoading}
                    className="text-[10px] font-mono text-[#4DE8E8]/70 hover:text-[#4DE8E8] transition-colors p-1 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Refresh stored files databank"
                  >
                    <span className={isVaultLoading ? 'animate-spin inline-block' : ''}>⟳</span>
                    <span className="hidden sm:inline">REFRESH</span>
                  </button>
                )}
                <button
                  onClick={onToggle}
                  className="text-[11px] font-mono text-[#4DE8E8]/70 hover:text-[#4DE8E8] active:text-[#4DE8E8] transition-colors cursor-pointer uppercase tracking-wider p-1"
                  aria-label="Close drawer"
                >
                  CLOSE [✕]
                </button>
              </div>
            </div>

            {/* Upload Error Banner */}
            {uploadError && (
              <div className="px-4 py-2 bg-red-950/80 border-b border-red-500/40 text-red-300 font-mono text-xs flex items-center justify-between">
                <span>⚠️ {uploadError}</span>
                <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-white text-xs">✕</button>
              </div>
            )}

            {/* Tab Body: Transcript or Vault */}
            {drawerTab === 'transcript' ? (
              /* Messages Scroll Area */
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 sm:px-5 py-3.5 space-y-3.5 scrollbar-thin"
              >
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center text-[#4DE8E8]/40 text-xs font-mono space-y-2">
                    <div className="w-8 h-8 rounded-full border border-dashed border-[#4DE8E8]/30 flex items-center justify-center">
                      <span className="text-[#4DE8E8]/60">✦</span>
                    </div>
                    <p>Neural transcript buffer empty. Speak aloud, enter a command, or drop an image/document.</p>
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
                          className={`max-w-[85%] sm:max-w-[78%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed font-mono ${
                            msg.role === 'user'
                              ? 'bg-[#4DE8E8]/10 text-cyan-100 border border-[#4DE8E8]/30'
                              : 'bg-white/[0.03] text-white/90 border border-[#4DE8E8]/15 shadow-[0_0_15px_rgba(77,232,232,0.05)]'
                          }`}
                        >
                          <div
                            className={`text-[9px] uppercase mb-1.5 tracking-wider font-semibold ${
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

                          {/* ── Multi-Modal Inline Attachments (Images & Documents) ── */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mb-2.5 space-y-2">
                              {msg.attachments.map((att) => {
                                if (att.type === 'image' && att.dataUrl) {
                                  return (
                                    <div
                                      key={att.id}
                                      onClick={() => setSelectedImage({ url: att.dataUrl!, name: att.name, size: att.size })}
                                      className="group/img relative rounded-lg overflow-hidden border border-[#4DE8E8]/35 bg-black/70 p-1.5 shadow-[0_0_15px_rgba(0,255,255,0.08)] cursor-pointer hover:border-[#4DE8E8] transition-all"
                                      title="Click to expand visual telemetry"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={att.dataUrl}
                                        alt={att.name}
                                        className="max-h-52 sm:max-h-64 w-auto max-w-full rounded object-contain mx-auto block group-hover/img:scale-[1.01] transition-transform duration-200"
                                      />
                                      <div className="flex items-center justify-between px-2 py-1 bg-black/70 backdrop-blur-md text-[9px] font-mono text-[#4DE8E8]/90 mt-1.5 rounded">
                                        <span className="truncate max-w-[200px] flex items-center gap-1">
                                          <span>📷</span>
                                          <span>{att.name}</span>
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                          <span>{Math.round(att.size / 1024)} KB</span>
                                          <span className="text-[10px] text-[#4DE8E8] group-hover/img:text-white">⤢</span>
                                        </span>
                                      </div>
                                    </div>
                                  );
                                }
                                if (att.type === 'document') {
                                  return (
                                    <div
                                      key={att.id}
                                      className="flex items-center gap-2.5 p-2.5 rounded-lg bg-black/60 border border-[#4DE8E8]/35 backdrop-blur-md"
                                    >
                                      <div className="w-8 h-8 rounded bg-[#4DE8E8]/10 border border-[#4DE8E8]/30 flex items-center justify-center flex-shrink-0 text-sm">
                                        {att.mimeType === 'application/pdf' ? '📑' : '📄'}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[11px] font-mono text-cyan-100 font-semibold truncate">
                                          {att.name}
                                        </div>
                                        <div className="text-[9px] font-mono text-[#4DE8E8]/60 flex items-center gap-1.5 mt-0.5">
                                          {att.pageCount ? <span>{att.pageCount} {att.pageCount === 1 ? 'Page' : 'Pages'}</span> : null}
                                          {att.pageCount ? <span>•</span> : null}
                                          <span>{Math.round(att.size / 1024)} KB</span>
                                          <span>•</span>
                                          <span className="text-emerald-400 font-semibold">PARSED CLIENT-SIDE</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          )}

                          {/* Text Message Content */}
                          <div className="whitespace-pre-wrap">{msg.content}</div>
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

                {/* Thinking loader — detects vision analysis vs general telemetry */}
                {isLoading && !isStreaming && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-[#4DE8E8] text-xs font-mono p-1"
                  >
                    <div className="w-4 h-4 rounded bg-[#4DE8E8]/20 border border-[#4DE8E8]/40 flex items-center justify-center">
                      <span className="text-[9px] text-[#4DE8E8] animate-spin">⟳</span>
                    </div>
                    <span className="tracking-wider">
                      {messages[messages.length - 1]?.attachments?.some((a) => a.type === 'image') || allStaged.some((a) => a.type === 'image')
                        ? 'ANALYZING VISUAL INPUT...'
                        : 'SYNTHESIZING TELEMETRY...'}
                    </span>
                  </motion.div>
                )}

                {/* Error box */}
                {error && (
                  <div className="text-red-400 text-xs font-mono px-3.5 py-2 bg-red-950/40 rounded-xl border border-red-500/30">
                    ⚠️ System Notice: {error}
                  </div>
                )}
              </div>
            ) : (
              /* Vault / Attachments Matrix */
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Search / Filter Sub-bar */}
                <div className="px-3 sm:px-4 py-2 border-b border-[#4DE8E8]/15 bg-black/40 flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={vaultSearch}
                      onChange={(e) => setVaultSearch(e.target.value)}
                      placeholder="Search vault by filename, keyword, or AI description..."
                      className="w-full bg-black/60 border border-[#4DE8E8]/30 rounded-lg pl-7 pr-3 py-1.5 text-xs text-cyan-100 font-mono placeholder-white/30 focus:outline-none focus:border-[#4DE8E8]"
                    />
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4DE8E8]/60 text-xs">🔍</span>
                  </div>
                  {vaultSearch && (
                    <button
                      onClick={() => setVaultSearch('')}
                      className="text-[10px] font-mono text-[#4DE8E8]/60 hover:text-white px-2 py-1 rounded bg-[#4DE8E8]/10"
                    >
                      CLEAR
                    </button>
                  )}
                </div>

                {/* File List / Grid Scroll Area */}
                <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-2.5 scrollbar-thin">
                  {isVaultLoading && vaultFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-[#4DE8E8]/60 font-mono text-xs gap-2">
                      <span className="w-5 h-5 border-2 border-[#4DE8E8] border-t-transparent rounded-full animate-spin" />
                      <span>QUERYING ENCRYPTED STORAGE DATABANK...</span>
                    </div>
                  ) : filteredVaultFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center text-[#4DE8E8]/40 text-xs font-mono space-y-2 px-4">
                      <div className="w-8 h-8 rounded-full border border-dashed border-[#4DE8E8]/30 flex items-center justify-center">
                        <span>📁</span>
                      </div>
                      <p>
                        {vaultSearch
                          ? 'No files matching search criteria in databank.'
                          : 'No permanently stored files yet. Upload images or documents via the buttons below to enable cross-session recall.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {filteredVaultFiles.map((file) => {
                        const isExpandedFile = expandedFileIds.has(file.id);
                        const fileSizeKb = file.file_size_bytes
                          ? Math.round(file.file_size_bytes / 1024)
                          : null;
                        const dateFormatted = file.uploaded_at
                          ? new Date(file.uploaded_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Recent';

                        return (
                          <motion.div
                            key={file.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-2.5 rounded-xl bg-black/60 border border-[#4DE8E8]/20 hover:border-[#4DE8E8]/50 transition-all flex flex-col justify-between group"
                          >
                            <div>
                              <div className="flex items-start gap-2.5">
                                {/* Thumbnail / File Type Icon */}
                                {file.file_type === 'image' && file.signed_url ? (
                                  <div
                                    onClick={() =>
                                      setSelectedImage({
                                        url: file.signed_url!,
                                        name: file.original_filename || 'Image',
                                        size: file.file_size_bytes || 0,
                                        aiDescription: file.ai_description,
                                      })
                                    }
                                    className="w-12 h-12 rounded-lg bg-black/80 border border-[#4DE8E8]/30 overflow-hidden flex-shrink-0 cursor-pointer hover:border-[#4DE8E8] transition-all"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={file.signed_url}
                                      alt={file.original_filename || 'Uploaded Image'}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-[#4DE8E8]/10 border border-[#4DE8E8]/30 flex items-center justify-center flex-shrink-0 text-xl">
                                    {file.file_type === 'image'
                                      ? '📷'
                                      : file.mime_type === 'application/pdf'
                                      ? '📑'
                                      : '📄'}
                                  </div>
                                )}

                                {/* File Header & Details */}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-mono font-semibold text-cyan-100 truncate" title={file.original_filename || file.storage_path}>
                                    {file.original_filename || file.storage_path.split('/').pop()}
                                  </div>
                                  <div className="text-[10px] font-mono text-[#4DE8E8]/60 flex items-center gap-1.5 mt-0.5">
                                    <span className="px-1 py-0.2 rounded bg-[#4DE8E8]/15 text-[#4DE8E8] text-[9px] font-bold uppercase">
                                      {file.file_type}
                                    </span>
                                    {fileSizeKb && <span>• {fileSizeKb} KB</span>}
                                    <span>• {dateFormatted}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Expandable AI Recall Description */}
                              {file.ai_description && (
                                <div className="mt-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleFileExpansion(file.id)}
                                    className="text-[10px] font-mono text-[#4DE8E8]/80 hover:text-[#4DE8E8] flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <span>✦ {isExpandedFile ? 'HIDE' : 'VIEW'} CACHED AI TELEMETRY</span>
                                    <span>{isExpandedFile ? '▲' : '▼'}</span>
                                  </button>
                                  {isExpandedFile && (
                                    <div className="mt-1.5 p-2 rounded-lg bg-black/80 border border-[#4DE8E8]/20 text-[10px] font-mono text-cyan-200/90 leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto scrollbar-thin">
                                      {file.ai_description}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Action Links */}
                            <div className="mt-2.5 pt-2 border-t border-[#4DE8E8]/10 flex items-center justify-between text-[10px] font-mono">
                              <button
                                type="button"
                                onClick={() => {
                                  setInput(`What was in the file "${file.original_filename || file.storage_path}"?`);
                                  setDrawerTab('transcript');
                                }}
                                className="text-[#4DE8E8] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <span>💬 ASK JARVIS</span>
                              </button>
                              {file.signed_url && (
                                <a
                                  href={file.signed_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={file.original_filename}
                                  className="text-white/60 hover:text-[#4DE8E8] transition-colors flex items-center gap-1"
                                >
                                  <span>DOWNLOAD ⤓</span>
                                </a>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Staged Attachment Chips Strip (Directly Above Input Bar) ── */}
      <AnimatePresence>
        {allStaged.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto w-full max-w-3xl mb-2 flex items-center gap-2 overflow-x-auto py-1 px-2 scrollbar-none"
          >
            {allStaged.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-black/85 border border-[#4DE8E8]/40 backdrop-blur-xl
                           shadow-[0_0_15px_rgba(77,232,232,0.12)] text-[11px] font-mono text-cyan-200 flex-shrink-0 select-none"
              >
                {att.type === 'image' && att.dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    className="w-5 h-5 rounded object-cover border border-[#4DE8E8]/40"
                  />
                ) : (
                  <span className="text-xs">{att.mimeType === 'application/pdf' ? '📑' : '📄'}</span>
                )}
                <span className="truncate max-w-[140px] sm:max-w-[200px]">{att.name}</span>
                <span className="text-[9px] text-[#4DE8E8]/60">
                  {att.pageCount ? `${att.pageCount}p • ` : ''}{Math.round(att.size / 1024)}KB
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(att.id)}
                  className="ml-1 text-[#4DE8E8]/60 hover:text-red-400 transition-colors cursor-pointer font-bold px-1"
                  title="Remove attachment"
                  aria-label="Remove attachment"
                >
                  ✕
                </button>
              </div>
            ))}
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
          {/* Hidden File Inputs */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            multiple
            accept="image/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css"
            className="hidden"
          />
          <input
            type="file"
            ref={imageInputRef}
            onChange={handleFileInputChange}
            multiple
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
          />

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

          {/* Camera / Vision Image Upload Button */}
          <motion.button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isLoading || isExtracting}
            whileTap={{ scale: 0.92 }}
            title="Upload image for visual analysis (PNG/JPG/WebP)"
            aria-label="Upload image for vision analysis"
            className="flex items-center justify-center w-8 h-8 rounded-full text-[#4DE8E8]/80 hover:text-white hover:bg-[#4DE8E8]/20 border border-transparent hover:border-[#4DE8E8]/40 transition-all flex-shrink-0 cursor-pointer ml-1 disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </motion.button>

          {/* Document / File Upload Button (Paperclip) */}
          <motion.button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isExtracting}
            whileTap={{ scale: 0.92 }}
            title="Attach document (PDF/text/code)"
            aria-label="Attach document"
            className="flex items-center justify-center w-8 h-8 rounded-full text-[#4DE8E8]/70 hover:text-[#4DE8E8] hover:bg-[#4DE8E8]/15 border border-transparent hover:border-[#4DE8E8]/30 transition-all flex-shrink-0 cursor-pointer disabled:opacity-40"
          >
            {isExtracting ? (
              <span className="w-3.5 h-3.5 border-2 border-[#4DE8E8] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            )}
          </motion.button>

          {/* Middle: Text input field */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              allStaged.length > 0
                ? 'Add a question about your visual/document telemetry...'
                : isFriday
                ? 'Ask or command FRIDAY (or drop image)...'
                : 'Ask or command JARVIS (or drop image)...'
            }
            disabled={isLoading}
            className="flex-1 bg-transparent border-0 px-2 sm:px-3 py-1 text-xs sm:text-sm text-white/90 placeholder-white/30
                       font-mono focus:outline-none disabled:opacity-50 min-w-0"
          />

          {/* Right Side: SEND button/link with arrow icon */}
          <motion.button
            type="submit"
            disabled={isLoading || isExtracting || (!input.trim() && allStaged.length === 0)}
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

      {/* ── Multi-Modal Expandable Image Lightbox Modal ── */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 pointer-events-auto cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl max-h-[88vh] bg-black/95 border border-[#4DE8E8]/50 rounded-2xl p-3 sm:p-4 shadow-[0_0_50px_rgba(77,232,232,0.25)] flex flex-col items-center cursor-default"
            >
              <div className="w-full flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#4DE8E8]/25 text-xs font-mono text-[#4DE8E8]">
                <span className="flex items-center gap-1.5 truncate max-w-[80%]">
                  <span>📷</span>
                  <span className="font-semibold text-white truncate">{selectedImage.name}</span>
                  <span className="text-[#4DE8E8]/60">({Math.round(selectedImage.size / 1024)} KB)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="text-[#4DE8E8]/70 hover:text-white transition-colors text-xs px-2.5 py-1 rounded border border-[#4DE8E8]/30 hover:border-[#4DE8E8] cursor-pointer"
                >
                  CLOSE [✕]
                </button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImage.url}
                alt={selectedImage.name}
                className="max-h-[60vh] w-auto max-w-full rounded-lg object-contain shadow-2xl border border-[#4DE8E8]/20"
              />
              {selectedImage.aiDescription && (
                <div className="w-full mt-3 p-2.5 rounded-lg bg-black/80 border border-[#4DE8E8]/25 text-[11px] font-mono text-cyan-200/90 max-h-28 overflow-y-auto scrollbar-thin">
                  <span className="text-[#4DE8E8] font-bold block mb-1">✦ CACHED AI VISION ANALYSIS:</span>
                  {selectedImage.aiDescription}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
