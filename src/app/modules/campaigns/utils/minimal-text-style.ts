import type { CampaignDraft } from '../services/campaign-studio-state.service';
import type { ContentLang } from './content-i18n';
import { elementFont, typographyVars } from './campaign-fonts';
import { elementColor } from './element-color';

// Shared by both minimal-page renderers; absent settings retain legacy sizes.
export function minimalTextStyle(draft: CampaignDraft, lang: ContentLang, part: 'title' | 'subtitle') {
  const layout = draft.layout;
  const style = layout.minimalTextStyle;
  const title = part === 'title';
  const size = title ? style?.titleFontSize : style?.subtitleFontSize;
  const sizes = title ? { sm: 18, md: 24, lg: 32, xl: 40 } : { sm: 12, md: 14, lg: 18, xl: 22 };
  const fonts = typographyVars(draft, lang);
  return {
    'text-align': (title ? style?.titleAlign : style?.subtitleAlign) || (title ? layout.minimalHeaderTitleAlign : layout.minimalHeaderSubtitleAlign) || null,
    color: elementColor(style, lang, title ? 'titleColor' : 'subtitleColor') || (title ? layout.minimalTitleColor : layout.minimalSubtitleColor) || null,
    'font-family': elementFont(style, lang, title ? 'titleFontFamilyByLanguage' : 'subtitleFontFamilyByLanguage') || (title ? fonts.headings : fonts.subtitles),
    'font-size': size ? sizes[size] + 'px' : null,
  };
}
