import type { CampaignDraft } from '../services/campaign-studio-state.service';
import type { ContentLang } from './content-i18n';

// Campaign typography (bilingual roadmap D-46, D-47). The Campaign Style keeps
// its own typeface (`--hm-font-family`); a campaign may choose, per content
// language, a font for titles, subtitles, body text and buttons. Nothing chosen
// = the Style's font, so every existing campaign renders exactly as before.
//
// Fonts are referenced by id in the draft (layout.typography) and resolved to a
// CSS stack here, so a stack can be refined without migrating data. Web fonts
// come from Google Fonts (SIL Open Font License / Apache 2.0, free to use and
// embed) and are loaded on first use. System fonts (Calibri, Georgia, Arial)
// are never downloaded or bundled: they render where the visitor's device has
// them and fall back along their stack otherwise.

export type FontScript = 'he' | 'en';
export type FontRole = 'headings' | 'subtitles' | 'body' | 'buttons';
export const FONT_ROLES: readonly FontRole[] = ['headings', 'subtitles', 'body', 'buttons'];

export interface CampaignFont {
  id: string;
  name: string;
  stack: string;
  // Languages the font is offered for (a Hebrew font usually covers Latin too).
  scripts: FontScript[];
  // Google Fonts family parameter; absent for system fonts.
  google?: string;
  source: 'google' | 'system';
  // Shown in the picker for system fonts that may be missing on a device.
  noteKey?: string;
}

const g = (id: string, name: string, stack: string, scripts: FontScript[], weights = '400;500;700;800'): CampaignFont =>
  ({ id, name, stack, scripts, source: 'google', google: `${name.replace(/ /g, '+')}:wght@${weights}` });

export const CAMPAIGN_FONTS: readonly CampaignFont[] = [
  // ── Hebrew (all include Latin glyphs) ──
  g('heebo', 'Heebo', "'Heebo', sans-serif", ['he', 'en'], '300;400;500;700;800;900'),
  g('assistant', 'Assistant', "'Assistant', 'Heebo', sans-serif", ['he', 'en'], '400;500;700;800'),
  g('rubik', 'Rubik', "'Rubik', 'Heebo', sans-serif", ['he', 'en'], '400;500;700;800;900'),
  g('alef', 'Alef', "'Alef', 'Heebo', sans-serif", ['he', 'en'], '400;700'),
  g('noto-sans-hebrew', 'Noto Sans Hebrew', "'Noto Sans Hebrew', 'Heebo', sans-serif", ['he', 'en'], '400;500;700;800;900'),
  g('ibm-plex-sans-hebrew', 'IBM Plex Sans Hebrew', "'IBM Plex Sans Hebrew', 'Heebo', sans-serif", ['he', 'en'], '400;500;700'),
  g('varela-round', 'Varela Round', "'Varela Round', 'Heebo', sans-serif", ['he', 'en'], '400'),
  g('secular-one', 'Secular One', "'Secular One', 'Heebo', sans-serif", ['he', 'en'], '400'),
  g('suez-one', 'Suez One', "'Suez One', 'Frank Ruhl Libre', serif", ['he', 'en'], '400'),
  g('frank-ruhl-libre', 'Frank Ruhl Libre', "'Frank Ruhl Libre', 'Heebo', serif", ['he', 'en'], '400;500;700;900'),
  g('noto-serif-hebrew', 'Noto Serif Hebrew', "'Noto Serif Hebrew', 'Frank Ruhl Libre', serif", ['he', 'en'], '400;500;700;900'),
  g('david-libre', 'David Libre', "'David Libre', 'Frank Ruhl Libre', serif", ['he', 'en'], '400;500;700'),
  g('miriam-libre', 'Miriam Libre', "'Miriam Libre', 'Heebo', sans-serif", ['he', 'en'], '400;700'),
  g('bellefair', 'Bellefair', "'Bellefair', 'Frank Ruhl Libre', serif", ['he', 'en'], '400'),
  g('amatic-sc', 'Amatic SC', "'Amatic SC', 'Heebo', cursive", ['he', 'en'], '400;700'),
  // ── English ──
  { id: 'calibri', name: 'Calibri', stack: "Calibri, Carlito, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", scripts: ['en'], source: 'system', noteKey: 'editors.fonts.calibriNote' },
  g('inter', 'Inter', "'Inter', 'Helvetica Neue', Arial, sans-serif", ['en'], '400;500;600;700;800'),
  g('open-sans', 'Open Sans', "'Open Sans', Arial, sans-serif", ['en'], '400;500;600;700;800'),
  g('lato', 'Lato', "'Lato', Arial, sans-serif", ['en'], '400;700;900'),
  g('montserrat', 'Montserrat', "'Montserrat', Arial, sans-serif", ['en'], '400;500;600;700;800'),
  { id: 'georgia', name: 'Georgia', stack: "Georgia, 'Times New Roman', serif", scripts: ['en'], source: 'system', noteKey: 'editors.fonts.systemNote' },
  g('roboto', 'Roboto', "'Roboto', Arial, sans-serif", ['en'], '400;500;700;900'),
  g('poppins', 'Poppins', "'Poppins', Arial, sans-serif", ['en'], '400;500;600;700;800'),
  g('source-sans-3', 'Source Sans 3', "'Source Sans 3', Arial, sans-serif", ['en'], '400;600;700;800'),
  g('nunito', 'Nunito', "'Nunito', Arial, sans-serif", ['en'], '400;600;700;800'),
  g('raleway', 'Raleway', "'Raleway', Arial, sans-serif", ['en'], '400;500;600;700;800'),
  g('work-sans', 'Work Sans', "'Work Sans', Arial, sans-serif", ['en'], '400;500;600;700'),
  g('merriweather', 'Merriweather', "'Merriweather', Georgia, serif", ['en'], '400;700;900'),
  g('playfair-display', 'Playfair Display', "'Playfair Display', Georgia, serif", ['en'], '400;500;700;800'),
  g('lora', 'Lora', "'Lora', Georgia, serif", ['en'], '400;500;700'),
  { id: 'arial', name: 'Arial', stack: "Arial, 'Helvetica Neue', Helvetica, sans-serif", scripts: ['en'], source: 'system' },
];

