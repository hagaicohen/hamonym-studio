import { CardData } from '../cards/card-format';
import { clampNumber as clamp } from '../../core/campaign-style';

/**
 * The page's container (`#preview`) for a campaign and device (v4.52): its classes, its data attribute and its CSS
 * variables, as the core's `renderPreview`, `hamApplyCampaignLayout` (the panorama's variables and menu class) and
 * `hamApplyHeroStatsCard` (the card's classes) set them. Pure: a host component (the Studio's, once its shell is
 * Angular, or the platform's) can bind it. v4.53: PublicPageComponent binds it on its host (the Studio's `#preview`).
 */
export interface PreviewHost {
  className: string;
  /** `data-hero-subtitle-wrap`. */
  subtitleWrap: 'auto' | 'nowrap';
  /** CSS variables, in the order the core set them (they are kept from render to render, as before). */
  vars: [string, string][];
  /** Classes toggled after the class name was set (in this order). */
  toggles: [string, boolean][];
}

export function previewHost(campaign: CardData, device: string): PreviewHost {
  const c = campaign['content'], theme = campaign['theme'], kind = campaign['management']?.campaignKind || 'donation';
  const vars: [string, string][] = [
    ['--primary', theme.primary], ['--secondary', theme.secondary], ['--surface', theme.surface], ['--ink', theme.ink],
    ['--campaign-font', `'${theme.font || 'Heebo'}',Arial,sans-serif`]
  ];
  const toggles: [string, boolean][] = [['ham-kind-simple', kind === 'simple'], ['ham-kind-race', kind === 'race']];
  // Old `hamApplyCampaignLayout`: a desktop panorama (not the simple page) with its page body.
  if (kind !== 'simple' && device === 'desktop' && campaign['template'] === 'panorama') {
    const hero = c.hero, header = c.header;
    vars.push(
      ['--ham-pano-hero-height', clamp(hero.height, 180, 650, 255) + 'px'], ['--ham-pano-image-position', String(hero.position || 'center')],
      ['--ham-pano-logo-size', clamp(hero.logoWidth, 40, 280, 105) + 'px'], ['--ham-pano-title-size', clamp(hero.titleFontSize, 12, 100, 40) + 'px'],
      ['--ham-pano-title-weight', String(clamp(hero.titleWeight, 400, 900, 900))], ['--ham-pano-title-spacing', clamp(hero.titleLetterSpacing, -2, 8, -1) + 'px'],
      ['--ham-pano-subtitle-weight', String(clamp(hero.subtitleWeight, 400, 900, 500))], ['--ham-pano-subtitle-spacing', clamp(hero.subtitleLetterSpacing, -1, 6, 0) + 'px'],
      ['--ham-pano-subtitle-size', clamp(hero.subtitleFontSize, 10, 60, 19) + 'px'], ['--ham-pano-title-align', String(hero.titleAlign || hero.textAlign || 'right')],
      ['--ham-pano-subtitle-align', String(hero.titleAlign || hero.textAlign || 'right')], ['--ham-user-header-bg', String(header.bg || '#fff')],
      ['--ham-user-header-text', String(header.textColor || '#143b36')], ['--ham-header-height', clamp(header.height, 48, 100, 60) + 'px'],
      ['--ham-header-brand-width', clamp(header.brandWidth, 90, 230, 140) + 'px'], ['--ham-header-menu-gap', clamp(header.navGap, 0, 40, 12) + 'px'],
      ['--ham-header-menu-size', clamp(header.navFontSize, 10, 20, 13) + 'px']
    );
    toggles.push(['ham-menu-centered', header.desktopMenuAlign === 'center']);
  }
  // Old `hamApplyHeroStatsCard`.
  const settings = campaign['management']?.heroStatsCard;
  const allowed = device === 'desktop' && kind !== 'simple' && campaign['template'] === 'panorama';
  const sidebar = allowed && !settings?.enabled && settings?.sidebarStyled === true;
  toggles.push(['ham-hero-stats-enabled', allowed && (!!settings?.enabled || sidebar)], ['ham-sidebar-card-enabled', sidebar]);
  return { className: 'preview ' + device + ' layout-' + campaign['template'], subtitleWrap: c.hero.subtitleWrap === 'auto' ? 'auto' : 'nowrap', vars, toggles };
}
