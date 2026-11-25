/** Formatting and small business helpers shared by the Studio (v4.61, moved unchanged from the core engine). */
/* eslint-disable @typescript-eslint/no-explicit-any */

export const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
export const money = (n: unknown): string => '₪' + Number(n || 0).toLocaleString('he-IL');

/** Relative donor timestamps; records without a reliable timestamp keep their text label. */
export function donationRelativeTime(donor: any, now = Date.now()): string {
  const raw = donor.donatedAt ?? donor.donated_at ?? donor.donated_at_utc ?? donor.createdAt ?? donor.created_at ?? donor.timestamp;
  if (raw === undefined || raw === null || raw === '') return String(donor.time || '');
  let stamp: number;
  if (typeof raw === 'number') stamp = raw < 1e11 ? raw * 1000 : raw;
  else if (typeof raw === 'string' && /^\d{10,13}$/.test(raw.trim())) { const n = Number(raw); stamp = n < 1e11 ? n * 1000 : n; }
  else stamp = new Date(raw).getTime();
  if (!Number.isFinite(stamp)) return String(donor.time || '');
  const elapsed = Math.max(0, Math.floor((now - stamp) / 1000));
  if (elapsed < 60) return 'הרגע';
  const format = (n: number, singular: string, dual: string, plural: string) => n === 1 ? `לפני ${singular}` : n === 2 ? `לפני ${dual}` : `לפני ${n} ${plural}`;
  if (elapsed < 3600) return format(Math.floor(elapsed / 60), 'דקה', 'שתי דקות', 'דקות');
  if (elapsed < 86400) return format(Math.floor(elapsed / 3600), 'שעה', 'שעתיים', 'שעות');
  if (elapsed < 604800) return format(Math.floor(elapsed / 86400), 'יום', 'יומיים', 'ימים');
  if (elapsed < 2592000) return format(Math.floor(elapsed / 604800), 'שבוע', 'שבועיים', 'שבועות');
  if (elapsed < 31536000) return format(Math.floor(elapsed / 2592000), 'חודש', 'חודשיים', 'חודשים');
  return format(Math.floor(elapsed / 31536000), 'שנה', 'שנתיים', 'שנים');
}

/** A shekel amount grouped for editing (`1,234.5`); empty stays empty. */
export function formatAmount(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  let digits = String(value).replace(/[₪,\s ‎‏]/g, '').replace(/[^0-9.]/g, '');
  if (!digits) return '';
  const dot = digits.indexOf('.');
  if (dot >= 0) digits = digits.slice(0, dot + 1) + digits.slice(dot + 1).replace(/\./g, '');
  let [integer, decimal] = digits.split('.');
  integer = (integer || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return integer + (dot >= 0 ? '.' + String(decimal || '').slice(0, 2) : '');
}

export function ambassadorSafeLink(url: unknown): string { const link = String(url || '').trim(); return /^https?:\/\/[^\s]+$/i.test(link) ? link : ''; }

// ---- simple donation page ----
/** The simple page's visual settings (kept in management, so changing the campaign kind does not overwrite them). */
export function simpleVisualSettings(doc: any): any {
  const m = doc.management || (doc.management = {});
  return Object.assign({ identityMode: 'avatar', avatarSymbol: 'heart', avatarColor: '#246f65', showHeroLogo: true, showSteps: true, showFrequency: true, logoAnchor: 'top-center', titleAnchor: 'middle-center', subtitleAnchor: 'bottom-center', heroLogoAnchor: 'top-center', heroTitleAnchor: 'middle-center', heroSubtitleAnchor: 'bottom-center', titleFontSize: 19, titleWeight: 800, titleColor: '#071b35', subtitleFontSize: 12, subtitleWeight: 500, subtitleColor: '#8499be', heroTitleColor: '#ffffff', heroSubtitleColor: '#ffffff', heroHeight: 190, avatarSize: 46, pageColor: '#ffffff', cardColor: '#ffffff', amountSelectedColor: '#f0faf4', continueButtonColor: '#73cc97', layoutMode: '', identityPosition: 'middle-center', fontFamily: 'Heebo', logoBorder: false, logoBorderColor: '#e1e8e5', logoBorderWidth: 1, logoShape: 'circle', logoBackground: '#ffffff', titleAlign: 'center', heroHeightDesktop: 210, heroHeightMobile: 150, buttonHoverColor: '#64bd8e', buttonTextColor: '#ffffff', buttonBorderColor: '#73cc97', buttonRadius: 22, amountColor: '#ffffff', amountBorderColor: '#dbe3ef', amountHoverColor: '#eef7f2', amountSelectedBorderColor: '#0d733b', stepsActiveColor: '#07682f', stepsInactiveColor: '#9baed0', textColor: '#071b35' }, m.simpleDonation || {});
}
