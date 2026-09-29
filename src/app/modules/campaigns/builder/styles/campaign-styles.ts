import type { CampaignTheme } from '../../services/campaign-studio-state.service';

// Campaign Design Evolution — Palette Derivation (2026-09-29, supersedes
// Phase 1's fixed-4-hex Styles). Campaign Style is a pure collection of
// design DEFAULTS. It is deliberately NOT a Template: it never touches
// blocks, content, hero placement, layoutMode, or anything persisted
// outside layout.campaignStyleId/layout.styleOverrides/the 4 fields below
// inside layout.theme. See docs/DECISIONS.md for the full architecture
// writeup.
export type CampaignStyleId =
  | 'classic' | 'clean' | 'bold' | 'editorial' | 'warm'
  | 'vibrant' | 'nature' | 'midnight';

// Only these 4 CampaignTheme fields are Style-managed. Every other theme
// field (logoBg, rewardsBg, topStripBg, etc.) is untouched by Style/
// resolveTheme and keeps whatever value it already had. Kept as a named
// union (not Partial<CampaignTheme>) so a Style/override can never silently
// reach into a field this phase doesn't intend to manage.
export type StyleColorField = 'primaryColor' | 'secondaryColor' | 'accentColor' | 'bodyTextColor';

// Product model (2026-09-29 decision): Primary is the user's brand-identity
// choice; Style is the design language Hamonym uses to build a coherent
// palette AROUND it. All 4 managed fields resolve through the exact same
// rule — explicit override, else "automatic" — which is why StyleColorField
// includes 'primaryColor' too: mechanically it is not special. The only
// difference is HOW "automatic" is computed per field:
//   primaryColor   -> a constant seed (style.defaultPrimary)
//   the other 3    -> derivePalette(effectivePrimary, style), a function OF
//                     whatever primary currently resolves to
// This deliberately makes Classic a REAL Style that responds to Primary
// like the other 4, not a legacy-compatibility special case — that
// protection already exists independently via campaignStyleId === undefined
// (see resolveTheme below, and CampaignLayout's own doc comment).
interface PaletteRecipeChannel { hueShift: number; satMul: number; lightAdd: number; }
interface CampaignStyleRecipe {
  secondary: PaletteRecipeChannel;
  accent:    PaletteRecipeChannel;
  // Body text targets an absolute (not additive) lightness — every style
  // wants genuinely dark, mostly-desaturated text regardless of primary's
  // own lightness, just tinted faintly toward its hue for cohesion.
  bodyText:  { satMul: number; light: number };
}

export interface CampaignStyleDefinition {
  id:    CampaignStyleId;
  label: string;
  defaultPrimary: string;
  recipe: CampaignStyleRecipe;
}

// Recipe coefficients are a first, reasonable-but-placeholder pass (not
// color-theory-final), deliberately kept as plain data separate from the
// hue/lightness math in derivePalette() below — retuning a Style's feel
// later means editing these numbers, never the algorithm.
//
// Classic's defaultPrimary is Hamonym's own brand purple (--primary-color,
// #583cd6), NOT the old flat legacy gray (#333333) — a zero-saturation seed
// would make hueShift/satMul degenerate to another gray no matter the
// recipe, defeating the whole point of Classic now genuinely deriving from
// Primary. Legacy pixel-identical protection is NOT this Style's job — see
// the module doc comment above.
export const CAMPAIGN_STYLES: CampaignStyleDefinition[] = [
  {
    id: 'classic', label: 'Classic', defaultPrimary: '#583cd6',
    recipe: {
      secondary: { hueShift: 0,   satMul: 0.70, lightAdd: -0.25 },
      accent:    { hueShift: 10,  satMul: 0.90, lightAdd: -0.05 },
      bodyText:  { satMul: 0.15, light: 0.20 },
    },
  },
  {
    id: 'clean', label: 'Clean', defaultPrimary: '#2563eb',
    recipe: {
      secondary: { hueShift: 0,   satMul: 0.45, lightAdd: 0.18 },
      accent:    { hueShift: 15,  satMul: 0.55, lightAdd: 0.08 },
      bodyText:  { satMul: 0.10, light: 0.22 },
    },
  },
  {
    id: 'bold', label: 'Bold', defaultPrimary: '#7c3aed',
    recipe: {
      secondary: { hueShift: 0,   satMul: 0.85, lightAdd: -0.42 },
      accent:    { hueShift: 150, satMul: 1.00, lightAdd: 0.00 },
      bodyText:  { satMul: 0.05, light: 0.08 },
    },
  },
  {
    id: 'editorial', label: 'Editorial', defaultPrimary: '#3f3f46',
    recipe: {
      secondary: { hueShift: 0,   satMul: 0.12, lightAdd: -0.08 },
      accent:    { hueShift: 20,  satMul: 0.30, lightAdd: -0.12 },
      bodyText:  { satMul: 0.05, light: 0.16 },
    },
  },
  {
    id: 'warm', label: 'Warm', defaultPrimary: '#b45309',
    recipe: {
      secondary: { hueShift: -20, satMul: 0.65, lightAdd: -0.15 },
      accent:    { hueShift: 30,  satMul: 0.80, lightAdd: 0.05 },
      bodyText:  { satMul: 0.18, light: 0.18 },
    },
  },
  {
    id: 'vibrant', label: 'Vibrant', defaultPrimary: '#db2777',
    recipe: {
      secondary: { hueShift: 40,  satMul: 0.90, lightAdd: -0.05 },
      accent:    { hueShift: 180, satMul: 1.00, lightAdd: 0.05 }, // true complementary — deliberately high-energy contrast
      bodyText:  { satMul: 0.10, light: 0.15 },
    },
  },
  {
    id: 'nature', label: 'Nature', defaultPrimary: '#15803d',
    recipe: {
      secondary: { hueShift: -15, satMul: 0.55, lightAdd: -0.20 },
      accent:    { hueShift: 40,  satMul: 0.75, lightAdd: 0.10 },
      bodyText:  { satMul: 0.12, light: 0.18 },
    },
  },
  {
    id: 'midnight', label: 'Midnight', defaultPrimary: '#1e3a8a',
    recipe: {
      secondary: { hueShift: 0,   satMul: 0.70, lightAdd: -0.18 },
      accent:    { hueShift: 170, satMul: 0.85, lightAdd: 0.15 }, // warm pop against a deliberately dark, near-neutral secondary
      bodyText:  { satMul: 0.08, light: 0.10 },
    },
  },
];

