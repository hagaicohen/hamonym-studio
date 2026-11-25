import { Injectable, inject } from '@angular/core';
import { DiagnosticEntry } from './media.types';
import { MediaContextService } from './media-context.service';

const DIAGNOSTICS_KEY = 'hamonym-media-upload-diagnostics-v1';
const MAX_TRACE = 30;

/** Upload diagnostics: a bounded in-memory trace plus the last entry in localStorage. */
@Injectable({ providedIn: 'root' })
export class MediaDiagnosticsService {
  private readonly context = inject(MediaContextService);
  private readonly trace: DiagnosticEntry[] = [];
  /** Set by the store so diagnostics can report cache size without a circular dependency. */
  cacheSize: () => number = () => 0;

  record(stage: string, file?: Blob | null, extra?: Record<string, unknown>): DiagnosticEntry {
    const item: DiagnosticEntry = { at: new Date().toISOString(), stage, kind: file?.type || '', bytes: file?.size || 0, ...(extra || {}) };
    this.trace.push(item);
    if (this.trace.length > MAX_TRACE) this.trace.shift();
    try { window.localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(item)); } catch { /* storage unavailable */ }
    return item;
  }

  snapshot(): Record<string, unknown> {
    let last = '';
    try { last = window.localStorage.getItem(DIAGNOSTICS_KEY) || ''; } catch { /* storage unavailable */ }
    return {
      version: '0.1.59', trace: [...this.trace], last, localStorage: this.context.storage.persistent,
      origin: location.protocol, worker: typeof Worker === 'function', indexedDB: typeof indexedDB !== 'undefined',
      navigator: navigator.userAgent, cacheSize: this.cacheSize()
    };
  }

  download(): void {
    const data = JSON.stringify(this.snapshot(), null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'HAMONYM-image-diagnostics.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
