import { STUDIO_PUBLIC_ACTIONS } from '../../../studio-public-actions';
import { ChangeDetectionStrategy, Component, Input, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { CardData } from '../cards/card-format';
import { HEADER_LINKS, HEADER_TARGETS } from './page-layout';
import { PagePart } from './page-part';
import { CampaignAccountComponent, CampaignAccountUser } from '../../public-header/campaign-account.component';
import { CampaignHeaderCtasComponent } from '../../public-header/campaign-header-ctas.component';
import { CartHeaderButtonComponent } from '../../cart/cart-header-button.component';
import { CampaignCartService } from '../../cart/campaign-cart.service';

/** Labels of the header menu → the block each opens (old core `hamSyncHamburgerNavigation`). */
const MENU_TARGETS: Record<string, string> = { 'סיפור': 'story', 'הסיפור': 'story', 'סיפור הקמפיין': 'story', 'תשורות': 'rewards', 'תורמים': 'donors', 'שגרירים': 'ambassadors', 'תגובות': 'comments', 'עדכונים': 'updates', 'חסויות': 'sponsors', 'שותפים': 'sponsors' };
/** Blocks the hamburger menu always offers, when shown and not in the manager's list. */
const MENU_ADDITIONS: [string, string][] = [['story', 'סיפור'], ['rewards', 'תשורות'], ['donors', 'תורמים'], ['ambassadors', 'שגרירים'], ['comments', 'תגובות'], ['updates', 'עדכונים']];

interface MenuLink { label: string; index: number | null; target: string; }

/**
 * The page header (old core `renderPreview`, part `header`, with `hamSyncHamburgerNavigation`): the
 * fixed HAMONYM logo, the desktop menu links (`[data-menu-item]`), the ambassadors action and the
 * hamburger, and the hamburger's dropdown, whose links open the campaign's blocks (`[data-nav-target]`,
 * handled by the preview's navigation). The dropdown is rendered as the old code left it after the
 * render: links to unknown or hidden blocks and repeats dropped, the missing blocks added after the
 * ambassadors action.
 */
@Component({
  selector: 'section[ham-header-part]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CampaignAccountComponent, CampaignHeaderCtasComponent, CartHeaderButtonComponent],
  host: { '[attr.class]': 'parts.partClass("header", cls)', 'data-part': 'header' },
  template: `<div class="campaign-header" [attr.style]="'background:' + text(h['bg']) + ';color:' + text(h['textColor'])"><div class="campaign-logo fixed-hamonym-logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="-7.939 -5.108 258 80" role="img" aria-label="המונים"><g fill="#414042"><path d="M28.784 55.547H0V3.436h17.866c6.75 0 10.918 4.27 10.918 11.02v41.091zM17.568 47.012V15.348c0-2.283-1.092-3.375-3.176-3.375h-3.177v35.039h6.353z"/><path d="M46.946 33.016H35.73V3.436h11.216v29.58z"/><path d="M67.988 55.547H52.404v-8.535h4.367V11.973h-4.169V3.436h15.386v52.111z"/><path d="M86.149 55.547H74.934V3.436H86.15v52.111z"/><path d="M121.78 55.547h-14.293v-8.535h3.076V13.957c0-1.488-.694-2.184-2.184-2.084-.298 0-.694 0-1.19.1h-.795l-3.871 43.574H91.605l4.069-43.574h-4.367V3.436h20.745c6.452 0 9.728 3.277 9.728 9.828v42.283z"/><path d="M156.82 55.547h-11.216V11.973h-17.072V3.436h28.288v52.111zm-17.072 0h-11.216V19.615h11.216v35.932z"/></g><path d="m233.66 45.334-3.731-3.275-2.302-2.021-1.606-1.41c-.851 2.839-1.696 5.679-2.518 8.526-3.313-.003-6.693 2.057-7.785 5.446l-.552 1.723-1.039 3.223-.939 2.918-1.521 4.727c-.398 1.232.186 2.76 1.16 3.568.42.348.903.577 1.449.452.5-.114.951-.377 1.419-.568.357-.146.618-.198.903.095.344.352.613.767.979 1.104.421.387 1.01.77 1.612.696.558-.069 1.029-.421 1.556-.609 1.211-.439 1.552.974 2.292 1.595.431.355.913.482 1.449.348.502-.123.956-.363 1.429-.564.304-.135.709-.338 1.028-.138.325.212.493.63.783.892.963.87 2.235.729 3.2-.038.546-.435 1.029-1.031 1.248-1.699l.982-3.056c.58.988 1.76.257 2.314-.353.768-.839 1.267-1.911 1.681-2.958.892-2.258 1.227-4.729.813-7.134-.116-.658-.286-1.304-.522-1.931.034.004.069.004.104.008-.542-1.276-1.352-2.525-2.489-3.603 0 0 .102-.354.282-.991.264-.926.701-2.447 1.25-4.34-1.023.217-2.198.007-2.929-.633" fill="#ED1C24"/><path d="m222.23 20.625-2.689 1.471-2.411 1.313c2.793 2.34 4.681 3.896 4.681 3.896-1.319 3.039-.772 6.959 1.904 9.303l2.299 2.021 1.609 1.408 2.302 2.021 3.731 3.275c.993.869 2.652.93 3.789.326.518-.277.876-.65.959-1.239.063-.471.014-.946.023-1.421.011-.403.079-.651.48-.797.592-.214 1.205-.316 1.75-.649.526-.317.905-.74.961-1.362.042-.474-.05-.952.003-1.424.141-1.215 1.721-.943 2.52-1.442.959-.593.78-1.72.786-2.691.003-.317-.014-.735.282-.938.297-.211.725-.201 1.06-.339 1.072-.442 1.568-1.505 1.388-2.612-.127-.801-.524-1.646-1.142-2.189l-3.224-2.83c.951-.116 1.192-1.266.991-2.043-.319-1.234-1.378-2.193-2.366-2.921-1.596-1.163-3.316-2.181-5.224-2.733-2.143-.619-4.426-.559-6.49.32 0 0-.844-.686-2.225-1.822-.275.732-.765 1.38-1.392 1.724l-4.355 2.374z" fill="#FBB03B"/><path d="m192.83 18.84 1.41 4.76.87 2.939.672 2.278c5.516-3.138 9.807-5.652 9.807-5.652 2.4 2.286 6.27 3.12 9.392 1.417l2.154-1.174 2.411-1.313 2.689-1.471 4.356-2.376c1.201-.656 1.849-2.296 1.583-3.607-.116-.581-.385-.964-.916-1.22-.451-.215-.945-.32-1.397-.534-.363-.169-.413-.414-.395-.796.026-.523.093-1.041.016-1.566-.079-.547-.29-1.115-.774-1.414-.415-.253-.9-.336-1.344-.515-.406-.161-.726-.423-.781-.879-.054-.466.104-.935.135-1.396.037-.503-.048-1.093-.425-1.46-.365-.36-.892-.533-1.364-.7-.372-.13-.895-.237-1.174-.54-.213-.23-.127-.584-.094-.862.135-1.015-.342-2.056-1.306-2.479-.935-.41-2.19-.369-3.091.123l-3.29 1.795c-.053-.467-.298-.934-.669-1.224-.799-.627-1.949-.356-2.814-.026-1.32.494-2.505 1.31-3.67 2.078-.929.615-1.854 1.262-2.655 2.035-.757.734-1.364 1.601-1.705 2.607-.488 1.447-.473 3.031-.393 4.536 0 0-3.683 2.196-8.543 4.97.618.421 1.112 1.013 1.305 1.666" fill="#A9C832"/><path d="m189.27 48.183 3.063.074 3.462.087c-1.477-4.623-2.57-7.934-2.57-7.934 2.743-1.869 4.368-5.477 3.356-8.887l-.803-2.706-.672-2.278-.87-2.939-1.41-4.76c-.388-1.3-1.829-2.27-3.157-2.305-.581-.016-1.033.148-1.396.609-.319.399-.526.873-.836 1.278-.237.313-.468.331-.831.237-.471-.121-.925-.289-1.413-.341-.54-.059-1.185-.021-1.607.358-.388.35-.58.854-.865 1.283-.255.379-.586.643-1.068.586-.445-.055-.854-.289-1.286-.416-.468-.142-1.05-.191-1.487.074-.436.263-.723.742-.979 1.162-.216.352-.431.832-.78 1.072-.262.178-.588.038-.85-.059-.992-.357-2.136-.123-2.76.77-.582.824-.797 2.051-.511 3.023l.202.673.077.263c-.623-.291-1.369-.148-1.746.449-.112.18-.187.38-.24.586-.161.637-.119 1.326-.034 1.973.146 1.128.465 2.227.82 3.301.433 1.299.929 2.588 1.546 3.811.794 1.56 1.818 3.023 3.16 4.162 1.304 1.105 2.878 1.844 4.566 2.115 0 0 .655 1.932 1.614 4.879.434-.216.895-.337 1.341-.326l4.964.126z" fill="#00C0F3"/><path d="m193.66 72.219c1.852-.359 3.71-.553 5.483-1.236 2.18-.838 4.025-2.319 5.096-4.417 0 0 3.042-.042 7.345-.034-.075-.464-.059-.926.074-1.342l1.521-4.727.939-2.918 1.039-3.223c-5.805-.033-10.209-.008-10.209-.008-.933-3.182-3.868-5.839-7.425-5.928l-1.734-.043-3.46-.083-3.064-.078-4.966-.124c-1.298-.033-2.6.963-3.099 2.129-.212.504-.289 1.037-.013 1.525.26.45.648.811.966 1.221.23.297.327.526.133.867-.223.393-.512.741-.725 1.145-.25.479-.473 1.109-.329 1.65.148.55.621.938.973 1.357.315.377.504.801.275 1.273-.204.426-.571.758-.831 1.147-.276.424-.473.979-.313 1.479.159.491.531.901.861 1.283.246.287.649.646.708 1.043.053.332-.258.614-.433.858-.715.995-.547 2.285.332 3.109.621.582 1.513 1.011 2.374 1.029l3.939.1c-.365.392-.308 1.041-.117 1.497.234.559.705.979 1.244 1.232 1.056.502 2.303.433 3.416.217 1.886-.369-1.888.365 0 0" fill="#9E005D"/></svg><span class="hamonym-tagline">גיוס כספים למטרות טובות</span></div><div class="header-controls">@if (desktopLinks) {<nav class="header-desktop-nav" [class.header-nav-pills]="h['desktopNavStyle'] === 'pills'" [class.header-nav-links]="h['desktopNavStyle'] !== 'pills'" aria-label="ניווט הקמפיין">@for (label of items; track $index) {<button type="button" [attr.data-menu-item]="actions && targets[label] ? null : 'true'" [attr.data-header-nav-index]="$index" [attr.data-nav-target]="actions ? targets[label] || null : null">{{ label }}</button>}@for (link of extraLinks; track link[1]) {<button type="button" [attr.data-nav-target]="link[1]">{{ link[0] }}</button>}</nav>}@if ((h['mode'] === 'action' || h['mode'] === 'both') && showAmbassadorAction) {<button class="header-action" data-ambassador="true" [style.display]="mobile ? 'none' : null">{{ platformActions?.ambassadorActionLabel?.() || text(h['action']) }}</button>}@if (hamburger) {<button class="header-hamburger" data-menu-toggle="true" aria-label="פתיחת תפריט" [attr.aria-expanded]="menuOpen ? 'true' : 'false'" (click)="toggleMenu()">☰</button>}<ham-cart-header-button (openCart)="cart.open(false)" />@if (!mobile) {<ham-campaign-header-ctas />}<div ham-campaign-account class="ham-account-wrap" [user]="user"></div></div></div>@if (hamburger) {<div class="header-dropdown" [hidden]="!menuOpen" data-ham-hamburger-nav="ready">@for (link of menuLinks; track $index) {<button type="button" [attr.data-header-nav-index]="link.index" [attr.data-nav-target]="link.target">{{ link.label }}</button>}@if (showAmbassadorAction && (h['mode'] === 'menu' || (mobile && (h['mode'] === 'action' || h['mode'] === 'both')))) {<button data-ambassador="true">{{ platformActions?.ambassadorActionLabel?.() || text(h['action']) }}</button>}@for (link of menuAdditions; track link.target) {<button type="button" [attr.data-nav-target]="link.target">{{ link.label }}</button>}</div>}`
})
export class HeaderPartComponent extends PagePart implements OnDestroy {
  readonly platformActions = inject(STUDIO_PUBLIC_ACTIONS, { optional: true });
  get showAmbassadorAction(): boolean { return this.platformActions?.ambassadorActionLabel?.() !== null; }
  /** Extra classes of the part section (none for the header). */
  @Input() cls = '';

  h!: CardData;
  private device = '';
  private navStyle = 'links';
  desktopLinks = false;
  hamburger = false;
  /** The manager's menu items (comma separated), trimmed. */
  items: string[] = [];
  menuLinks: MenuLink[] = [];
  /**
   * Desktop panorama (v4.47; old `hamApplyCampaignLayout`): known menu labels open their
   * block (`data-nav-target` instead of `data-menu-item`), the four main links are added when missing,
   * and the call-to-action buttons follow the controls.
   */
  actions = false;
  /**
   * v4.49 (old CampaignHeaderService, after each render): the controls end with the call-to-action buttons
   * (a desktop) and the account menu; the panorama's own buttons were replaced by them. On a phone the
   * header's action is hidden (the action bar at the page's end offers it). The cart button goes before
   * them (v4.50: in this template; CampaignCartService mounted it). The signed-in user is read when the page is
   * rendered, as before.
   */
  readonly cart = inject(CampaignCartService);
  mobile = false;
  user: CampaignAccountUser | null = null;
  readonly targets = HEADER_TARGETS;
  extraLinks: [string, string][] = [];
  menuAdditions: MenuLink[] = [];
  /** v4.53: the hamburger's dropdown is open (a render closes it, as a new header started closed). */
  menuOpen = false;

  constructor() { super(); this.render(); this.parts.header = this; }
  ngOnDestroy(): void { if (this.parts.header === this) this.parts.header = null; }

  protected render(): void {
    const campaign = this.parts.campaign;
    const h = this.h = campaign['content'].header;
    this.device = this.parts.device();
    this.navStyle = h['desktopNavStyle'] || 'links';
    this.desktopLinks = this.device === 'desktop' && this.navStyle !== 'hamburger';
    this.hamburger = this.device === 'mobile' || this.navStyle === 'hamburger';
    this.items = String(h['menuItems'] || '').split(',').map(x => x.trim());
    this.actions = this.parts.layout.headerActions;
    this.mobile = this.device === 'mobile';
    const signed = (window as Window & { hamonymCurrentUser?: CampaignAccountUser }).hamonymCurrentUser;
    this.user = signed?.isLoggedIn === true ? signed : null;
    this.extraLinks = this.actions && this.desktopLinks ? HEADER_LINKS.filter(([label]) => !this.items.includes(label)) : [];
    this.menuOpen = false;
    this.menuLinks = [];
    this.menuAdditions = [];
    const shown = (id: string): boolean => {
      if (campaign['visible']?.[id] === false) return false;
      const rewards = campaign['content']?.rewards?.items ?? campaign['management']?.modules?.rewards?.items;
      return !(id === 'rewards' && Array.isArray(rewards) && !rewards.length);
    };
    const seen = new Set<string>();
    this.items.forEach((label, index) => {
      const target = MENU_TARGETS[label];
      if (!target || !shown(target) || seen.has(target)) return;
      seen.add(target);
      this.menuLinks.push({ label, index, target });
    });
    for (const [target, label] of MENU_ADDITIONS) {
      if (seen.has(target) || !shown(target)) continue;
      seen.add(target);
      this.menuAdditions.push({ label, index: null, target });
    }
  }

  /** The hamburger opens and closes the dropdown (the preview's handler only ignores the click). */
  toggleMenu(): void { this.menuOpen = !this.menuOpen; this.cdr.detectChanges(); }

  /** A link of the dropdown, or Escape (AppComponent): the dropdown closes. */
  closeMenu(): void { if (!this.menuOpen) return; this.menuOpen = false; this.cdr.detectChanges(); }

  text(v: unknown): string { return String(v ?? ''); }
}
