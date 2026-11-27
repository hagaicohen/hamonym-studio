import { Injectable, InjectionToken, inject, signal } from '@angular/core';

export type AnalyticsPreset = 'today' | '7d' | '30d' | '90d' | 'year' | 'calendar_12m' | 'all' | 'month' | 'last_month' | 'custom';

export const CAMPAIGN_RANGE_DEFAULT = new InjectionToken<AnalyticsPreset>('campaign date range default');

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
function currentDate(timeZone?: string): Date {
  if (!timeZone) return new Date();
  const parts = new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date());
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  return new Date(year, month - 1, day);
}

function resolvePreset(preset: AnalyticsPreset, timeZone?: string): { from: string; to: string } {
  if (preset === 'all') return { from: '', to: '' };
  if (preset === 'calendar_12m') {
    const now = currentDate(timeZone);
    return {
      from: toIsoDate(new Date(now.getFullYear(), now.getMonth() - 11, 1)),
      to: toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
    };
  }
  if (preset === 'month' || preset === 'last_month') {
    const now = currentDate(timeZone);
    const month = now.getMonth();
    return {
      from: toIsoDate(new Date(now.getFullYear(), month - (preset === 'last_month' ? 1 : 0), 1)),
      to: toIsoDate(preset === 'last_month'
        ? new Date(now.getFullYear(), month, 1)
        : new Date(now.getFullYear(), month, now.getDate() + 1)),
    };
  }
  const days = PRESET_DAYS[preset] ?? PRESET_DAYS['30d']!;
  const to = currentDate(timeZone);
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
  private readonly campaignDefault = inject(CAMPAIGN_RANGE_DEFAULT, { optional: true });
  private readonly timeZone = this.campaignDefault ? 'Asia/Jerusalem' : undefined;
  readonly activeRange = signal<AnalyticsRange>(this.campaignDefault
    ? { preset: this.campaignDefault, ...resolvePreset(this.campaignDefault, this.timeZone) }
    : this._loadSaved());

  setPreset(preset: Exclude<AnalyticsPreset, 'custom'>): void {
    const { from, to } = resolvePreset(preset, this.timeZone);
    this._set({ preset, from, to });
  }

  setCustom(from: string, to: string): void {
    this._set({ preset: 'custom', from, to });
  }

  setRolling(count: number, unit: 'days' | 'months'): void {
    if (!Number.isSafeInteger(count) || count < 1 || count > (unit === 'days' ? 3660 : 120)) return;
    const to = currentDate(this.timeZone);
    to.setDate(to.getDate() + 1);
    const from = new Date(to);
    if (unit === 'days') from.setDate(from.getDate() - count);
    else {
      const day = from.getDate();
      from.setDate(1);
      from.setMonth(from.getMonth() - count);
      const daysInMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
      from.setDate(Math.min(day, daysInMonth));
    }
    this.setCustom(toIsoDate(from), toIsoDate(to));
  }

  private _set(range: AnalyticsRange): void {
    this.activeRange.set(range);
    if (!this.campaignDefault) localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
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
