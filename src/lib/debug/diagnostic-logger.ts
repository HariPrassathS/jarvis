// ──────────────────────────────────────────────
// Diagnostic Logger — Mobile Real-Device Telemetry Bus
// Captures SpeechRecognition lifecycle, TTS voice selection, and FPS/Performance
// ──────────────────────────────────────────────

export type DiagnosticCategory = 'speech' | 'tts' | 'perf' | 'system';

export interface DiagnosticLogEntry {
  id: string;
  timestamp: number;
  timeFormatted: string;
  category: DiagnosticCategory;
  event: string;
  data?: any;
}

class DiagnosticLogger {
  private logs: DiagnosticLogEntry[] = [];
  private maxLogs = 60;
  private listeners: Set<(logs: DiagnosticLogEntry[]) => void> = new Set();
  private enabled = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debug') === '1' || params.get('debug') === 'true') {
        this.enabled = true;
      }
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    this.log('system', val ? 'Debug overlay enabled' : 'Debug overlay disabled');
  }

  public log(category: DiagnosticCategory, event: string, data?: any) {
    const now = Date.now();
    const d = new Date(now);
    const timeFormatted = `${d.toTimeString().split(' ')[0]}.${d.getMilliseconds().toString().padStart(3, '0')}`;

    const entry: DiagnosticLogEntry = {
      id: `${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      timeFormatted,
      category,
      event,
      data,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    if (this.enabled) {
      // Console logging when debug is active
      const prefix = `[Diagnostics:${category.toUpperCase()}] ${timeFormatted} -> ${event}`;
      if (category === 'speech' && (event.includes('error') || event.includes('denied'))) {
        console.warn(prefix, data || '');
      } else {
        console.log(prefix, data || '');
      }
    }

    this.notify();
  }

  public getLogs(): DiagnosticLogEntry[] {
    return [...this.logs];
  }

  public clear() {
    this.logs = [];
    this.notify();
  }

  public subscribe(cb: (logs: DiagnosticLogEntry[]) => void): () => void {
    this.listeners.add(cb);
    cb(this.getLogs());
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    const snapshot = this.getLogs();
    this.listeners.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (err) {
        console.error('[DiagnosticLogger] Listener error:', err);
      }
    });
  }
}

export const diagnosticLogger = new DiagnosticLogger();
