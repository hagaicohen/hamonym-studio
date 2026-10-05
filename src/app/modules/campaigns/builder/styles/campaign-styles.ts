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
  | 'vibrant' | 'nature' | 'midnight' | 'civic'
  | 'royal' | 'community' | 'heritage';

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

// Phase 3A (2026-09-29) — visual tokens beyond color. Deliberately small:
// only fields with a real consumer wired up this phase (see
// campaign-preview.component.ts/.css). fontFamily is real infrastructure,
// not yet real variation — see its own note on CAMPAIGN_STYLES below, font
// availability only allows one safe value right now.
export interface CampaignStyleVisualTokens {
  typography: {
    fontFamily:    string;
    headingWeight: number; // applied to Hero title + section titles only
    headingScale:  number; // multiplier on their existing clamp()/px base, kept in 0.9-1.15 -- not a free-form size
  };
  buttons: {
    radius: string; // CSS length
    weight: number;
    shadow: string; // CSS box-shadow value, or 'none'
  };
  cards: {
    radius: string;
    shadow: string;
  };
  // Phase 3B (2026-09-29) — layout PERSONALITY, not just token values. These
  // describe design intent (semantic types); the renderer translates each
  // into CSS variables/root modifier classes. See campaign-preview's own
  // CSS for exactly what each value does structurally.
  hero: {
    composition: 'centered' | 'editorial' | 'split';
  };
  // Phase A — generic Opening Composition (2026-10-01). Independent from
  // hero.composition above: hero.composition only ever styles .hm-hero
  // ITSELF (its own look when the legacy/'classic' opening renders it);
  // this controls whether .hm-hero renders at ALL, or a structured
  // .hm-opening variant replaces it entirely. This is the STYLE DEFAULT
  // only -- the actual effective value also considers an explicit
  // per-campaign override (layout.openingComposition) with higher
  // precedence; see resolveOpeningComposition's own doc comment for the
  // full chain. Deliberately NOT optional on this interface (every Style
  // declares one explicitly, just like every other visual token) -- the
  // optionality lives on the campaign-level field instead.
  opening: {
    composition: OpeningComposition;
  };
  content: {
    width: 'narrow' | 'standard' | 'wide';
  };
  section: {
    rhythm: 'balanced' | 'airy';
    // Section-presentation audit (2026-09-30) -- controls the EXISTING
    // .block-wrap:nth-child(odd/even) alternating-background mechanism
    // (campaign-preview.component.css), previously hardcoded to the same
    // white/light-gray pair for every campaign regardless of Style. 'plain'/
    // 'alternating' need no colors (resolved to shared generic constants,
    // see resolveSectionSurfaceColors) -- only 'tonal' needs surfaceColors,
    // authored per-Style like every other visual token (buttons.radius
    // etc.), never derived from theme.primaryColor. That keeps this
    // consistent with the rest of `visual`: Style owns the design language,
    // Primary is a separate, narrower brand-color slot (see StyleColorField)
    // that doesn't drive layout/surface decisions.
    surface: 'plain' | 'alternating' | 'tonal';
    surfaceColors?: { odd: string; even: string; divider: string };
  };
  donation: {
    // Deliberately a SUBSET of ConversionWidgetLayout (below) — 'split-
    // horizontal' is reachable only as an explicit user choice in the
    // Builder, never as a Style default (see resolveDonationComposition's
    // own doc comment for why).
    composition: 'classic' | 'unified' | 'hero' | 'compact';
  };
  // Section Presentation (2026-10-03) -- ONE shared recommendation per Style
  // for every list-type section (Rewards/Donors/Ambassadors/Updates), not
  // four separate per-section-type defaults. Mirrors opening.composition's
  // own "single field, same precedence chain" shape: a per-campaign explicit
  // choice (layout.sectionPresentation[section]) wins over this, which wins
  // over the legacy placement-driven fallback (see resolveSectionPresentation).
  // 'image' (Rewards' third option) is deliberately never a Style default --
  // keeps the Style-level recommendation binary/legible, same reasoning as
  // donation.composition excluding 'split-horizontal' above.
  lists: {
    presentation: 'cards' | 'list';
  };
}

