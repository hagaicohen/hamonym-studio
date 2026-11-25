import type { ContentLang } from './content-i18n';

// Text color per content language (2026-11-09), the same idea as the element
// fonts in campaign-fonts.ts: `<field>ByLanguage[lang]` wins, and the older
// shared field stays the value for a language that has none of its own. An
// empty string means "campaign default" for that language even when an older
// shared color exists, so clearing one language never changes the other.
export type ElementColorField = 'color' | 'titleColor' | 'subtitleColor';
type ByLanguage = Partial<Record<ContentLang, string>>;
export interface ElementColorStyle {
  color?: string;
  titleColor?: string;
  subtitleColor?: string;
  colorByLanguage?: ByLanguage;
  titleColorByLanguage?: ByLanguage;
  subtitleColorByLanguage?: ByLanguage;
}

const mapField = (field: ElementColorField) => `${field}ByLanguage` as const;

export function elementColor(style: ElementColorStyle | undefined, lang: ContentLang, field: ElementColorField = 'color'): string | undefined {
  const own = style?.[mapField(field)];
  if (own && lang in own) return own[lang] || undefined;
  return style?.[field] || undefined;
}

export function setElementColor<T extends ElementColorStyle>(style: T, lang: ContentLang, color: string | null, field: ElementColorField = 'color'): T {
  const next: ElementColorStyle = { ...style };
  const colors: ByLanguage = { ...style[mapField(field)] };
  if (color) colors[lang] = color;
  else if (style[field]) colors[lang] = '';
  else delete colors[lang];
  if (Object.keys(colors).length) next[mapField(field)] = colors; else delete next[mapField(field)];
  return next as T;
}

// #rgb / #rrggbb / rgb()/rgba() → #rrggbb (null when not a solid color).
export function toHex(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().toLowerCase();
  let m = /^#?([0-9a-f]{3})$/.exec(v);
  if (m) return '#' + m[1].split('').map(c => c + c).join('');
  m = /^#?([0-9a-f]{6})$/.exec(v);
  if (m) return '#' + m[1];
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (!rgb) return null;
  if (rgb[4] !== undefined && parseFloat(rgb[4]) === 0) return null;
  return '#' + [rgb[1], rgb[2], rgb[3]].map(n => Math.min(255, +n).toString(16).padStart(2, '0')).join('');
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio (1–21); null when either color can't be read.
export function contrastRatio(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = toHex(a), y = toHex(b);
  if (!x || !y) return null;
  const [l1, l2] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}
