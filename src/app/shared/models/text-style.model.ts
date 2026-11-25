export type TextAlign    = 'right' | 'center' | 'left';
export type TextFontSize = 'sm' | 'md' | 'lg' | 'xl';
export type TextPosition = 'top' | 'center' | 'bottom';

export interface TextStyle {
  align:    TextAlign;
  color:    string;
  fontSize: TextFontSize;
  position: TextPosition;
  // Optional -- added for the per-block Text Role system (Phase A, 2026-10).
  // Absent on every pre-existing TextStyle value (Hero/CTA/RichText), which
  // stay governed by the Campaign Style's own fontFamily/headingWeight via
  // normal CSS inheritance/cascade -- only an explicit Role override sets
  // these.
  fontFamily?: string;
  fontFamilyByLanguage?: Partial<Record<'he' | 'en', string>>;
  titleFontFamilyByLanguage?: Partial<Record<'he' | 'en', string>>;
  subtitleFontFamilyByLanguage?: Partial<Record<'he' | 'en', string>>;
  fontWeight?: number;
  // An exact size for a Text Role override (px). Takes precedence over the
  // sm/md/lg/xl steps, which stay readable on overrides saved before it.
  fontSizePx?: number;
  // Hero only -- separate title/subtitle styling that applies wherever the
  // text sits (above, on or below the Hero). Absent on campaigns saved
  // before 2026-11: on the Hero they fall back to color/fontSize, and
  // above/below they keep the plain page-text look, since the legacy
  // color (white by default) was only ever applied on the photo.
  titleColor?:       string;
  subtitleColor?:    string;
  // Per content language (utils/element-color.ts); the shared fields above
  // stay the value for a language without its own.
  colorByLanguage?:         Partial<Record<'he' | 'en', string>>;
  titleColorByLanguage?:    Partial<Record<'he' | 'en', string>>;
  subtitleColorByLanguage?: Partial<Record<'he' | 'en', string>>;
  titleFontSize?:    TextFontSize;
  subtitleFontSize?: TextFontSize;
  // Set by dragging the title/subtitle in the Studio canvas. Absent = the
  // shared `align` above/below the Hero, and the centered Hero copy on it.
  titleAlign?:       TextAlign;
  subtitleAlign?:    TextAlign;
}

export interface CtaConfig {
  fontFamily?: string;
  fontFamilyByLanguage?: Partial<Record<'he' | 'en', string>>;
  visible: boolean;
  label:   string;
  color:   string;
  align:   TextAlign;
  icon:    string;
}
