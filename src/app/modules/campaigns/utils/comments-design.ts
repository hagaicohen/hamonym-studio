import type { CommentsBlockData } from '../services/campaign-studio-state.service';

export type CommentsStyle = 'cards' | 'list' | 'carousel';

export const COMMENTS_COUNT_OPTIONS = [3, 4, 6, 8, 10, 12] as const;

// The comments section as it renders. Every option the manager left unset
// falls back to the polished default (cards, two columns, six comments).
export interface CommentsDesign {
  style: CommentsStyle;
  columns: 1 | 2;
  initialCount: number;
  showAvatar: boolean;
  showDates: boolean;
  showSearch: boolean;
  align: 'start' | 'center';
  formPosition: 'top' | 'bottom';
  accentColor: string | null;
  gap: number;
  padding: number;
}

const DEFAULTS: CommentsDesign = {
  style: 'cards', columns: 2, initialCount: 6, showAvatar: true, showDates: true, showSearch: false,
  align: 'start', formPosition: 'bottom', accentColor: null, gap: 16, padding: 24,
};

const clamp = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;

export function commentsDesign(data: CommentsBlockData | null | undefined): CommentsDesign {
  const d = (data ?? {}) as CommentsBlockData & { avatar?: string };
  return {
    style: d.style === 'list' || d.style === 'carousel' ? d.style : 'cards',
    columns: d.columns === 1 ? 1 : 2,
    initialCount: clamp(d.initialCount, 1, 12, DEFAULTS.initialCount),
    showAvatar: d.showAvatar !== false && d.avatar !== 'none',
    showDates: d.showDates !== false,
    showSearch: d.showSearch === true,
    align: d.align === 'center' ? 'center' : 'start',
    formPosition: d.formPosition === 'top' ? 'top' : 'bottom',
    accentColor: d.accentColor || null,
    gap: clamp(d.gap, 0, 48, DEFAULTS.gap),
    padding: clamp(d.padding, 0, 64, DEFAULTS.padding),
  };
}

// Writes a change, dropping design options that went back to their default so
// the saved block stays small. Title and description are content and are kept.
export function withCommentsDesign(data: CommentsBlockData | null | undefined, patch: Partial<CommentsBlockData>): CommentsBlockData {
  const next: Record<string, unknown> = { ...(data ?? {}), ...patch };
  delete next['avatar'];
  for (const k of Object.keys(next)) {
    if (k === 'title' || k === 'description') continue;
    const v = next[k];
    const empty = v === undefined || v === null || v === '' || (typeof v === 'object' && !Object.keys(v as object).length);
    if (empty || (k in DEFAULTS && v === (DEFAULTS as unknown as Record<string, unknown>)[k])) delete next[k];
  }
  return next as CommentsBlockData;
}