export interface CampaignStyleDefinition {
  id:    CampaignStyleId;
  label: string;
  defaultPrimary: string;
  recipe: CampaignStyleRecipe;
  visual: CampaignStyleVisualTokens;
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
    visual: {
      typography: { fontFamily: "'Heebo', sans-serif", headingWeight: 800, headingScale: 1.00 },
      buttons: { radius: '10px', weight: 800, shadow: '0 2px 6px rgba(0,0,0,0.12)' },
      cards:   { radius: '10px', shadow: '0 1px 3px rgba(15,23,42,0.08)' },
      hero:    { composition: 'centered' },
      opening: { composition: 'classic' },
      content: { width: 'standard' },
      section: { rhythm: 'balanced', surface: 'alternating' },
      donation:{ composition: 'classic' },
      lists:   { presentation: 'cards' },
    },
  },
  {
    id: 'clean', label: 'Clean', defaultPrimary: '#2563eb',
    recipe: {
      secondary: { hueShift: 0,   satMul: 0.45, lightAdd: 0.18 },
      accent:    { hueShift: 15,  satMul: 0.55, lightAdd: 0.08 },
      bodyText:  { satMul: 0.10, light: 0.22 },
    },
    visual: {
      typography: { fontFamily: "'Heebo', sans-serif", headingWeight: 700, headingScale: 0.95 },
      buttons: { radius: '20px', weight: 700, shadow: 'none' },
      cards:   { radius: '16px', shadow: 'none' },
      hero:    { composition: 'centered' },
      opening: { composition: 'classic' },
      content: { width: 'wide' },
      section: { rhythm: 'airy', surface: 'alternating' },
      donation:{ composition: 'unified' },
      lists:   { presentation: 'cards' },
    },
  },
  {
    id: 'bold', label: 'Bold', defaultPrimary: '#7c3aed',
    recipe: {
      secondary: { hueShift: 0,   satMul: 0.85, lightAdd: -0.42 },
      accent:    { hueShift: 150, satMul: 1.00, lightAdd: 0.00 },
      bodyText:  { satMul: 0.05, light: 0.08 },
    },
    visual: {
      typography: { fontFamily: "'Heebo', sans-serif", headingWeight: 900, headingScale: 1.10 },
      buttons: { radius: '6px', weight: 900, shadow: '0 6px 16px rgba(0,0,0,0.25)' },
      cards:   { radius: '6px', shadow: '0 8px 20px rgba(0,0,0,0.18)' },
      hero:    { composition: 'centered' },
      opening: { composition: 'classic' },
      content: { width: 'wide' },
      section: { rhythm: 'balanced', surface: 'alternating' },
      donation:{ composition: 'hero' },
      lists:   { presentation: 'cards' },
    },
  },
  {
    id: 'editorial', label: 'Editorial', defaultPrimary: '#3f3f46',
    recipe: {
      secondary: { hueShift: 0,   satMul: 0.12, lightAdd: -0.08 },
      accent:    { hueShift: 20,  satMul: 0.30, lightAdd: -0.12 },
      bodyText:  { satMul: 0.05, light: 0.16 },
    },
    // No serif dependency (explicitly out of scope, and a Latin serif
    // wouldn't render for Hebrew glyphs anyway -- see fontFamily's own
    // note above). Restraint comes from lighter weight + tighter radius +
    // no shadow instead.
    visual: {
      typography: { fontFamily: "'Heebo', sans-serif", headingWeight: 500, headingScale: 0.95 },
      buttons: { radius: '4px', weight: 700, shadow: 'none' },
      cards:   { radius: '4px', shadow: 'none' },
      hero:    { composition: 'editorial' },
      opening: { composition: 'classic' },
      content: { width: 'narrow' },
      // 'plain' (not 'alternating') -- consistent with Editorial's already-
      // established minimal/quiet character (airy rhythm, no button/card
      // shadows) -- the gray alternating band reads as visual noise against
      // a style whose whole point is restraint. Zero-risk choice: 'plain'
      // is just as generic/neutral as 'alternating', never Style-authored.
      section: { rhythm: 'airy', surface: 'plain' },
      donation:{ composition: 'classic' },
      // 'list' -- consistent with Editorial's restraint (airy rhythm, 'plain'
      // surface, no shadows): clean rows read quieter than a card grid, which
      // is exactly this Style's whole point.
      lists:   { presentation: 'list' },
    },
  },
  {
    id: 'warm', label: 'Warm', defaultPrimary: '#b45309',
    recipe: {
      secondary: { hueShift: -20, satMul: 0.65, lightAdd: -0.15 },
      accent:    { hueShift: 30,  satMul: 0.80, lightAdd: 0.05 },
      bodyText:  { satMul: 0.18, light: 0.18 },
    },
    visual: {
      typography: { fontFamily: "'Heebo', sans-serif", headingWeight: 700, headingScale: 1.00 },
      buttons: { radius: '18px', weight: 800, shadow: '0 4px 12px rgba(0,0,0,0.10)' },
      cards:   { radius: '14px', shadow: '0 2px 8px rgba(0,0,0,0.08)' },
      hero:    { composition: 'centered' },
      opening: { composition: 'classic' },
      content: { width: 'standard' },
      section: { rhythm: 'airy', surface: 'alternating' },
      donation:{ composition: 'unified' },
      lists:   { presentation: 'cards' },
    },
  },
  {
    id: 'vibrant', label: 'Vibrant', defaultPrimary: '#db2777',
    recipe: {
      secondary: { hueShift: 40,  satMul: 0.90, lightAdd: -0.05 },
      accent:    { hueShift: 180, satMul: 1.00, lightAdd: 0.05 }, // true complementary — deliberately high-energy contrast
      bodyText:  { satMul: 0.10, light: 0.15 },
    },
    visual: {
      typography: { fontFamily: "'Heebo', sans-serif", headingWeight: 900, headingScale: 1.10 },
      buttons: { radius: '22px', weight: 800, shadow: '0 6px 18px rgba(0,0,0,0.20)' },
      cards:   { radius: '18px', shadow: '0 8px 22px rgba(0,0,0,0.16)' },
      hero:    { composition: 'split' },
      // The one Style keeping its existing default from the prototype phase
      // -- Fundraising Split is now a genuinely generic composition any
      // Style could use (see resolveOpeningComposition), Vibrant just
      // happens to be where it was first validated and stays the default.
      opening: { composition: 'fundraising-split' },
      content: { width: 'wide' },
      section: { rhythm: 'balanced', surface: 'alternating' },
      donation:{ composition: 'hero' },
      // Confirmed product example (2026-10-03): Vibrant recommends bold cards.
      lists:   { presentation: 'cards' },
    },
  },
  {
    id: 'nature', label: 'Nature', defaultPrimary: '#15803d',
    recipe: {
      secondary: { hueShift: -15, satMul: 0.55, lightAdd: -0.20 },
      accent:    { hueShift: 40,  satMul: 0.75, lightAdd: 0.10 },
      bodyText:  { satMul: 0.12, light: 0.18 },
    },
    visual: {
      typography: { fontFamily: "'Heebo', sans-serif", headingWeight: 700, headingScale: 1.00 },
      buttons: { radius: '14px', weight: 700, shadow: '0 2px 8px rgba(0,0,0,0.08)' },
      cards:   { radius: '16px', shadow: '0 2px 10px rgba(0,0,0,0.07)' },
      hero:    { composition: 'centered' },
      opening: { composition: 'classic' },
      content: { width: 'standard' },
      section: { rhythm: 'airy', surface: 'alternating' },
      donation:{ composition: 'unified' },
      lists:   { presentation: 'cards' },
    },
  },
  {
    id: 'midnight', label: 'Midnight', defaultPrimary: '#1e3a8a',
    recipe: {
      secondary: { hueShift: 0,   satMul: 0.70, lightAdd: -0.18 },
      accent:    { hueShift: 170, satMul: 0.85, lightAdd: 0.15 }, // warm pop against a deliberately dark, near-neutral secondary
      bodyText:  { satMul: 0.08, light: 0.10 },
    },
    visual: {
      typography: { fontFamily: "'Heebo', sans-serif", headingWeight: 900, headingScale: 1.05 },
      buttons: { radius: '10px', weight: 800, shadow: '0 10px 24px rgba(0,0,0,0.35)' },
      cards:   { radius: '8px', shadow: '0 12px 28px rgba(0,0,0,0.30)' },
      hero:    { composition: 'split' },
      opening: { composition: 'classic' },
      content: { width: 'standard' },
      // 'tonal' -- the one deliberate example this phase (audit finding:
      // don't derive tonal from theme.primaryColor, author it explicitly
      // per Style instead). A cool, faint blue-tinted wash on 'even'
      // sections instead of the neutral gray every other Style uses,
      // fitting Midnight's already-dark/cool identity. Deliberately NOT a
      // literal dark background swap -- .block-wrap content (rich-text,
      // headings) assumes dark text on a light surface everywhere else in
      // this file, so a truly dark tonal surface would break legibility.
      // This stays light enough to read as "the same page, subtly tinted."
      section: {
        rhythm: 'balanced',
        surface: 'tonal',
        surfaceColors: { odd: '#ffffff', even: '#eef1f8', divider: '#dde4f0' },
      },
      donation:{ composition: 'hero' },
      lists:   { presentation: 'cards' },
    },
  },
  {
    // Civic (2026-09-30) -- 9th Style, institutional/trustworthy personality
    // (deep navy + institutional blue + restrained gold accent), built
    // entirely through the existing generic token system -- no Civic-
    // specific selector/DOM branch anywhere. defaultPrimary IS the
    // "institutional blue" itself (not navy) because Primary drives the
    // donate/CTA button family everywhere in the renderer; secondary's
    // large negative lightAdd derives the deep navy FROM that same blue
    // (same hue family, just darker -- verified non-degenerate: resolves to
    // a real dark navy, not clipped black, unlike the near-black failure
    // Midnight's first attempt hit). accent's large hueShift (blue ~205deg
    // -> gold ~50deg) derives the restrained gold from the SAME primary,
    // never a second unrelated seed color -- one root input, same product
    // model as every other Style.
    id: 'civic', label: 'Civic', defaultPrimary: '#1F5D88',
    recipe: {
      secondary: { hueShift: 0,    satMul: 0.85, lightAdd: -0.20 },
      accent:    { hueShift: -155, satMul: 1.05, lightAdd: 0.15 },
      bodyText:  { satMul: 0.10,  light: 0.14 },
    },
    visual: {
      typography: { fontFamily: "'Heebo', sans-serif", headingWeight: 800, headingScale: 1.02 },
      buttons: { radius: '10px', weight: 800, shadow: '0 4px 14px rgba(16,24,32,0.18)' },
      cards:   { radius: '12px', shadow: '0 2px 10px rgba(16,24,32,0.08)' },
      hero:    { composition: 'split' },
      // Phase A (2026-10-01) -- Fundraising Split is now a genuinely generic
      // composition (see resolveOpeningComposition), but Civic's own DEFAULT
      // stays 'classic' here by explicit product decision, not a technical
      // limitation anymore -- Civic + Fundraising Split is fully supported,
      // a manager can choose it explicitly from the Builder's Opening
      // selector any time; this is only what Civic recommends by default.
      opening: { composition: 'classic' },
      content: { width: 'standard' },
      // 'tonal' -- deliberately LIGHT (white / very light cool blue), same
      // reasoning as Midnight's own tonal choice: this is a surface tint,
      // not a dark-mode background swap. Distinct hue from Midnight's own
      // tonal pair (more blue/teal-leaning here vs Midnight's indigo-leaning)
      // so the two dark-adjacent Styles don't converge on an identical feel.
      section: {
        rhythm: 'balanced',
        surface: 'tonal',
        surfaceColors: { odd: '#ffffff', even: '#eaf1f6', divider: '#d2e1ea' },
      },
      // 'hero' -- merges stats+donation into one bold gradient card
      // (primary->secondary, i.e. institutional-blue->navy here), donate
      // button inverts to white-on-primary -- strong, structured fundraising
      // emphasis without any playful/loud treatment, matching the brief.
      donation:{ composition: 'hero' },
      // Confirmed product example (2026-10-03): Civic recommends restrained,
      // institutional rows over a loud card grid.
      lists:   { presentation: 'list' },
    },
  },
  // Royal / Community / Heritage (2026-10-06) -- 10th-12th Styles, the first
  // to give fontFamily a genuine per-Style value instead of every Style
  // sharing the same Heebo literal (see CampaignStyleVisualTokens.typography
  // 's own "real infrastructure, not yet real variation" note above, now
  // partially resolved). Each font is loaded via a real <link> in
  // index.html (Frank Ruhl Libre / Varela Round / Assistant, alongside the
  // existing Heebo one), confirmed to have genuine Hebrew subsets on Google
  // Fonts -- not just a Latin font with an untested Hebrew fallback. The 9
  // existing Styles above deliberately keep their literal "'Heebo', sans-
  // serif" value unchanged -- retroactively changing a live campaign's font
  // is a real, visible change this task was never asked to make.
  {
    // Royal (גאלה) -- elegant/formal, for galas and high-end fundraising.
    // defaultPrimary is a deep burgundy; secondary/accent derive a warm gold
    // FROM it (same one-root-input model as every other Style), not a
    // second unrelated seed color.
    id: 'royal', label: 'Royal', defaultPrimary: '#7A1F3D',
    recipe: {
      secondary: { hueShift: 60,  satMul: 0.70, lightAdd: 0.30 },
      accent:    { hueShift: 52,  satMul: 1.00, lightAdd: 0.15 },
      bodyText:  { satMul: 0.12, light: 0.18 },
    },
    visual: {
      // Frank Ruhl Libre -- the classic Hebrew serif, genuinely loaded (see
      // index.html); Heebo is the fallback if the webfont fails to load,
      // same convention as every other Style's fontFamily value.
      typography: { fontFamily: "'Frank Ruhl Libre', 'Heebo', serif", headingWeight: 700, headingScale: 1.05 },
      buttons: { radius: '8px', weight: 700, shadow: '0 4px 14px rgba(122,31,61,0.18)' },
      cards:   { radius: '12px', shadow: '0 2px 10px rgba(122,31,61,0.10)' },
      hero:    { composition: 'centered' },
      opening: { composition: 'classic' },
      content: { width: 'standard' },
      // 'tonal' -- a faint warm blush wash, distinct hue from Midnight/
      // Civic's cool blue-leaning tonal pairs and from Heritage's own
      // golden-cream pair below.
      section: {
        rhythm: 'airy',
        surface: 'tonal',
        surfaceColors: { odd: '#ffffff', even: '#faf3f0', divider: '#eadfd8' },
      },
      donation:{ composition: 'classic' },
      lists:   { presentation: 'list' },
    },
  },
  {
    // Community (קהילתי) -- warm/friendly/grassroots, for local campaigns.
    // defaultPrimary is a warm coral; secondary derives a friendly teal FROM
    // it, accent a sunny yellow -- same one-root-input model.
    id: 'community', label: 'Community', defaultPrimary: '#EF6351',
    recipe: {
      secondary: { hueShift: 172, satMul: 0.80, lightAdd: -0.02 },
      accent:    { hueShift: 38,  satMul: 0.90, lightAdd: 0.10 },
      bodyText:  { satMul: 0.12, light: 0.20 },
    },
    visual: {
      // Varela Round -- soft/rounded, genuinely loaded (see index.html);
      // Heebo is the fallback if the webfont fails to load.
      typography: { fontFamily: "'Varela Round', 'Heebo', sans-serif", headingWeight: 700, headingScale: 1.00 },
      buttons: { radius: '24px', weight: 700, shadow: '0 6px 16px rgba(239,99,81,0.20)' },
      cards:   { radius: '20px', shadow: '0 4px 14px rgba(0,0,0,0.08)' },
      hero:    { composition: 'centered' },
      opening: { composition: 'classic' },
      content: { width: 'standard' },
      section: { rhythm: 'airy', surface: 'alternating' },
      donation:{ composition: 'unified' },
      // Confirmed product example (per product decision 2026-10-06):
      // Community recommends friendly, visual cards over restrained rows.
      lists:   { presentation: 'cards' },
    },
  },
  {
    // Heritage (מורשת) -- traditional/dignified, for religious/heritage
    // organizations. defaultPrimary is a deep traditional navy (distinct
    // from Civic's brighter institutional blue); secondary derives an even
    // deeper navy for headings, accent a warm/rich gold -- different hue
    // shift and higher saturation/lightness than Civic's own restrained
    // gold, so the two institutional-feeling Styles don't converge.
    id: 'heritage', label: 'Heritage', defaultPrimary: '#1C3D5A',
    recipe: {
      secondary: { hueShift: 0,    satMul: 0.80, lightAdd: -0.12 },
      accent:    { hueShift: -165, satMul: 1.10, lightAdd: 0.22 },
      bodyText:  { satMul: 0.12,  light: 0.14 },
    },
    visual: {
      // Assistant -- a dignified, humanist Hebrew sans (genuinely loaded,
      // see index.html), not a second serif -- keeps Heritage distinct from
      // Royal's Frank Ruhl Libre at the font level too, not just palette.
      typography: { fontFamily: "'Assistant', 'Heebo', sans-serif", headingWeight: 800, headingScale: 1.00 },
      buttons: { radius: '6px', weight: 800, shadow: '0 4px 12px rgba(20,40,60,0.20)' },
      cards:   { radius: '8px', shadow: '0 2px 10px rgba(20,40,60,0.10)' },
      hero:    { composition: 'centered' },
      opening: { composition: 'classic' },
      content: { width: 'standard' },
      // 'tonal' -- a warm golden-cream wash, distinct hue from Civic's cool
      // blue-tinted pair and from Royal's blush-pink pair above.
      section: {
        rhythm: 'balanced',
        surface: 'tonal',
        surfaceColors: { odd: '#ffffff', even: '#f7f1e6', divider: '#e8dcc4' },
      },
      donation:{ composition: 'classic' },
      lists:   { presentation: 'list' },
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

// Phase 3A (2026-09-29) — visual tokens have no per-field user override in
// this phase (Style owns them outright, see the phase's own product
// decision), so unlike resolveTheme this is a direct lookup, not a merge.
// campaignStyleId undefined -> undefined -> every consumer's own CSS
// var(--hm-x, <legacy-literal>) fallback applies, unchanged from today.
export function resolveVisualTokens(styleId: CampaignStyleId | undefined): CampaignStyleVisualTokens | undefined {
  if (!styleId) return undefined;
  return CAMPAIGN_STYLE_MAP[styleId]?.visual;
}

// Section-presentation audit (2026-09-30). CampaignLayout.sectionBgOdd/
// sectionBgEven/sectionDividerColor are mandatory (non-optional) fields,
// unlike conversionWidgetLayout -- every draft-creation path always
// initializes them to these exact literals, and no template/UI has ever
// set anything else (verified by full-repo search). So unlike the optional-
// field pattern elsewhere, "never touched" here is detected by exact
// equality against the known legacy literal, not by undefined -- there is
// no other value these fields have ever held in a real campaign. A
// genuinely different value (e.g. from a future UI) still wins outright.
const LEGACY_SECTION_SURFACE = { odd: '#ffffff', even: '#f8fafc', divider: '#e2e8f0' } as const;
// 'plain' has no per-Style authored colors -- it's the same flat-white
// choice for every Style that picks it, same as 'alternating' reusing the
// legacy pair verbatim for every Style that picks it (see CAMPAIGN_STYLES:
// most Styles use 'alternating' precisely so they render identically to
// today, and only Midnight currently defines a real 'tonal' surfaceColors).
const PLAIN_SECTION_SURFACE = { odd: '#ffffff', even: '#ffffff', divider: LEGACY_SECTION_SURFACE.divider } as const;

export function resolveSectionSurfaceColors(
  styleId: CampaignStyleId | undefined,
  explicit: { odd: string; even: string; divider: string },
): { odd: string; even: string; divider: string } {
  const style = styleId ? CAMPAIGN_STYLE_MAP[styleId] : undefined;
  const styleColors = style
    ? style.visual.section.surface === 'tonal'
      ? (style.visual.section.surfaceColors ?? LEGACY_SECTION_SURFACE)
      : style.visual.section.surface === 'plain'
        ? PLAIN_SECTION_SURFACE
        : LEGACY_SECTION_SURFACE
    : undefined;

  return {
    odd:     explicit.odd     !== LEGACY_SECTION_SURFACE.odd     ? explicit.odd     : (styleColors?.odd     ?? LEGACY_SECTION_SURFACE.odd),
    even:    explicit.even    !== LEGACY_SECTION_SURFACE.even    ? explicit.even    : (styleColors?.even    ?? LEGACY_SECTION_SURFACE.even),
    divider: explicit.divider !== LEGACY_SECTION_SURFACE.divider ? explicit.divider : (styleColors?.divider ?? LEGACY_SECTION_SURFACE.divider),
  };
}

// Matches CampaignLayout.conversionWidgetLayout's own literal union exactly
// (campaign-studio-state.service.ts) -- declared again here rather than
// imported, so this file (already imported BY that service) never needs a
// circular reference just for one type name.
export type ConversionWidgetLayout = 'classic' | 'unified' | 'compact' | 'hero' | 'split-horizontal';

// Render-time resolution ONLY -- verified in the actual code before this was
// approved (2026-09-29): conversionWidgetLayout is optional, no template or
// createInitialDraft()/applyTemplate() ever populates it, and the ONLY way
// it ever gets a concrete value (including the literal 'classic') is the
// manager clicking one of the 5 buttons in campaign-page-builder-step,
// which always calls setConversionWidgetLayout(...) with a real value. So:
// explicit (any concrete value, 'classic' included) always wins permanently
// -- this function must NEVER be used to write back into
// draft.layout.conversionWidgetLayout, only to compute what CSS class to
// apply for THIS render. 'split-horizontal' is deliberately not a Style
// default (see CampaignStyleVisualTokens.donation's own comment) but still
// wins normally when explicitly chosen, since it's just another concrete value.
export function resolveDonationComposition(
  explicit: ConversionWidgetLayout | undefined,
  styleId: CampaignStyleId | undefined,
): ConversionWidgetLayout {
  if (explicit) return explicit;
  const style = styleId ? CAMPAIGN_STYLE_MAP[styleId] : undefined;
  return style?.visual.donation.composition ?? 'classic';
}

// Opening Composition — Phase A, generic (2026-10-01). Supersedes the
// prototype's hardcoded styleId==='vibrant' special case: ANY Style can now
// resolve to ANY of the three compositions, and the campaign itself can
// explicitly override its Style's default -- the exact precedence chain
// already proven for donation.composition above (explicit -> Style default
// -> legacy fallback). hero.composition remains untouched and serves a
// different purpose: it styles .hm-hero ITSELF for whichever campaigns
// still resolve to the 'classic' opening (i.e. .hm-hero actually renders).
export type OpeningComposition = 'classic' | 'story-first' | 'fundraising-split';

// explicit is read from draft.layout.openingComposition (optional field,
// never populated by any template/createInitialDraft -- same "undefined
// genuinely means never touched" guarantee conversionWidgetLayout already
// has, confirmed by the same kind of full-repo check before adding it).
// This function must never be used to WRITE a Style's default back into
// layout.openingComposition -- only to compute the effective value for
// THIS render, so switching Campaign Style later keeps auto-updating the
// effective composition for every campaign that never explicitly chose one.
export function resolveOpeningComposition(
  explicit: OpeningComposition | undefined,
  styleId: CampaignStyleId | undefined,
): OpeningComposition {
  if (explicit) return explicit;
  const style = styleId ? CAMPAIGN_STYLE_MAP[styleId] : undefined;
  return style?.visual.opening.composition ?? 'classic';
}

// Section Presentation (2026-10-03) — a THIRD axis alongside Campaign Style
// (how the campaign looks) and Opening Composition (how it opens): how each
// list-type content section displays, independent of WHERE it sits
// (layout.sidebarSections — a completely separate, pre-existing axis). Before
// this, placement and presentation were accidentally fused: every section's
// template picked both at once via the same `inSidebarSection(...)` branch,
// so "sidebar" always meant a compact list and "main content" always meant
// cards, with no way to choose e.g. a clean list in the main column. See
// docs/DECISIONS.md for the full product writeup (audit -> this phase).
//
// Deliberately only TWO values at the Style/shared level ('cards' | 'list')
// across all four sections — matches the product decision to unify under one
// concept instead of four section-specific APIs (rewardLayout/ambassadorView/
// donorViewMode/updatesDisplayMode), and to resist the temptation to ship
// every possible variant (podium/timeline) before the simple 2-axis model
// has even shipped once. 'image' exists ONLY as a per-campaign explicit
// choice for rewards (its existing third card variant) — never a Style
// default, same reasoning as donation.composition excluding
// 'split-horizontal'.
export type SectionPresentation = 'cards' | 'list' | 'image';
export type PresentableSection = 'rewards' | 'donors' | 'ambassadors' | 'updates';

// explicit is read from draft.layout.sectionPresentation?.[section] (optional
// per-section map, never populated by any template/createInitialDraft — same
// "undefined genuinely means never touched" guarantee every other field in
// this precedence chain already has).
//
// Placement-aware recommendation (2026-10-06) — the recommendation is
// SECTION + PLACEMENT + STYLE, not Style alone. Previously `inSidebar` was
// only ever consulted as the very last fallback (no Style set at all), so a
// Style that recommends 'cards' kept recommending cards even in the sidebar,
// and — more importantly — an explicit per-campaign choice made in ONE
// placement kept winning after the manager moved the section to the OTHER
// placement (e.g. "Cards" explicitly picked for Ambassadors in the main
// column would still show in the sidebar, where List is the compact
// recommendation everyone actually wants). The fix has two parts:
//   1. Here: the sidebar recommendation is ALWAYS 'list', full stop — Style
//      only ever shapes the MAIN-content recommendation. This is "Sidebar =
//      compact, Main = Style's richer call" as a real rule, not a fallback.
//   2. In CampaignStudioStateService#setSidebarSection: an explicit
//      sectionPresentation override is CLEARED whenever the manager actually
//      changes a section's placement, so this function naturally falls
//      through to the new placement's recommendation instead of carrying a
//      stale explicit value across the placement change. A later explicit
//      choice the manager makes in the NEW placement is a fresh override,
//      kept until the NEXT placement change clears it again.
// This function itself stays a pure read -- it never writes `explicit` back,
// so switching Campaign Style (or, now, placement) keeps auto-updating the
// effective recommendation for every campaign that hasn't explicitly
// overridden it for its current context.
export function resolveSectionPresentation(
  section: PresentableSection,
  explicit: Partial<Record<PresentableSection, SectionPresentation>> | undefined,
  styleId: CampaignStyleId | undefined,
  inSidebar: boolean,
): SectionPresentation {
  const own = explicit?.[section];
  if (own) return own;
  if (inSidebar) return 'list';
  const style = styleId ? CAMPAIGN_STYLE_MAP[styleId] : undefined;
  return style?.visual.lists.presentation ?? 'cards';
}
