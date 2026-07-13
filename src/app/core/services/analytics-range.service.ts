import { Injectable, signal } from '@angular/core';

export type AnalyticsPreset = 'today' | '7d' | '30d' | '90d' | 'year' | 'custom';

export interface AnalyticsRange {
  preset: AnalyticsPreset;
  from: string; // ISO date (YYYY-MM-DD), inclusive
  to: string;   // ISO date (YYYY-MM-DD), exclusive (i.e. "start of the day after the last included day")
}

const STORAGE_KEY = 'analyticsRange_v1';
const DEFAULT_PRESET: AnalyticsPreset = '30d';

const PRESET_DAYS: Partial<Record<AnalyticsPreset, number>> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  year: 365,
};

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Resolves a preset to concrete from/to boundaries, in local time.
// `to` is always "start of tomorrow" (exclusive) so the current day is
// always fully included regardless of what time it is right now.
function resolvePreset(preset: AnalyticsPreset): { from: string; to: string } {
  const days = PRESET_DAYS[preset] ?? PRESET_DAYS['30d']!;
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() + 1);
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

// Single source of truth for "which time window am I looking at" across
// dashboard and reports — every consumer reads activeRange() and reacts to
// changes with the same effect()+untracked() pattern already used for
// CurrentEntityService. No component computes its own date math; the API
// contract everywhere downstream is always concrete from/to, never a preset
// string — see GLOBAL_DATE_RANGE_SPEC.md.
@Injectable({ providedIn: 'root' })
export class AnalyticsRangeService {
  readonly activeRange = signal<AnalyticsRange>(this._loadSaved());

  setPreset(preset: Exclude<AnalyticsPreset, 'custom'>): void {
    const { from, to } = resolvePreset(preset);
    this._set({ preset, from, to });
  }

  setCustom(from: string, to: string): void {
    this._set({ preset: 'custom', from, to });
  }

  private _set(range: AnalyticsRange): void {
    this.activeRange.set(range);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
  }

  // Re-resolves saved non-custom presets against "now" rather than trusting
  // the stored from/to — a "30d" range saved yesterday must mean "the 30
  // days ending today", not the stale absolute dates from last session.
  // A "custom" range is an explicit absolute choice, so it's the one case
  // the stored from/to is trusted as-is.
  private _loadSaved(): AnalyticsRange {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AnalyticsRange;
        if (parsed?.from && parsed?.to && parsed?.preset) {
          if (parsed.preset === 'custom') return parsed;
          const { from, to } = resolvePreset(parsed.preset);
          return { preset: parsed.preset, from, to };
        }
      }
    } catch { /* ignore malformed storage */ }
    const { from, to } = resolvePreset(DEFAULT_PRESET);
    return { preset: DEFAULT_PRESET, from, to };
  }
}
