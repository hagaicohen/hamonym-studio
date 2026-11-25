/**
 * Presentation helpers of the public collections, moved out of the campaign core (v4.45) with
 * their exact rules. The core keeps thin wrappers with its old names (`hamPresentationFor`,
 * `hamCardSizeVars`, `rewardStyleVars`, `huStyleHeading`…), because its inspector and the manager
 * still call them.
 *
 * Functions that build CSS text take an `escape` function: the core writes the result into markup
 * (and escapes it, as before), while the components set it as an attribute through the DOM, where
 * the HTML parser's decoding does not apply (so they pass `raw`).
 */
import { clampOrDefault, hexColor } from '../../core/campaign-style';
import { CardData } from '../cards/card-format';

export type Escape = (value: unknown) => string;
/** No escaping: for values set through the DOM (`setAttribute`, Angular bindings). */
export const raw: Escape = v => String(v ?? '');
/** The core's `esc`, for values written into markup. */
export const escapeHtml: Escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export type CardDevice = 'mobile' | 'desktop';
type SizeScope = 'rewards' | 'races';
interface CardSize { width: number; image: number; padding: number; button: number; }

/** Default card sizes per device (core `hamCardSizeDefaults`). */
export const CARD_SIZE_DEFAULTS: Record<SizeScope, Record<CardDevice, CardSize>> = {
  rewards: { mobile: { width: 266, image: 104, padding: 12, button: 34 }, desktop: { width: 288, image: 126, padding: 14, button: 38 } },
  races: { mobile: { width: 268, image: 108, padding: 12, button: 34 }, desktop: { width: 304, image: 122, padding: 15, button: 39 } }
};

/** Card size of a scope on a device: the saved values over the defaults (core `hamCardSizeFor`). */
export function cardSizeFor(campaign: CardData, scope: string, dev: string): CardData {
  const cfg = campaign['content']?.[scope] || {};
  const baseline: CardData = { ...((CARD_SIZE_DEFAULTS as CardData)[scope]?.[dev] || {}) };
  const saved = cfg.cardSizing?.[dev] || {};
  // Keep intentional legacy changes to image height until the new per-device setting is saved.
  if (saved.image === undefined) {
    const legacy = Number(scope === 'rewards' ? cfg.rewardImageHeight : cfg.imageHeight);
    const original = scope === 'rewards' ? 130 : 120;
    if (Number.isFinite(legacy) && legacy > 0 && legacy !== original) baseline['image'] = legacy;
  }
  const clean: CardData = { ...baseline };
  for (const key of ['width', 'image', 'padding', 'button']) {
    const n = Number(saved[key]);
    if (saved[key] !== undefined && saved[key] !== null && saved[key] !== '' && Number.isFinite(n) && n > 0) clean[key] = n;
  }
  return clean;
}

/** CSS variables of the card size (core `hamCardSizeVars`). */
export function cardSizeVars(campaign: CardData, scope: string, dev: string): string {
  const c = cardSizeFor(campaign, scope, dev), lim = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || lo));
  const cols = Number((campaign['content']?.[scope] || {})[dev === 'mobile' ? 'columnsMobile' : 'columnsDesktop']) || 1;
  return `--ham-size-card-width:${lim(c['width'], 170, 440)}px;--ham-size-image-height:${lim(c['image'], 50, 230)}px;--ham-size-inner-padding:${lim(c['padding'], 6, 30)}px;--ham-size-button-height:${lim(c['button'], 28, 54)}px;--ham-limit-cols:${Math.max(1, Math.min(6, cols))};`;
}

