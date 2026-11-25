import { ChangeDetectionStrategy, Component, Input, OnDestroy, ViewEncapsulation } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CardData } from '../cards/card-format';
import { PagePart } from './page-part';
import { PANORAMA_BAR_STYLE, PANORAMA_TAB_STYLE, PanoramaTab } from './page-layout';

interface NavItem { target: string; label: string; }

/** The navigation catalog (v0.1.93): every block a link can open, in order. */
const TARGETS: [string, string][] = [['story', 'סיפור'], ['rewards', 'תשורות'], ['donors', 'תורמים'], ['ambassadors', 'שגרירים'], ['comments', 'תגובות'], ['updates', 'עדכונים'], ['sponsors', 'חסויות']];
/** Panorama on a desktop: the blocks of its tabs (rewards only when they sit in the main column). */
const PANORAMA_TARGETS: [string, string][] = [['story', 'סיפור'], ['donors', 'תורמים'], ['ambassadors', 'שגרירים'], ['updates', 'עדכונים'], ['comments', 'תגובות'], ['rewards', 'תשורות']];

/**
 * The campaign navigation (old core `campaignNavMarkup` with `navItems`): the desktop links, and on a
 * phone tabs, a dropdown or "hybrid" (three links and "עוד"). Only blocks shown on this device are
 * linked. A link (`[data-nav-target]`) is handled by the preview (it scrolls, opens a menu-only
 * block or a panorama tab); the dropdown and "עוד" open here. A tab (`[data-ham-panorama-tab]`) is
 * handled by the core's capturing listener.
 */
@Component({
  selector: 'section[ham-campaign-nav-part]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': 'parts.partClass("nav", cls)', 'data-part': 'nav' },
  template: `<ng-template #link let-x let-i="i"><button type="button" [attr.class]="'campaign-nav-link ' + ((chosen === null ? i === 0 : x.target === chosen) ? 'nav-current' : '')" [attr.data-nav-target]="x.target">{{ x.label }}</button></ng-template>@if (tabs) {<nav class="campaign-nav nav-desktop" role="tablist" aria-label="תוכן הקמפיין" [attr.style]="barStyle">@for (t of tabs; track t.id) {@if (t.bare) {<button type="button" class="campaign-nav-link" [attr.data-ham-panorama-tab]="t.id" [attr.aria-selected]="parts.panoramaSelected() === null ? null : 'false'">{{ t.name }}</button>} @else if (t.plain) {<button type="button" [attr.data-ham-panorama-tab]="t.id" [attr.class]="'campaign-nav-link' + (tabCurrent(t) ? ' nav-current' : '')" role="tab" [attr.aria-selected]="tabCurrent(t) ? 'true' : 'false'" [attr.style]="tabStyle">{{ t.name }}</button>} @else {<button type="button" [attr.class]="'campaign-nav-link' + (tabCurrent(t) ? ' nav-current' : '')" role="tab" [attr.aria-selected]="tabCurrent(t) ? 'true' : 'false'" [attr.data-ham-panorama-tab]="t.id" [attr.style]="tabStyle"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">@switch (t.id) {@case ('donors') {<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>}@case ('ambassadors') {<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M16 14a6 6 0 0 1 6 6"/>}@case ('updates') {<path d="M3 11v3h4l9 5V6l-9 5H3Zm13-2a4 4 0 0 1 0 7M6 14l2 7"/>}@case ('comments') {<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z"/>}@default {<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 0z"/><path d="M5 4v16M9 9h6M9 13h6"/>}}</svg><span>{{ t.name }}</span></button>}}</nav>} @else {<div [attr.class]="'nav-component ' + (n['sticky'] ? 'nav-sticky' : '')" [attr.style]="style"><nav class="campaign-nav nav-desktop">@for (x of items; track $index) {<ng-container *ngTemplateOutlet="link; context: { $implicit: x, i: $index }" />}</nav>@switch (n['mobileStyle']) {
  @case ('dropdown') {<div class="nav-mobile nav-dropdown"><button type="button" class="nav-dropdown-trigger" data-nav-dropdown [attr.aria-expanded]="open === 'dropdown' ? 'true' : 'false'" aria-label="בחר אזור בקמפיין" (click)="toggle('dropdown')"><span class="nav-dropdown-leading"><span class="nav-dropdown-symbol">☷</span><span class="nav-dropdown-caption"><small>לגלות עוד בקמפיין</small><strong class="nav-dropdown-label">{{ label ?? current }}</strong></span></span><span class="nav-dropdown-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></span></button><div class="nav-dropdown-list" [hidden]="open !== 'dropdown'"><div class="nav-dropdown-list-heading">לאן תרצו לעבור?</div>@for (x of items; track $index) {<ng-container *ngTemplateOutlet="link; context: { $implicit: x, i: $index }" />}</div></div>}
  @case ('hybrid') {<div class="nav-mobile nav-hybrid" role="navigation" aria-label="ניווט הקמפיין">@for (x of items.slice(0, 3); track $index) {<ng-container *ngTemplateOutlet="link; context: { $implicit: x, i: $index }" />}@if (items.length > 3) {<div class="nav-more-wrap"><button type="button" class="nav-more-trigger" data-nav-more [attr.aria-expanded]="open === 'more' ? 'true' : 'false'" (click)="toggle('more')">עוד ⌄</button><div class="nav-more-list" [hidden]="open !== 'more'">@for (x of items.slice(3); track $index) {<ng-container *ngTemplateOutlet="link; context: { $implicit: x, i: $index + 3 }" />}</div></div>}</div>}
  @default {<div class="nav-mobile nav-tabs" role="navigation" aria-label="ניווט הקמפיין">@for (x of items; track $index) {<ng-container *ngTemplateOutlet="link; context: { $implicit: x, i: $index }" />}</div>}
}</div>}<ng-content />`,
  imports: [NgTemplateOutlet]
})
export class CampaignNavPartComponent extends PagePart implements OnDestroy {
  @Input() cls = '';

