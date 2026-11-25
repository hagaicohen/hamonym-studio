/**
 * The Inspector's edits as plain functions over the campaign document (moved unchanged from the core engine).
 * `InspectorService` calls them from the Inspector's Angular event bindings; the core reads the shared tables.
 */
import { presentationFor } from '../public-page/collections/collection-style';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = any;

export const PALETTES: Record<string, { name: string; desc: string; primary: string; secondary: string; surface: string; ink: string }> = { classic: { name: 'קלאסיק', desc: 'כחול עמוק וזהב', primary: '#183c5a', secondary: '#d8b16c', surface: '#f8f9fb', ink: '#1d3040' }, warm: { name: 'חם', desc: 'טרקוטה ושמנת', primary: '#a9533b', secondary: '#e9b67e', surface: '#fff8f0', ink: '#51392f' }, civic: { name: 'סיויק', desc: 'ממלכתי ומאופק', primary: '#214e68', secondary: '#93b6c6', surface: '#f2f6f8', ink: '#263c48' }, nature: { name: 'שורשים', desc: 'ירוק וזהב', primary: '#246f65', secondary: '#e7b46e', surface: '#f8f5ef', ink: '#203a36' }, modern: { name: 'מודרני', desc: 'סגול בהיר', primary: '#5a40ad', secondary: '#d9cbff', surface: '#f5f4fa', ink: '#241f39' }, sunrise: { name: 'זריחה', desc: 'כתום ואור', primary: '#c35137', secondary: '#ffd37e', surface: '#fff8ee', ink: '#493029' }, minimal: { name: 'מינימל', desc: 'שחור ולבן', primary: '#20252a', secondary: '#c8ced2', surface: '#ffffff', ink: '#20252a' }, rose: { name: 'רוז', desc: 'בורדו וורוד', primary: '#803e58', secondary: '#e6b6c5', surface: '#fff7f9', ink: '#4b2d3a' }, ocean: { name: 'אוקיינוס', desc: 'טורקיז וכחול', primary: '#176e80', secondary: '#a5d9d8', surface: '#f1faf9', ink: '#23434d' }, olive: { name: 'זית', desc: 'זית וחול', primary: '#5b6740', secondary: '#d8c18a', surface: '#faf8ef', ink: '#353d30' } };

/** A shekel field's number (the edit mode groups the digits). */
export function readAmount(value: unknown): number {
  const normalized = String(value ?? '').replace(/[₪,\s ‎‏]/g, '').replace(/[^0-9.]/g, '');
  const n = Number(normalized); return Number.isFinite(n) ? n : 0;
}

export function applyTypographyPreset(doc: Doc, scope: string, id: string): void {
  const obj = doc.content[scope]; if (!obj) return;
  const t = ({
    classic: { align: 'right', weight: 800, subWeight: 400, size: 26, subSize: 15, effect: 'none', spacing: 0 },
    bold: { align: 'center', weight: 900, subWeight: 600, size: 34, subSize: 16, effect: 'none', spacing: -.5 },
    elegant: { align: 'right', weight: 500, subWeight: 400, size: 30, subSize: 16, effect: 'none', spacing: .5 },
    emotional: { align: 'center', weight: 900, subWeight: 500, size: 35, subSize: 17, effect: 'shadow', spacing: -.5 }
  } as Record<string, any>)[id]; if (!t) return;
  if (scope === 'hero') {
    Object.assign(obj, { titleAlign: t.align, subtitleAlign: t.align, titleWeight: t.weight, subtitleWeight: t.subWeight, titleFontSize: Math.max(24, t.size + 8), subtitleFontSize: t.subSize, titleEffect: t.effect, subtitleEffect: id === 'emotional' ? 'shadow' : 'none', titleLetterSpacing: t.spacing, subtitleLetterSpacing: 0, titleColor: '#ffffff', subtitleColor: '#ffffff' });
  } else if (scope === 'title') {
    Object.assign(obj, { titleAlign: t.align, subtitleAlign: t.align, descriptionAlign: t.align, titleWeight: t.weight, subtitleWeight: t.subWeight, descriptionWeight: 400, titleFontSize: t.size, subtitleFontSize: t.subSize, descriptionFontSize: 14, titleEffect: t.effect, subtitleEffect: 'none', descriptionEffect: 'none', titleLetterSpacing: t.spacing, subtitleLetterSpacing: 0, descriptionLetterSpacing: 0, titleColor: '#203a36', subtitleColor: '#5f726d', descriptionColor: '#4f605b' });
  } else {
    Object.assign(obj, { headingAlign: t.align, headingWeight: t.weight, headingSize: t.size, headingEffect: t.effect, headingLetterSpacing: t.spacing, headingColor: '#203a36' });
    if (scope !== 'updates') Object.assign(obj, { subtitleAlign: t.align, subtitleWeight: t.subWeight, subtitleSize: t.subSize, subtitleEffect: 'none', subtitleLetterSpacing: 0, subtitleColor: '#657a70' });
    if (scope === 'donors') obj.titleSize = t.size;
  }
  obj.typographyPreset = id;
}

