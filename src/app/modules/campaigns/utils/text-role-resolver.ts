import { TextAlign, TextFontSize, TextStyle } from '../../../shared/models/text-style.model';
import { CampaignTheme } from '../services/campaign-studio-state.service';
import { CampaignStyleVisualTokens } from '../builder/styles/campaign-styles';

// Typography Phase A (2026-10) -- the ONE shared resolver every migrated
// Text Role (Donors/Ambassadors/Stats, for now) goes through. The
// principle agreed with the user: the RESOLVER owns the semantic text
// role; a Cards template and a List template rendering the same role must
// call the exact same function with the exact same inputs and get the
// exact same answer -- no template may locally decide a color/weight for
// a role it renders.
//
// Precedence, per property, is Section override (explicit user choice on
// this block) > Theme (only once the manager has genuinely diverged a
// theme field from its own factory default) > Style/legacy (the role's
// own pre-existing literal). This mirrors the exact-equality "untouched
// campaign" gate already proven in this file's callers' predecessors --
// statsTitleColor()/sectionBodyTextColor() in campaign-preview.component.ts
// and resolveSectionSurfaceColors() in campaign-styles.ts -- generalized
// so every NEW role uses the identical mechanism instead of a bespoke one.

export type ThemeColorField = 'secondaryColor' | 'accentColor' | 'bodyTextColor';

// The exact seed literals from createInitialDraft()/createInitialPartnerDraft()
// for each CampaignTheme color field -- never actually `undefined` on a real
// draft, so a plain `??` fallback would never fire. A role's Theme layer only
// applies once the field has genuinely moved away from ITS OWN default here,
// regardless of what that role's own (possibly different) legacy literal is.
export const LEGACY_THEME_COLOR: Record<ThemeColorField, string> = {
  secondaryColor: '#6fc9eb',
  accentColor:    '#cc350f',
  bodyTextColor:  '#334155',
};

const FONT_SIZE_PX: Record<TextFontSize, number> = { sm: 13, md: 16, lg: 20, xl: 26 };

export interface TextRoleLegacyDefaults {
  color:      string;
  fontSizePx: number;
  fontWeight: number;
  align?:     TextAlign;
  // Omit when this role has never been Theme-connected and shouldn't
  // silently become so -- it then stays a pure legacy literal until a
  // Section override sets it explicitly.
  themeColorField?: ThemeColorField;
  // Heading-class roles (section titles) also scale with the Campaign
  // Style's own headingScale/headingWeight tokens; value/caption/name
  // roles never do -- same distinction heroTitleSize()/.hm-section-title
  // already draw today.
  headingClass?: boolean;
}

export interface ResolvedTextRole {
  color:      string;
  fontSizePx: number;
  fontWeight: number;
  // 'inherit' when nothing overrides it -- the Campaign Style's own
  // fontFamily already cascades to every element via plain CSS
  // inheritance, so "no override" must defer to that instead of
  // reasserting a fixed value here.
  fontFamily: string;
  align:      TextAlign;
}

export function resolveRoleColor(
  explicit: string | undefined,
  legacyColor: string,
  theme: CampaignTheme | undefined,
  themeField?: ThemeColorField,
): string {
  if (explicit) return explicit;
  if (!themeField) return legacyColor;
  const themeValue = theme?.[themeField];
  const legacyThemeDefault = LEGACY_THEME_COLOR[themeField];
  return themeValue && themeValue !== legacyThemeDefault ? themeValue : legacyColor;
}

export function resolveRoleFontWeight(
  explicit: number | undefined,
  legacyWeight: number,
  visualTokens?: CampaignStyleVisualTokens,
  headingClass?: boolean,
): number {
  if (explicit) return explicit;
  if (headingClass && visualTokens) return visualTokens.typography.headingWeight;
  return legacyWeight;
}

export function resolveRoleFontSizePx(
  explicit: TextFontSize | undefined,
  legacyPx: number,
  visualTokens?: CampaignStyleVisualTokens,
  headingClass?: boolean,
): number {
  if (explicit) return FONT_SIZE_PX[explicit];
  const scale = headingClass && visualTokens ? visualTokens.typography.headingScale : 1;
  return Math.round(legacyPx * scale);
}

export function resolveRoleFontFamily(explicit: string | undefined): string {
  return explicit || 'inherit';
}

export function resolveRoleAlign(explicit: TextAlign | undefined, legacyAlign: TextAlign = 'right'): TextAlign {
  return explicit || legacyAlign;
}

// Universal Local Styling — Phase B1 (2026-10). resolveRoleColor() above is
// already fully generic and is reused AS-IS for every color property on
// every non-text role kind (surface background/borderColor, button
// background/textColor/borderColor, progress trackColor/fillColor) --
// nothing new needed there. The one genuinely missing primitive is radius,
// which (unlike color) has no per-campaign Theme field to gate against --
// it resolves against the Campaign Style's own generic, already-shipped
// `cards.radius`/`buttons.radius` tokens instead (Phase 3A), never a new
// per-component Style token.
export type RadiusTokenKind = 'cards' | 'buttons';

export function resolveRoleBorderRadius(
  explicit: number | undefined,
  legacyPx: number,
  visualTokens: CampaignStyleVisualTokens | undefined,
  kind?: RadiusTokenKind,
): number {
  if (explicit !== undefined) return explicit;
  const token = kind === 'cards' ? visualTokens?.cards.radius : kind === 'buttons' ? visualTokens?.buttons.radius : undefined;
  if (token) {
    const parsed = parseInt(token, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return legacyPx;
}

export function resolveTextRole(
  override: Partial<TextStyle> | undefined,
  legacy: TextRoleLegacyDefaults,
  theme: CampaignTheme | undefined,
  visualTokens?: CampaignStyleVisualTokens,
): ResolvedTextRole {
  return {
    color:      resolveRoleColor(override?.color, legacy.color, theme, legacy.themeColorField),
    fontSizePx: resolveRoleFontSizePx(override?.fontSize, legacy.fontSizePx, visualTokens, legacy.headingClass),
    fontWeight: resolveRoleFontWeight(override?.fontWeight, legacy.fontWeight, visualTokens, legacy.headingClass),
    fontFamily: resolveRoleFontFamily(override?.fontFamily),
    align:      resolveRoleAlign(override?.align, legacy.align),
  };
}
