export type TextAlign    = 'right' | 'center' | 'left';
export type TextFontSize = 'sm' | 'md' | 'lg' | 'xl';
export type TextPosition = 'top' | 'center' | 'bottom';

export interface TextStyle {
  align:    TextAlign;
  color:    string;
  fontSize: TextFontSize;
  position: TextPosition;
}

export interface CtaConfig {
  visible: boolean;
  label:   string;
  color:   string;
  align:   TextAlign;
  icon:    string;
}