  private campaign!: CardData;
  n!: CardData;
  /**
   * On a desktop panorama (v4.47; old `hamApplyCampaignLayout`): the desktop bar is the tab bar, the
   * story's links are dropped, and the tab panels (the page's blocks) are projected after the bar.
   */
  tabs: PanoramaTab[] | null = null;
  /** v4.48 (old finalizer `buildPanorama`): the tab bar left `.nav-component` (dropped with the mobile menu), with its inline style. */
  barStyle = '';
  readonly tabStyle = PANORAMA_TAB_STYLE;
  items: NavItem[] = [];
  /** The dropdown's label: the menu-only block a link opened, else a prompt. */
  current = '';
  style = '';
  /**
   * v4.53 (the DOM was the state): the open list (the dropdown or "עוד"), and the link the preview's handler
   * chose since the render (`nav-current`, the dropdown's label). A render starts again from the markup's state.
   */
  open: 'dropdown' | 'more' | null = null;
  chosen: string | null = null;
  label: string | null = null;

  constructor() { super(); this.render(); this.parts.nav = this; }
  ngOnDestroy(): void { if (this.parts.nav === this) this.parts.nav = null; }

  protected render(): void {
    this.campaign = this.parts.campaign;
    const n = this.n = this.campaign['content'].nav;
    const layout = this.parts.layout;
    this.tabs = layout.tabs;
    this.barStyle = PANORAMA_BAR_STYLE + (layout.barColumns ? ` grid-template-columns: repeat(${layout.barColumns}, minmax(0px, 1fr)) !important;` : '');
    this.items = this.navItems();
    this.current = this.items.find(x => x.target === this.parts.activeNavSection())?.label || 'בחרו אזור לצפייה';
    this.style = `--nav-bg:${this.text(n['bg'] || '#ffffff')};--nav-color:${this.text(n['color'] || '#53635e')};--nav-active:${this.text(n['activeColor'] || '#246f65')};--nav-border:${this.text(n['borderColor'] || '#e3e9e5')};--nav-radius:${Number(n['radius'] ?? 10)}px;--nav-size:${Number(n['fontSize'] ?? 12)}px;`;
    this.open = this.chosen = this.label = null;
  }

  /** A panorama tab is the current one: the layout's, or the one chosen since the render (`hamPanoramaSelectTab`). */
  tabCurrent(t: PanoramaTab): boolean { const sel = this.parts.panoramaSelected(); return sel === null ? t.current : t.id === sel; }

  /** The dropdown / "עוד" button opens the list after it (the preview's handler only ignores the click). */
  toggle(list: 'dropdown' | 'more'): void {
    this.open = this.open === list ? null : list;
    this.cdr.detectChanges();
  }

  /**
   * The preview's handler followed a link (`[data-nav-target]`) of the navigation: it is the current link, the
   * dropdown shows its text, and the lists close.
   */
  choose(target: string, label: string): void {
    this.chosen = target;
    this.label = label;
    this.open = null;
    this.cdr.detectChanges();
  }

  text(v: unknown): string { return String(v ?? ''); }

  private navItems(): NavItem[] {
    const c = this.campaign, allowed = (id: string) => this.parts.deviceAllowed(id);
    if (this.parts.device() === 'desktop' && c['template'] === 'panorama') {
      return PANORAMA_TARGETS.filter(([id]) => allowed(id) && c['visible']?.[id] !== false && (id !== 'rewards' || (c['content'].rewards?.desktopPosition === 'main' && (c['content'].rewards?.items || []).length > 0))).map(([target, label]) => ({ target, label }));
    }
    return TARGETS.filter(([id]) => allowed(id) && (id !== 'rewards' || (c['content'].rewards?.items || []).length > 0) && (id !== 'sponsors' || c['management']?.modules?.sponsors?.items?.length > 0)).map(([target, label]) => ({ target, label }));
  }
}
