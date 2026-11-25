import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, QueryList, ViewChild, ViewChildren, ViewEncapsulation, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CardData } from '../cards/card-format';
import { CampaignShareComponent } from '../cards/campaign-share.component';
import { DonationBoxComponent } from '../cards/donation-box.component';
import { RaceCardComponent } from '../cards/race-card.component';
import { RewardTileComponent } from '../cards/reward-tile.component';
import { SponsorsComponent, sponsorsShown } from '../cards/sponsors.component';
import { CollectionBlocksService, ContentKind } from '../collections/collection-blocks.service';
import { ContentCollectionComponent, contentMatches } from '../collections/content-collection.component';
import { DonorsCollectionComponent } from '../collections/donors-collection.component';
import { headingStyle, raw } from '../collections/collection-style';
import { CampaignInfoPartComponent } from './campaign-info-part.component';
import { CampaignNavPartComponent } from './campaign-nav-part.component';
import { DonatePartComponent, StickyCtaComponent } from './donate-parts.component';
import { FooterPartComponent } from './footer-part.component';
import { HeaderPartComponent } from './header-part.component';
import { HeroPartComponent } from './hero-part.component';
import { MobileTab, PageLayout, PageNode, pageLayout } from './page-layout';
import { PreviewHost, previewHost } from './preview-host';
import { PublicPartsService } from './public-parts.service';
import { StoryPartComponent } from './story-part.component';
import { StatsPartComponent, TitlePartComponent } from './title-stats-parts.component';
import { RaceParticipantsComponent } from '../../races/race-participants.component';
import { CampaignMobileActionsComponent } from '../../public-header/campaign-mobile-actions.component';
import { SimpleDonationComponent } from './simple-donation.component';

/**
 * The section of a block that is its own component inside (old core `part()`): `<section
 * class="editable …" data-part="…">` around the share block, the donation box, the collection
 * blocks, the race block and the sponsors.
 */
@Component({
  selector: 'section[ham-block-part]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': 'parts.partClass(part, cls)', '[attr.data-part]': 'part' },
  template: `<ng-content />`
})
export class BlockPartComponent {
  readonly parts = inject(PublicPartsService);
  @Input({ required: true }) part!: string;
  @Input() cls = '';
}

/**
 * The public page (v4.46; old core `renderPreview` markup, and since v4.47 its layout): the header, the
 * Hero and the campaign info, `.campaign-body` with the blocks in the device's order, the sponsors,
 * the footer and the sticky donate button. A block hidden on this device is left out (old
 * `deviceAllowed`).
 *
 * The structure comes from `pageLayout` (page-layout.ts): on a desktop the panorama and slider columns,
 * the panorama's sidebar (stats, donation box, rewards and race registration), its tabs and panels,
 * the share strip and the Hero stats card, and the "donation" template's focus group. They were DOM
 * moves after the page was written (old `hamApplyCampaignLayout`, `hamApplyHeroStatsCard`, the race
 * card move); the page is now rendered in place, each section with the `order` the core gave it.
 * The template renders that tree (`nodes`); a part's own changes (share strip, tabs, story article,
 * stats card, Hero logo, manager fact, header links) are flags of the layout that the part reads.
 *
 * v4.53: the page is created once (in the Studio with `#preview` as its host) and rendered again in place on
 * every `renderPreview` (`CampaignCardsService.renderPage`): `render()` computes the layout again, and each part
 * computes itself again when the page is checked (PagePart). The core then runs what it ran on the page before
 * (subtitle fit, the container's layout classes, the race card, the cart sync, the amounts, the CTAs). The
 * blocks are this template's own child components (no slot).
 *
 * v4.49: what the render hook added after the page was written is in the tree too: a race's participants
 * (old RaceFlowService) and the mobile action bar, last on the page (old CampaignHeaderService; the header's
 * own controls are the header part's).
 *
 * As the markup did, every collection block syncs its toolbar with the inspector's layout when the
 * page is built, shown or not (`CollectionBlocksService.prepareContent` / `prepareDonors`).
 */
