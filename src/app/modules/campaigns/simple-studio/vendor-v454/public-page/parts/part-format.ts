/**
 * Formatting rules of the public page parts, moved out of the campaign core (v4.46) with their exact
 * rules: the parts must print the same text and styles as the core's markup did. CSS text is built
 * unescaped (`raw`): the components set it through the DOM, where the markup's `esc` + HTML decoding
 * gave the same value.
 */
import { CardData } from '../cards/card-format';
import { textEffectStyle } from '../collections/collection-style';

const text = (v: unknown): string => String(v ?? '');
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
/** `Number(v)` when finite, else `fallback` (the core's `Number.isFinite(Number(x))?Number(x):d`). */
const finite = (v: unknown, fallback: number): number => Number.isFinite(Number(v)) ? Number(v) : fallback;

/** "מסתיים בעוד 3 ימים" / compact "3 יום" (core `campaignCountdown`). */
export function campaignCountdown(value: unknown, compact = false): string {
  if (!value) return '';
  const target = new Date(value as string).getTime();
  if (!Number.isFinite(target)) return 'מועד סיום לא תקין';
  const ms = target - Date.now();
  if (ms <= 0) return compact ? 'הסתיים' : 'הקמפיין הסתיים';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return compact ? mins + ' דקות' : 'מסתיים בעוד ' + mins + ' דקות';
  const hours = Math.ceil(ms / 3600000);
  if (hours <= 48) return compact ? hours + ' שעות' : 'מסתיים בעוד ' + hours + ' שעות';
  const days = Math.ceil(ms / 86400000);
  return compact ? days + ' יום' : 'מסתיים בעוד ' + days + ' ימים';
}

/** Style of the donate buttons (core `donateStyle`). */
export function donateStyle(d: CardData): string {
  const bg = text(d['bg'] || '#246f65'), fg = text(d['textColor'] || '#ffffff'), bc = text(d['borderColor'] || bg);
  const width = clamp(Number(d['borderWidth']) || 0, 0, 8), size = clamp(Number(d['fontSize']) || 17, 12, 26), radius = clamp(Number(d['rounded']) || 0, 0, 40);
  return `background:${d['style'] === 'outline' ? 'transparent' : bg}!important;color:${fg}!important;border:${d['style'] === 'outline' ? Math.max(1, width) : width}px solid ${bc}!important;border-radius:${radius}px!important;font-size:${size}px!important;`;
}

/** The donate button's icon (core `donateLabel`): an uploaded image, an emoji, or none. */
export interface DonateIcon { image: string; emoji: string; style: string; }
export function donateIcon(d: CardData): DonateIcon | null {
  const mode = d['iconMode'] || 'emoji';
  const image = mode === 'custom' && d['customIcon'] ? text(d['customIcon']) : '';
  const emoji = !image && mode === 'emoji' && d['emoji'] ? text(d['emoji']) : '';
  if (mode === 'none' || (!image && !emoji)) return null;
  // `Number(x) ?? 50` is never 50: NaN passes `??` and clamps to NaN, printed as "NaN%" (as before).
  const style = `font-size:${clamp(Number(d['emojiSize']) || 22, 12, 48)}px;margin-inline:${clamp(Number(d['emojiGap']) || 0, 0, 24) / 2}px;background:${d['emojiShowBackground'] ? text(d['emojiBackground'] || '#ffffff') : 'transparent'};padding:${clamp(Number(d['emojiPadding']) || 0, 0, 18)}px;border-radius:${clamp(Number(d['emojiRadius']) ?? 50, 0, 50)}%`;
  return { image, emoji, style };
}

/** Hero title / subtitle styles (inline in the core's `renderPreview`). */
export function heroTitleStyle(h: CardData): string {
  const color = h['titleColor'] || h['textColor'] || '#ffffff';
  return `font-size:${clamp(Number(h['titleFontSize']) || 34, 12, 100)}px;font-weight:${clamp(Number(h['titleWeight']) || 900, 400, 900)};letter-spacing:${finite(h['titleLetterSpacing'], -1)}px;color:${text(color)};${textEffectStyle(h['titleEffect'], color)}`;
}
export function heroSubtitleStyle(h: CardData): string {
  const color = h['subtitleColor'] || h['textColor'] || '#ffffff';
  return `font-size:${clamp(Number(h['subtitleFontSize']) || 14, 10, 60)}px;font-weight:${clamp(Number(h['subtitleWeight']) || 500, 400, 900)};letter-spacing:${finite(h['subtitleLetterSpacing'], 0)}px;color:${text(color)};${textEffectStyle(h['subtitleEffect'], color)}`;
}

/** Title block styles (below the Hero). */
export function titleStyle(t: CardData): string {
  const color = t['titleColor'] || '#203a36';
  return `font-size:${clamp(Number(t['titleFontSize']) || 26, 16, 52)}px;font-weight:${clamp(Number(t['titleWeight']) || 900, 400, 900)};letter-spacing:${finite(t['titleLetterSpacing'], 0)}px;color:${text(color)};${textEffectStyle(t['titleEffect'], color)}`;
}
export function titleSubtitleStyle(t: CardData): string {
  const color = t['subtitleColor'] || '#5f726d';
  return `font-size:${clamp(Number(t['subtitleFontSize']) || 15, 12, 32)}px;font-weight:${clamp(Number(t['subtitleWeight']) || 700, 400, 900)};letter-spacing:${finite(t['subtitleLetterSpacing'], 0)}px;color:${text(color)};${textEffectStyle(t['subtitleEffect'], color)}`;
}
export function titleDescriptionStyle(t: CardData): string {
  const color = t['descriptionColor'] || '#4f605b';
  return `font-size:${clamp(Number(t['descriptionFontSize']) || 14, 12, 26)}px;font-weight:${clamp(Number(t['descriptionWeight']) || 400, 300, 800)};letter-spacing:${finite(t['descriptionLetterSpacing'], 0)}px;color:${text(color)};${textEffectStyle(t['descriptionEffect'], color)}`;
}