/** CSS variables of the reward card typography and colors (core `rewardStyleVars`). */
export function rewardStyleVars(campaign: CardData, cfg: CardData, dev: string, escape: Escape = escapeHtml): string {
  const color = (v: unknown, def: string) => escape(hexColor(v, def));
  const size = clampOrDefault;
  return `--reward-title-color:${color(cfg['rewardTitleColor'], '#24483c')};--reward-title-size:${size(cfg['rewardTitleSize'], 12, 26, 15)}px;--reward-title-weight:${size(cfg['rewardTitleWeight'], 400, 900, 800)};--reward-description-color:${color(cfg['rewardTextColor'], '#64776e')};--reward-description-size:${size(cfg['rewardTextSize'], 10, 19, 12)}px;--reward-description-weight:${size(cfg['rewardTextWeight'], 300, 800, 400)};--reward-price-color:${color(cfg['rewardPriceColor'], '#246f65')};--reward-price-size:${size(cfg['rewardPriceSize'], 15, 34, 20)}px;--reward-price-weight:${size(cfg['rewardPriceWeight'], 400, 900, 900)};--reward-button-bg:${color(cfg['rewardButtonBg'], '#246f65')};--reward-button-ink:${color(cfg['rewardButtonColor'], '#ffffff')};--reward-button-size:${size(cfg['rewardButtonSize'], 11, 19, 12)}px;--reward-button-weight:${size(cfg['rewardButtonWeight'], 400, 900, 800)};--reward-stock-color:${color(cfg['rewardStockColor'], '#577e70')};--reward-border-color:${color(cfg['rewardBorderColor'], '#dce8e2')};--reward-radius:${size(cfg['rewardRadius'], 0, 28, 14)}px;--reward-image-height:var(--ham-size-image-height,130px);${cardSizeVars(campaign, 'rewards', dev)}`;
}

/** `text-shadow` of a text effect (core `textEffectStyle`). */
export function textEffectStyle(effect: unknown, color: unknown): string {
  const c = String(color || '').trim() || '#203a36';
  switch (String(effect || 'none')) {
    case 'shadow': return 'text-shadow:0 2px 12px rgba(0,0,0,.18)';
    case 'glow': return `text-shadow:0 0 14px ${c}44, 0 0 2px ${c}66`;
    case 'outline': return 'text-shadow:-1px 0 rgba(255,255,255,.45), 0 1px rgba(255,255,255,.45), 1px 0 rgba(255,255,255,.45), 0 -1px rgba(255,255,255,.45)';
    default: return '';
  }
}

/** Style of a block heading (core `huStyleHeading`). */
export function headingStyle(cfg: CardData, scope: string, escape: Escape = escapeHtml): string {
  const fallback = scope === 'donors' ? Number(cfg['titleSize'] || 24) : 24;
  const size = Math.max(14, Math.min(48, Number(cfg['headingSize']) || fallback));
  const color = escape(cfg['headingColor'] || '#203a36');
  const align = ['right', 'center', 'left'].includes(cfg['headingAlign']) ? cfg['headingAlign'] : 'right';
  const weight = Math.max(400, Math.min(900, Number(cfg['headingWeight']) || 800));
  return `text-align:${align};color:${color};font-size:${size}px;font-weight:${weight};letter-spacing:${Number(cfg['headingLetterSpacing']) || 0}px;${textEffectStyle(cfg['headingEffect'], color)}`;
}

export interface Presentation {
  preset: 'compact' | 'balanced' | 'wide' | 'two';
  text: string;
  nav: string;
  count: string;
  spread: 'center' | 'stretch';
  imagePosition: 'side' | 'top';
}

/** Presentation settings of a scope on a device (core `hamPresentationFor`). */
export function presentationFor(campaign: CardData, scope: string, dev: string): Presentation {
  const cfg = campaign['content']?.[scope] || {}, saved = cfg.presentation?.[dev] || {};
  const legacy = scope === 'rewards' && dev === 'mobile' ? cfg.mobileViewMode : '';
  const preset = ['compact', 'balanced', 'wide', 'two'].includes(saved.preset) ? saved.preset :
    legacy === 'two' ? 'two' : legacy === 'wide' ? 'wide' : 'balanced';
  const text = saved.text || ((scope === 'rewards' && dev === 'mobile' && cfg.mobileTextMode) ? cfg.mobileTextMode : (preset === 'two' ? 'hide' : preset === 'compact' ? 'one' : 'two'));
  const nav = cfg.carouselNavStyle || 'near';
  const rawCount = saved.count;
  const count = rawCount === 'auto' || rawCount == null ? 'auto' : (Number.isInteger(Number(rawCount)) && Number(rawCount) >= 1 && Number(rawCount) <= 4 ? String(rawCount) : 'auto');
  const spread = saved.spread === 'stretch' ? 'stretch' : 'center';
  const imagePosition = saved.imagePosition === 'side' ? 'side' : saved.imagePosition === 'top' ? 'top' : cfg.layout === 'list' ? 'side' : 'top';
  return { preset, text, nav, count, spread, imagePosition };
}
