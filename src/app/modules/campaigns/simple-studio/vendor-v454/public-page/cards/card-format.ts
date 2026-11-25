/**
 * Formatting helpers of the public cards, moved out of the campaign core (v4.44) with their
 * exact rules: the cards must print the same text as the core's markup did.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CardData = Record<string, any>;

/** `₪1,234` in the Hebrew locale (core `money`). `NaN` prints as `₪NaN`, as before. */
export const money = (n: unknown): string => '₪' + Number(n || 0).toLocaleString('he-IL');

/**
 * Text of a value as a template literal prints it (`undefined` → "undefined"). Attributes the
 * core wrote without `esc`/fallback keep that spelling, because other code reads them back.
 */
export const asText = (v: unknown): string => `${v}`;

/** A date as "5 במרץ 2026", or the raw value if it is not a date (core `raceDate`). */
export function cardDate(r: CardData): string {
  if (!r['date']) return '';
  const t = new Date(String(r['date']).slice(0, 10) + 'T12:00:00');
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : String(r['date']);
}

/**
 * Relative donation time ("לפני 3 דקות"), shared by the donor card views (core
 * `hamDonationRelativeTime`). Records without a reliable timestamp keep their text label.
 */
export function donationRelativeTime(donor: CardData, now = Date.now()): string {
  const raw = donor['donatedAt'] ?? donor['donated_at'] ?? donor['donated_at_utc'] ?? donor['createdAt'] ?? donor['created_at'] ?? donor['timestamp'];
  if (raw === undefined || raw === null || raw === '') return String(donor['time'] || '');
  let stamp: number;
  if (typeof raw === 'number') stamp = raw < 1e11 ? raw * 1000 : raw;
  else if (typeof raw === 'string' && /^\d{10,13}$/.test(raw.trim())) { const n = Number(raw); stamp = n < 1e11 ? n * 1000 : n; }
  else stamp = new Date(raw).getTime();
  if (!Number.isFinite(stamp)) return String(donor['time'] || '');
  const elapsed = Math.max(0, Math.floor((now - stamp) / 1000));
  if (elapsed < 60) return 'הרגע';
  const format = (n: number, singular: string, dual: string, plural: string): string => n === 1 ? `לפני ${singular}` : n === 2 ? `לפני ${dual}` : `לפני ${n} ${plural}`;
  if (elapsed < 3600) return format(Math.floor(elapsed / 60), 'דקה', 'שתי דקות', 'דקות');
  if (elapsed < 86400) return format(Math.floor(elapsed / 3600), 'שעה', 'שעתיים', 'שעות');
  if (elapsed < 604800) return format(Math.floor(elapsed / 86400), 'יום', 'יומיים', 'ימים');
  if (elapsed < 2592000) return format(Math.floor(elapsed / 604800), 'שבוע', 'שבועיים', 'שבועות');
  if (elapsed < 31536000) return format(Math.floor(elapsed / 2592000), 'חודש', 'חודשיים', 'חודשים');
  return format(Math.floor(elapsed / 31536000), 'שנה', 'שנתיים', 'שנים');
}

/** An `http(s)` link without spaces, otherwise '' (core `ambassadorSafeLink`). */
export function safeLink(url: unknown): string {
  const link = String(url || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(link) ? link : '';
}
