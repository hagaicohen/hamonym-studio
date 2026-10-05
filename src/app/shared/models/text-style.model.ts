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
  fontWeight?: number;
}

export interface CtaConfig {
  visible: boolean;
  label:   string;
  color:   string;
  align:   TextAlign;
  icon:    string;
}