@Component({
  selector: 'div[ham-public-page]',
  standalone: true,
  host: { '[attr.class]': 'hostClass', '[attr.data-hero-subtitle-wrap]': 'hostWrap', '[style]': 'hostStyle' },
  imports: [NgTemplateOutlet, BlockPartComponent, HeaderPartComponent, HeroPartComponent, CampaignInfoPartComponent, TitlePartComponent, StatsPartComponent, DonatePartComponent,
    CampaignNavPartComponent, StoryPartComponent, FooterPartComponent, StickyCtaComponent, CampaignShareComponent, DonationBoxComponent, RaceCardComponent,
    SponsorsComponent, ContentCollectionComponent, DonorsCollectionComponent, RewardTileComponent, RaceParticipantsComponent, CampaignMobileActionsComponent, SimpleDonationComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-template #nodes let-list>@for (n of list; track n.t + ':' + n.id) {@switch (n.t) {
  @case ('part') {<ng-container *ngTemplateOutlet="part; context: { $implicit: n }" />}
  @case ('panel') {<div class="ham-panorama-tab-panel" [attr.data-ham-panorama-panel]="n.id" data-ham-view-mode="grid" [hidden]="panelHidden(n)">@if (n.view) {<div class="ham-view-switcher" [attr.data-ham-view-controls]="n.id"><strong>{{ tabName(n.id) }}</strong><div class="ham-view-buttons" role="group" aria-label="בחירת תצוגה"><button type="button" class="ham-view-active" data-ham-view="grid" aria-label="גריד" title="גריד" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button><button type="button" data-ham-view="list" aria-label="רשימה" title="רשימה" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6h12M9 12h12M9 18h12"/><path d="M3 6h2M3 12h2M3 18h2"/></svg></button><button type="button" data-ham-view="carousel" aria-label="קרוסלה" title="קרוסלה" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M2 7v10M22 7v10"/></svg></button></div></div>}@if (n.empty) {<p class="ham-panorama-empty">{{ n.empty }}</p>}<ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }" /></div>}
  @case ('mount') {<div [attr.class]="n.cls" [attr.style]="mountStyle(n)" [attr.data-shape]="n.data.shape" [attr.data-preset]="n.data.preset" [attr.data-text-tiles]="n.data.textTiles" [attr.data-text-icons]="n.data.textIcons" [attr.data-bold]="n.data.bold" [attr.data-glass]="n.data.glass" [attr.data-meter]="n.data.meter"><ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }" /></div>}
  @case ('mtabs') {<nav class="ham-mobile-tabs" role="tablist" [attr.style]="'--ham-tab-count: ' + layout.mobileTabs!.length + ';'">@for (t of layout.mobileTabs; track t.id) {<button type="button" [attr.data-ham-mobile-tab]="t.id" role="tab" [attr.aria-selected]="mobileCurrent(t) ? 'true' : 'false'">{{ t.name }}</button>}</nav>}
  @case ('mpanel') {<div class="ham-mobile-tab-panel" [attr.data-ham-mobile-panel]="n.id" [hidden]="mobileHidden(n)"><ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }" /></div>}
  @case ('participants') {<ham-race-participants />}
  @case ('ppanel') {<div class="ham-panorama-tab-panel" [attr.data-ham-panorama-panel]="n.id" [hidden]="panelHidden(n)"><ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }" /></div>}
  @case ('psection') {<section id="ham-race-public-participants"><ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }" /></section>}
  @case ('actionbar') {<div ham-campaign-mobile-actions class="ham-mobile-actionbar" aria-label="פעולות הקמפיין"></div>}
  @case ('simple') {@if (!simpleMoved) {<section ham-simple-donation [moved]="simpleEnd ? moveSimple : undefined"></section>}}
  @case ('simpleEnd') {@if (simpleMoved) {<section ham-simple-donation></section>}}
  @case ('shortcut') {<button type="button" class="ham-rewards-discovery-link" data-ham-jump-rewards="1" aria-label="לצפייה בתשורות" style="display: flex !important;"><span aria-hidden="true">🎁</span><span>לצפייה בתשורות</span><span aria-hidden="true">←</span></button>}
  @default {@switch (n.tag) {
    @case ('aside') {<aside [attr.class]="n.cls"><ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }" /></aside>}
    @case ('section') {<section [attr.class]="n.cls" [attr.aria-label]="n.label"><ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }" /></section>}
    @default {<div [attr.class]="n.cls"><ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }" /></div>}
  }}
}}</ng-template><ng-template #part let-n>@switch (n.id) {
  @case ('header') {<section ham-header-part></section>}
  @case ('hero') {<section ham-hero-part><ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }" /></section>}
  @case ('campaignInfo') {<section ham-campaign-info-part></section>}
  @case ('title') {<section ham-title-part [cls]="n.cls" [attr.style]="n.style" [hidden]="storyHidden(n)"></section>}
  @case ('stats') {<section ham-stats-part [cls]="n.cls" [attr.style]="n.style"></section>}
  @case ('donationBox') {<section ham-block-part [part]="'donationBox'" [cls]="n.cls" [attr.style]="n.style">@if (donationBox) {<div ham-donation-box [donate]="donationBox"></div>}</section>}
  @case ('donate') {<section ham-donate-part [cls]="n.cls" [attr.style]="n.style"></section>}
  @case ('share') {<section ham-block-part [part]="'share'" [cls]="n.cls" [attr.style]="n.style"><div ham-campaign-share [cfg]="c['share']" [strip]="layout.shareStrip"></div></section>}
  @case ('nav') {<section ham-campaign-nav-part [cls]="n.cls" [attr.style]="n.style"><ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }" /></section>}
  @case ('story') {<section ham-story-part [cls]="cls('story') + ' ' + n.cls" [attr.style]="n.style" [hidden]="storyHidden(n)"></section>}
  @case ('races') {<section ham-block-part [part]="'races'" [cls]="cls('races') + ' ' + n.cls" [attr.style]="n.style"><section ham-race-card></section></section>}
  @case ('donors') {<section ham-block-part [part]="'donors'" [cls]="cls('donors') + ' ' + n.cls" [attr.style]="n.style"><div ham-donors-collection [items]="donors"></div></section>}
  @case ('rewards') {<section ham-block-part [part]="'rewards'" [cls]="cls('rewards') + ' ' + n.cls" [attr.style]="n.style">@if (layout.sidebarRewards) {<section class="ham-sidebar-rewards-list" dir="rtl"><h2 class="ham-sidebar-rewards-title" [attr.style]="rewardsHeading">תשורות</h2><div class="ham-sidebar-reward-items">@for (r of rewardItems; track $index) {<article ham-reward-tile [item]="r" [cfg]="c['rewards']" [index]="$index" [live]="true"></article>} @empty {<p class="ham-sidebar-rewards-empty">אין תשורות להצגה</p>}</div></section>} @else {<section ham-content-collection [kind]="'rewards'" [device]="device"></section>}</section>}
  @case ('sponsors') {<section ham-block-part [part]="'sponsors'" [cls]="cls('sponsors')">@if (sponsors) {<section ham-sponsors></section>}</section>}
  @case ('footer') {<section ham-footer-part></section>}
  @case ('sticky') {<div ham-sticky-cta></div>}
  @default {<section ham-block-part [part]="n.id" [cls]="cls(n.id) + ' ' + n.cls" [attr.style]="n.style"><section ham-content-collection [kind]="n.id" [device]="device"></section></section>}
}</ng-template><ng-container *ngTemplateOutlet="nodes; context: { $implicit: layout.top }" />`
})
export class PublicPageComponent implements OnDestroy {
  private readonly parts = inject(PublicPartsService);
  private readonly blocks = inject(CollectionBlocksService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private campaign!: CardData;
  c!: CardData;
  device = '';
  race = false;
  /** The blocks after the donors, in the markup's order. */
  readonly lastKinds: ContentKind[] = ['updates', 'rewards', 'comments'];
  donors: CardData[] = [];
  /** The donation box's settings for this device, or null when the box is off (an empty section, as before). */
  donationBox: CardData | null = null;
  sponsorsBlock = false;
  sponsors = false;
  sticky = false;
  /** The page's structure; the parts read it while they are created or rendered again (below, in this view). */
  layout!: PageLayout;
  /** The panorama sidebar's reward list (`content.rewards.items`) and its heading. */
  rewardItems: CardData[] = [];
  rewardsHeading: string | null = null;
  /**
   * v4.51: the simple donation page's form follows the action bar once a step was taken (old: each step wrote the
   * form again at the end of #preview). Only on a phone with the header (the action bar); elsewhere it is last.
   */
  simpleMoved = false;
  /** v4.52 (old core): a race's Hero stats card at the middle of the Hero image; v4.53: rendered in the card's style. */
  private raceCardTop: string | null = null;

  /**
   * v4.53: the container's classes, data attribute and CSS variables (preview-host.ts; v4.52 wrote them to the
   * Studio's `#preview`, which is this page's host since v4.53). As before: the class name and the theme's variables
   * when the render starts, the panorama's variables and the toggled classes once the Hero's subtitle is fitted
   * (`layoutHost`); a variable set once is kept from render to render.
   */
  hostClass: string | null = null;
  hostWrap: string | null = null;
  hostStyle: Record<string, string> = {};
  private host_: PreviewHost | null = null;

  constructor() {
    this.parts.page = this;
    this.render();
  }

  /** The container's layout classes and variables (the core calls it after the subtitle fit). */
  layoutHost(): void {
    const host = this.host_;
    if (!host) return;
    const style = { ...this.hostStyle };
    for (const [k, v] of host.vars.slice(5)) style[k] = v;
    this.hostStyle = style;
    const classes = this.hostClass ? this.hostClass.split(' ').filter(Boolean) : [];
    for (const [cls, on] of host.toggles) {
      const at = classes.indexOf(cls);
      if (on && at < 0) classes.push(cls); else if (!on && at >= 0) classes.splice(at, 1);
    }
    this.hostClass = classes.join(' ');
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void { if (this.parts.page === this) this.parts.page = null; }

  /**
   * v4.53: a render (the core's `renderPreview`, through `CampaignCardsService.renderPage`) computes the page again
   * in place; the caller then checks the page, and every part renders itself again (PagePart).
   */
  render(): void {
    const parts = this.parts;
    const campaign = this.campaign = parts.campaign;
    this.c = campaign['content'];
    this.device = parts.device();
    this.race = campaign['management']?.campaignKind === 'race';
    this.donors = Array.isArray(campaign['management']?.modules?.donors?.items) ? campaign['management'].modules.donors.items : [];
    this.donationBox = parts.donationBox();
    this.sponsorsBlock = campaign['visible'].sponsors !== false && !!this.c['sponsors'] && !!campaign['management']?.modules?.sponsors?.items?.length;
    this.sponsors = this.sponsorsBlock && sponsorsShown(campaign as never);
    this.sticky = !!campaign['visible'].donate && !!this.c['donate'].sticky && this.device === 'mobile';
    this.rewardItems = this.c['rewards']?.items || [];
    this.rewardsHeading = headingStyle(this.c['rewards'] || {}, 'rewards', raw);
    this.simpleMoved = false;
    this.raceCardTop = null;
    const host = this.host_ = previewHost(campaign, this.device);
    this.hostClass = host.className;
    this.hostWrap = host.subtitleWrap;
    const style = { ...this.hostStyle };
    for (const [k, v] of host.vars.slice(0, 5)) style[k] = v;
    this.hostStyle = style;
    this.layout = parts.layout = pageLayout({
      campaign, device: this.device, allowed: id => parts.deviceAllowed(id), order: parts.order(),
      tab: () => parts.panoramaTab(), setTab: id => parts.setPanoramaTab(id), design: () => parts.cardDesign(),
      mobileTab: () => parts.mobileTab(), setMobileTab: id => parts.setMobileTab(id), rewardTiles: this.rewardTiles(),
      sponsors: this.sponsorsBlock, sticky: this.sticky
    });
    // The markup built each collection block (and synced its toolbar) in this order, shown or not.
    this.blocks.prepareContent('ambassadors');
    this.blocks.prepareDonors();
    for (const kind of this.lastKinds) this.blocks.prepareContent(kind);
    // Every collection is a new one for its carousel nav (old: the preview's observer saw them inserted).
    this.blocks.rendered();
    // The page is OnPush: its view is checked again by the caller's check of the page.
    this.cdr.markForCheck();
  }

  /** The page after a change of its state (a tab): its template, and the parts that read that state. */
  check(): void { this.cdr.detectChanges(); }

  get simpleEnd(): boolean { return this.layout.top.some(n => n.t === 'simpleEnd'); }
  readonly moveSimple = (): void => { this.simpleMoved = true; this.cdr.detectChanges(); };

  /** A panorama panel: hidden unless its tab is the current one (the layout's, or the one chosen since the render). */
  panelHidden(n: PageNode): boolean { const sel = this.parts.panoramaSelected(); return sel === null || !this.layout.tabs ? n.hidden : n.id !== sel; }
  /** The panorama's title and story article follow the chosen tab too. */
  storyHidden(n: PageNode): boolean { const sel = this.parts.panoramaSelected(); return sel === null || !this.layout.tabs ? n.hidden : sel !== 'story'; }
  mobileCurrent(t: MobileTab): boolean { const sel = this.parts.mobileSelected(); return sel === null ? t.current : t.id === sel; }
  mobileHidden(n: PageNode): boolean { const sel = this.parts.mobileSelected(); return sel === null ? n.hidden : n.id !== sel; }
  mountStyle(n: PageNode): string | null {
    if (!this.raceCardTop || !n.classes.includes('ham-hero-stats-mount')) return n.style;
    return (n.style ? n.style + ' ' : '') + `top: ${this.raceCardTop} !important; transform: translateY(-50%) !important;`;
  }

  /** The donation boxes of the page (one, or none when the box is off). */
  @ViewChildren(DonationBoxComponent) private readonly boxes?: QueryList<DonationBoxComponent>;

  @ViewChild(HeroPartComponent) private readonly hero?: HeroPartComponent;
  @ViewChildren(DonatePartComponent) private readonly donates?: QueryList<DonatePartComponent>;
  @ViewChild(StickyCtaComponent) private readonly sticky_?: StickyCtaComponent;

  /** v4.52 (old core, after the page was written): the Hero's subtitle on one line. */
  fitHeroSubtitle(): void { this.hero?.fitSubtitle(); }
  /** v4.52 (old core): a race's Hero stats card at the middle of the Hero image (desktop panorama, the card on the Hero). */
  placeRaceCard(): void {
    if (!(this.race && this.device === 'desktop' && this.campaign['template'] === 'panorama')) return;
    const heroPart = this.host.querySelector<HTMLElement>('[data-part="hero"]');
    const hero = heroPart?.querySelector<HTMLElement>('.hero'), card = heroPart?.querySelector<HTMLElement>('.ham-hero-stats-mount');
    if (!hero || !card) return;
    this.raceCardTop = (hero.offsetTop + hero.offsetHeight / 2) + 'px';
    this.cdr.detectChanges();
  }
  /**
   * v4.52 (old core `syncDonationCtas`, also on the preview's scroll and resize): the donate button is a duplicate
   * when it follows the donation box among the shown blocks; the sticky button hides while a donate action is in view.
   */
  syncCtas(): void {
    const p = document.querySelector<HTMLElement>('#preview');
    const body = p?.querySelector<HTMLElement>('.campaign-body');
    if (!p || !body) return;
    const box = body.querySelector<HTMLElement>(':scope > [data-part="donationBox"]');
    const regular = body.querySelector<HTMLElement>(':scope > [data-part="donate"]');
    if (regular) {
      const shown = Array.from(body.children).filter(el => (el as HTMLElement).dataset['part'] && (el === regular || getComputedStyle(el).display !== 'none'));
      const adjacent = !!box && shown.indexOf(box) >= 0 && shown.indexOf(regular) === shown.indexOf(box) + 1;
      this.donates?.find(d => d.element === regular)?.setDuplicate(adjacent);
    }
    const sticky = this.sticky_;
    if (sticky?.element.isConnected && p.contains(sticky.element)) {
      const viewport = p.getBoundingClientRect();
      const regularButton = regular && !regular.classList.contains('donate-duplicate') ? regular.querySelector('.donate-button') : null;
      const candidates = [box?.querySelector('.donation-continue'), regularButton];
      const visible = candidates.some(btn => {
        if (!btn || !btn.getClientRects().length) return false;
        const rect = btn.getBoundingClientRect();
        return rect.bottom > viewport.top + 8 && rect.top < viewport.bottom - 8;
      });
      sticky.setHidden(visible);
    }
  }

  /** The page's nodes are in `#preview` (the core, after its subtitle fit and the cart): what measures the page. */
  attached(): void { this.boxes?.forEach(box => box.attached()); }

  /** The rewards block shows a tile: a reward that its toolbar's search keeps (old finalizer: `.hc-content-collection .reward-tile`). */
  private rewardTiles(): boolean {
    const query = this.blocks.content.rewards.search.trim().toLocaleLowerCase('he');
    return this.rewardItems.some(item => contentMatches(item, query));
  }

  /** A block's extra classes (a menu-only block on a phone). */
  cls(id: string): string { return this.parts.contentPartClass(id); }
  tabName(id: string): string { return id === 'sponsors' ? 'נותני חסות' : id; }
}