/** The donation box's per-device style keys: "both" writes the base value and clears the device overrides. */
export const DB_STYLE_KEYS = ['boxCardPresentation', 'boxDistribution', 'boxLayout', 'boxShape', 'boxCardBg', 'boxCardBorder', 'boxCardBorderWidth', 'boxCardRadius', 'boxCardHeight', 'boxCardFontSize', 'boxColumns', 'boxGap', 'boxBg', 'boxText', 'boxAccent'];
export function dbUpdateStyle(d: Doc, key: string, value: unknown, scope: string): void {
  if (!d.boxResponsive) d.boxResponsive = {};
  if (scope === 'both') {
    d[key] = value;
    for (const target of ['mobile', 'desktop']) if (d.boxResponsive[target]) delete d.boxResponsive[target][key];
  } else {
    if (!d.boxResponsive[scope]) d.boxResponsive[scope] = {};
    d.boxResponsive[scope][key] = value;
  }
}

/** One configuration for every campaign carousel (the inspector's layout choice returns to `ordinary`). */
export const CAROUSEL_MODULES = [
  { scope: 'rewards', track: '.reward-tiles', card: '.reward-tile', label: 'תשורות', ordinary: 'cards' },
  { scope: 'sponsors', track: '.sponsor-grid', card: '.sponsor-tile', label: 'חסויות', ordinary: 'logos' },
  { scope: 'donors', track: '.donors-items', card: '.donors-entry', label: 'תורמים', ordinary: 'list' },
  { scope: 'ambassadors', track: '.ambassador-collection', card: '.ambassador-card', label: 'שגרירים', ordinary: 'cards' },
  { scope: 'races', track: '.ham-race-grid', card: '.ham-race-card', label: 'מירוצים', ordinary: 'cards' },
  { scope: 'updates', track: '.ham-update-grid', card: '.ham-update-card', label: 'עדכונים', ordinary: 'feed' },
  { scope: 'comments', track: '.ham-comment-grid', card: '.ham-comment-card', label: 'תגובות', ordinary: 'list' }
];
const CAROUSEL_BASELINE: Record<string, [number, number]> = { rewards: [260, 216], sponsors: [145, 170], donors: [240, 226], ambassadors: [235, 230], races: [265, 238], updates: [245, 238], comments: [230, 224] };
export function presentationMetrics(doc: Doc, scope: string, dev: string): any {
  const conf = doc.content?.[scope] || {}, p = presentationFor(doc, scope, dev) as any;
  const base = CAROUSEL_BASELINE[scope] || [240, 285];
  const nominal = base[dev === 'mobile' ? 0 : 1];
  const variants: Record<string, number> = { compact: .79, balanced: 1, wide: 1.2, two: dev === 'mobile' ? .57 : .82 };
  let width = Math.round(nominal * variants[p.preset]);
  if (p.preset === 'two' && dev === 'mobile') width = Math.max(122, Math.min(147, width));
  if (['rewards', 'races'].includes(scope) && !conf.presentation?.[dev]?.preset && p.preset === 'balanced') {
    const saved = conf.cardSizing?.[dev]?.width;
    if (Number(saved) >= 170) width = Number(saved);
  }
  const columns = dev === 'mobile'
    ? (p.preset === 'two' ? 2 : p.preset === 'wide' ? 1 : (scope === 'sponsors' ? 2 : 1))
    : (p.count === 'auto' ? 4 : Math.max(1, Math.min(4, Number(p.count) || 1)));
  const gap = p.preset === 'two' ? 8 : p.preset === 'compact' ? 9 : Math.max(8, Math.min(24, Number(conf.gap) || 12));
  const gutter = p.nav === 'dots' ? 6 : p.preset === 'two' ? 26 : 34;
  return { ...p, width, columns, gap, gutter };
}