export type LanguageTypography = Partial<Record<FontRole, string>>;
export type CampaignTypography = Partial<Record<ContentLang, LanguageTypography>>;

export function fontsFor(lang: FontScript): CampaignFont[] {
  return CAMPAIGN_FONTS.filter((f) => f.scripts.includes(lang));
}

export function fontById(id: string | undefined | null): CampaignFont | undefined {
  return id ? CAMPAIGN_FONTS.find((f) => f.id === id) : undefined;
}

// A stack's first family ("'Heebo', sans-serif" → Heebo).
function familyOf(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

export function fontByStack(stack: string | undefined | null): CampaignFont | undefined {
  if (!stack) return undefined;
  const family = familyOf(stack);
  return CAMPAIGN_FONTS.find((f) => f.name === family);
}

// Already in index.html (the four fonts the Campaign Styles use).
const PRELOADED = new Set(['Heebo', 'Frank Ruhl Libre', 'Varela Round', 'Assistant']);
const requested = new Set<string>();

// Adds the font's stylesheet once per page; a no-op for system fonts and for the
// fonts index.html already loads.
export function ensureFontLoaded(font: CampaignFont | undefined): void {
  if (!font?.google || PRELOADED.has(font.name) || requested.has(font.id)) return;
  requested.add(font.id);
  if (typeof document === 'undefined') return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  link.dataset['hmFont'] = font.id;
  document.head.appendChild(link);
}

export function ensureStackLoaded(stack: string | undefined | null): void {
  ensureFontLoaded(fontByStack(stack));
}

// CSS variables for the campaign root: one per role, null when the campaign
// keeps the Style's font for it (the variable is then not set at all).
export function typographyVars(draft: CampaignDraft, lang: ContentLang): Record<FontRole, string | null> {
  const chosen = draft.layout?.typography?.[lang] ?? {};
  const out = {} as Record<FontRole, string | null>;
  for (const role of FONT_ROLES) {
    const font = fontById(chosen[role]);
    ensureFontLoaded(font);
    out[role] = font?.stack ?? null;
  }
  // Subtitles and buttons follow the body font unless chosen separately.
  out.subtitles ??= out.body;
  out.buttons ??= out.body;
  return out;
}

export function setTypographyFont(typography: CampaignTypography | undefined, lang: ContentLang, role: FontRole, fontId: string | null): CampaignTypography {
  const next: CampaignTypography = { ...(typography ?? {}) };
  const forLang: LanguageTypography = { ...(next[lang] ?? {}) };
  if (fontId) forLang[role] = fontId; else delete forLang[role];
  if (Object.keys(forLang).length) next[lang] = forLang; else delete next[lang];
  return next;
}

export type ElementFontField = 'fontFamilyByLanguage' | 'titleFontFamilyByLanguage' | 'subtitleFontFamilyByLanguage';
export interface ElementFontStyle {
  fontFamily?: string;
  fontFamilyByLanguage?: Partial<Record<ContentLang, string>>;
  titleFontFamilyByLanguage?: Partial<Record<ContentLang, string>>;
  subtitleFontFamilyByLanguage?: Partial<Record<ContentLang, string>>;
}

export function elementFont(style: ElementFontStyle | undefined, lang: ContentLang, field: ElementFontField = 'fontFamilyByLanguage'): string | null {
  const font = style?.[field]?.[lang] ?? (field === 'fontFamilyByLanguage' ? style?.fontFamily : undefined);
  ensureStackLoaded(font);
  return font || null;
}

export function setElementFont<T extends ElementFontStyle>(style: T, lang: ContentLang, stack: string | null, field: ElementFontField = 'fontFamilyByLanguage'): T {
  const next = { ...style };
  // Preserve the other language when editing a legacy shared font.
  const legacy = field === 'fontFamilyByLanguage' && style.fontFamily ? { he: style.fontFamily, en: style.fontFamily } : {};
  const fonts = { ...legacy, ...style[field] };
  if (stack) fonts[lang] = stack; else delete fonts[lang];
  if (field === 'fontFamilyByLanguage') delete next.fontFamily;
  if (Object.keys(fonts).length) next[field] = fonts; else delete next[field];
  return next;
}