export const CAMPAIGN_STYLE_MAP: Record<CampaignStyleId, CampaignStyleDefinition> =
  Object.fromEntries(CAMPAIGN_STYLES.map(s => [s.id, s])) as Record<CampaignStyleId, CampaignStyleDefinition>;

// ── Minimal hex<->HSL math — no external color library. Known simplification
// (flagged, not hidden): a single hueShift/satMul/lightAdd recipe does not
// equally suit every primary — a primary that's already near-black,
// near-white, or fully desaturated can clip toward flat/degenerate derived
// colors. Good enough for a first mechanism; real palette-harmony tuning
// (complementary/analogous rules, perceptual color spaces) is a follow-up,
// not part of this pass. ──
function clamp01(n: number): number { return Math.min(1, Math.max(0, n)); }

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = 60 * (((g - b) / d) % 6); break;
      case g: h = 60 * ((b - r) / d + 2); break;
      default: h = 60 * ((r - g) / d + 4); break;
    }
  }
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  s = clamp01(s); l = clamp01(l);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if      (hh < 1) { r = c; g = x; b = 0; }
  else if (hh < 2) { r = x; g = c; b = 0; }
  else if (hh < 3) { r = 0; g = c; b = x; }
  else if (hh < 4) { r = 0; g = x; b = c; }
  else if (hh < 5) { r = x; g = 0; b = c; }
  else             { r = c; g = 0; b = x; }
  const m = l - c / 2;
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// derivePalette(primary, style) is the stable abstraction the rest of the
// app depends on — its internal recipe/HSL approach can be replaced with a
// better color-harmony algorithm later without any caller changing.
export function derivePalette(
  primaryHex: string,
  style: CampaignStyleDefinition,
): { secondaryColor: string; accentColor: string; bodyTextColor: string } {
  const { h, s, l } = hexToHsl(primaryHex);
  const sec = style.recipe.secondary;
  const acc = style.recipe.accent;
  return {
    secondaryColor: hslToHex(h + sec.hueShift, s * sec.satMul, l + sec.lightAdd),
    accentColor:    hslToHex(h + acc.hueShift, s * acc.satMul, l + acc.lightAdd),
    bodyTextColor:  hslToHex(h, s * style.recipe.bodyText.satMul, style.recipe.bodyText.light),
  };
}

// Single writer for the Style-managed fields of `theme` — the only function
// in the app allowed to decide their effective value once campaignStyleId
// is set. Pure and idempotent: calling it again with the same inputs never
// drifts the result, so it's safe to call both at load (fromSnake) and on
// every live edit (CampaignStudioStateService) without tracking whether a
// given call is the "first" one.
//
// Per-field resolution: explicit override wins; otherwise primaryColor
// falls back to the Style's seed, and the other 3 are derived FROM whatever
// primary just resolved to (override or seed) — so an explicit Primary
// override still drives automatic secondary/accent/bodyText, exactly like
// picking the Style itself would. campaignStyleId undefined returns
// baseTheme completely untouched (existing/legacy campaigns keep the exact
// same object shape and values they always have).
export function resolveTheme(
  baseTheme: CampaignTheme,
  styleId: CampaignStyleId | undefined,
  overrides: Partial<Record<StyleColorField, string>> | undefined,
): CampaignTheme {
  if (!styleId) return baseTheme;
  const style = CAMPAIGN_STYLE_MAP[styleId];
  if (!style) return baseTheme; // unknown id (e.g. future rollback) — fail safe to whatever theme already holds

  const primaryColor = overrides?.primaryColor ?? style.defaultPrimary;
  const derived = derivePalette(primaryColor, style);

  return {
    ...baseTheme,
    primaryColor,
    secondaryColor: overrides?.secondaryColor ?? derived.secondaryColor,
    accentColor:    overrides?.accentColor    ?? derived.accentColor,
    bodyTextColor:  overrides?.bodyTextColor  ?? derived.bodyTextColor,
  };
}