/** The unified editor's quick styles: only colour keys the selected component already has are changed. */
const UNIFIED_PRESETS: Record<string, { label: string; description: string; primary: string; background: string; surface: string; text: string }> = {
  classic: { label: 'קלאסי', description: 'נקי ומאוזן', primary: '#246f65', background: '#ffffff', surface: '#f8fbf9', text: '#203a36' },
  warm: { label: 'חמים', description: 'רך ומזמין', primary: '#b37a45', background: '#fffaf5', surface: '#fff3e6', text: '#5c4331' },
  civic: { label: 'קהילתי', description: 'ברור ובטוח', primary: '#285b87', background: '#f9fbff', surface: '#edf4fa', text: '#213f59' },
  elegant: { label: 'אלגנטי', description: 'עדין ומרווח', primary: '#785c85', background: '#ffffff', surface: '#f7f4f9', text: '#433a4b' }
};
/** The component a quick style applies to, or null (nothing to change). */
export function unifiedPresetTarget(doc: Doc, selected: string, id: string): Doc | null {
  if (!UNIFIED_PRESETS[id]) return null;
  return (selected === 'theme' ? doc.theme : selected === 'donationBox' ? doc.content.donate : doc.content[selected]) || null;
}
export function applyUnifiedPreset(target: Doc, id: string): void {
  const p = UNIFIED_PRESETS[id];
  const keyColors: Record<string, string> = { bg: p.background, cardBg: p.background, background: p.background, logoBg: p.background,
    surface: p.surface, textColor: p.text, titleColor: p.text, headingColor: p.text, nameColor: p.text,
    accentColor: p.primary, primary: p.primary, color: p.primary, buttonBg: p.primary, rewardButtonBg: p.primary,
    borderColor: p.surface, border: p.surface, subtitleColor: p.text, descriptionColor: p.text,
    boxCardBg: p.background, boxCardBorder: p.surface, boxBg: p.background, boxText: p.text, boxAccent: p.primary, ink: p.text };
  for (const [key, value] of Object.entries(keyColors)) { if (Object.prototype.hasOwnProperty.call(target, key)) target[key] = value; }
}

/** The stats card's shared style library (presets, shapes, meters). */
export const CARD_DESIGN_LIBRARY = Object.freeze({
  presets: Object.freeze({
    classic: { label: 'קלאסי', symbol: '▤', bg: '#ffffff', text: '#223e35', border: '#d9e5df', accent: '#246f65', opacity: 100, glass: false, shadow: true, borderEnabled: false, meter: 'horizontal', radius: 20 },
    dashboard: { label: 'לוח מחוונים', symbol: '◉', bg: '#ffffff', text: '#223e35', border: '#d9e5df', accent: '#246f65', opacity: 100, glass: false, shadow: true, borderEnabled: false, meter: 'circular', radius: 22 },
    icons: { label: 'מדדים עם אייקונים', symbol: '◈', bg: '#ffffff', text: '#223e35', border: '#d9e5df', accent: '#246f65', opacity: 100, glass: false, shadow: true, borderEnabled: false, meter: 'horizontal', radius: 17 },
    text: { label: 'טקסט בלבד', symbol: '≡', bg: '#ffffff', text: '#223e35', border: '#d9e5df', accent: '#246f65', opacity: 100, glass: false, shadow: false, borderEnabled: false, meter: 'horizontal', radius: 14 }
  }) as Record<string, any>,
  shapes: Object.freeze([['square', 'כרטיס', '▣']]),
  meters: Object.freeze([['horizontal', 'פס אופקי'], ['circular', 'טבעת']]),
  applyPreset(cfg: Doc, id: string, primary: string): void {
    const preset = this.presets[id] || this.presets['classic'];
    const { shape, enabled, sidebarStyled, textTiles, bg, text, border, accent, opacity, glass, shadow, borderEnabled, borderWidth, radius, bold } = cfg;
    Object.assign(cfg, preset, { preset: id });
    // Preserve individually customized appearance when changing the content layout.
    Object.assign(cfg, { shape, enabled, sidebarStyled, textTiles, bg: bg || preset.bg, text: text || preset.text, border: border || preset.border, accent: accent || primary || preset.accent,
      opacity: opacity ?? preset.opacity, glass: glass ?? preset.glass, shadow: shadow ?? preset.shadow,
      borderEnabled: borderEnabled ?? preset.borderEnabled, borderWidth: borderWidth ?? 1, radius: radius ?? preset.radius,
      meter: preset.meter, bold: !!bold });
  }
});
