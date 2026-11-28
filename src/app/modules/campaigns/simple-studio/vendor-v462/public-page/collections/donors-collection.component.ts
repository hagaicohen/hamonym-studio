import { ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { PagePart } from '../parts/page-part';
import { CampaignStateService } from '../../core/campaign-state.service';
import { clampSize, hexColor } from '../../core/campaign-style';
import { CollectionHeaderComponent, CollectionView } from '../../collections/collection-header.component';
import { CardData } from '../cards/card-format';
import { DonorCardComponent, DonorCardOptions } from '../cards/donor-card.component';
import { CollectionBlock, CollectionBlocksService } from './collection-blocks.service';
import { CollectionNavComponent } from './collection-nav.component';

const SORTS: [string, string][] = [['recent', 'אחרונים'], ['high', 'סכום גבוה'], ['low', 'סכום נמוך']];
/** Inspector layout → view, when the toolbar has not chosen one. */
const LAYOUT_VIEW: Record<string, CollectionView> = { cards: 'grid', list: 'list', feed: 'list', carousel: 'carousel' };

/**
 * The donors block of the public page (old core `donorsMarkup` with `listFiltersMarkup`, the
 * collection header, and their handlers): search (name, and dedications unless the inspector
 * turns that off), sort, the first `count` donors with "הצגת תורמים נוספים" (+3 per click), and the
 * grid / list / carousel views. The carousel shows every donor.
 *
 * The host is the block's own `<div class="hc-public-collection hc-donor-collection">`. The donors
 * are an input: the core passes the campaign's donors; a toolbar change renders the block again
 * (`CollectionBlocksService.refreshDonors`).
 */
@Component({
  selector: 'div[ham-donors-collection]',
  standalone: true,
  imports: [CollectionHeaderComponent, CollectionNavComponent, DonorCardComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'hc-public-collection hc-collection hc-donor-collection',
    '[attr.data-hc-mode]': 'mode',
    '[attr.style]': 'styleVars'
  },
  template: `<div ham-collection-header [heading]="'תורמים'" [view]="mode" [hasFilters]="true" (viewChange)="setView($event)"><div class="list-filters donors-toolbar" role="search" aria-label="חיפוש ומיון תורמים">&ngsp;<label class="list-search-wrap"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.2 4.2"/></svg><input class="list-search donors-search" data-donors-search type="search" placeholder="חיפוש..." [attr.value]="state.search" aria-label="חיפוש תורמים" autocomplete="off" (input)="search($event)"></label>&ngsp;<div class="list-sort-wrap donors-sort-wrap"><button type="button" class="list-sort-trigger donors-sort-trigger" data-donors-sort-trigger aria-haspopup="listbox" [attr.aria-expanded]="expanded" aria-label="מיון תורמים" title="מיון" (click)="toggleMenu($event)"><span>מיון</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="list-sort-menu donors-sort-menu" data-donors-sort-menu role="listbox" [hidden]="!menuOpen">@for (choice of sorts; track choice[0]) {<button type="button" role="option" [attr.data-donors-sort-option]="choice[0]" [attr.aria-selected]="sort === choice[0]" [class.is-selected]="sort === choice[0]" (click)="sortBy($event, choice[0])">{{ choice[1] }}@if (sort === choice[0]) {<span aria-hidden="true">✓</span>}</button>}</div></div></div></div>@for (k of [renderKey]; track k) {<div #track class="hc-items">@for (donor of shown; track donor) {<article ham-donor-card [item]="donor" [options]="cardOptions"></article>} @empty {<p class="donors-empty">לא נמצאו תורמים התואמים לחיפוש</p>}</div>}@if (navShown) {<nav ham-collection-nav [track]="trackRef!.nativeElement" [active]="mode === 'carousel'" [showDots]="true"></nav>}@if (hasMore) {<button class="load-more donors-more" data-load="true" type="button" (click)="more()">הצגת תורמים נוספים</button>}`
})
export class DonorsCollectionComponent extends PagePart implements OnInit, OnChanges, OnDestroy, CollectionBlock {
  private readonly blocks = inject(CollectionBlocksService);
  private readonly campaignState = inject(CampaignStateService);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  @ViewChild(CollectionNavComponent) private nav?: CollectionNavComponent;
  @ViewChild('track') trackRef?: ElementRef<HTMLElement>;
  /** A new track on each render (its cards and its scroll position were new): `@for` over this key. */
  renderKey = 0;
  /** The donations a toolbar change listed instead of the input (the sample donors of a campaign without donors), until the next page render. */
  private override?: CardData[];
  private initialized = false;

  /** The donations listed (before the toolbar's search, sort and limit). */
  @Input() items: CardData[] = [];

  readonly state = this.blocks.donors;
  readonly sorts = SORTS;
  mode: CollectionView = 'grid';
  sort = 'recent';
  shown: CardData[] = [];
  hasMore = false;
  cardOptions: DonorCardOptions = {};
  styleVars = '';
  /** The sort menu is shown (and its trigger's `aria-expanded`). */
  menuOpen = false;
  expanded = false;
  /** The carousel nav exists (see `syncCarousel`). */
  navShown = false;

  ngOnInit(): void {
    this.initialized = true;
    this.render();
    this.blocks.own(this.host, this);
  }
  ngOnChanges(): void { if (this.initialized) { this.override = undefined; this.compute(); } }

  /** A page render: the block from the campaign's donors again, as a new block (menu closed, no nav yet, first card). */
  protected render(): void { this.override = undefined; this.compute(); }

  /** A toolbar change (CollectionBlocksService `refreshDonors`): the block again, at once, with these donations. */
  refresh(items: CardData[]): void { this.override = items; this.compute(); this.update(); }

  private compute(): void {
    this.menuOpen = this.expanded = this.navShown = false;
    this.renderKey++;
    const items = this.override ?? this.items;
    const campaign = this.campaignState.current as CardData, d: CardData = campaign['content']?.donors || {};
    this.sort = this.state.sortOverride || d['defaultSort'] || 'recent';
    const q = this.state.search.trim().toLocaleLowerCase('he');
    const filtered = (items || []).map((v, i): CardData => ({ ...v, idx: i })).filter(v => !q || String(v['name'] || '').toLocaleLowerCase('he').includes(q) || (d['searchDedications'] !== false && String(v['dedication'] || '').toLocaleLowerCase('he').includes(q)));
    if (this.sort === 'high') filtered.sort((a, b) => Number(b['amount'] || 0) - Number(a['amount'] || 0) || a['idx'] - b['idx']);
    else if (this.sort === 'low') filtered.sort((a, b) => Number(a['amount'] || 0) - Number(b['amount'] || 0) || a['idx'] - b['idx']);
    else filtered.sort((a, b) => a['idx'] - b['idx']);
    const count = Math.max(1, Math.min(30, Number(d['count']) || 3)) + this.state.extra;
    this.mode = (this.blocks.donorView || LAYOUT_VIEW[d['layout']] || 'grid') as CollectionView;
    this.shown = this.mode === 'carousel' || this.blocks.allDonors ? filtered : filtered.slice(0, count);
    // On a phone the block has no "more" button (MobileCollectionsService removed it after each render).
    this.hasMore = this.mode !== 'carousel' && filtered.length > count && this.parts.device() !== 'mobile';
    this.cardOptions = { context: 'public', showAmount: d['showAmounts'] !== false, anonymousAmountVisible: d['showAmounts'] !== false, showTime: d['showTime'] !== false, showAvatar: d['showAvatars'] !== false, showDedication: d['showDedications'] !== false };
    this.styleVars = `--hc-gap:${clampSize(d['gap'], 10, 0, 36)}px;--hc-card-bg:${hexColor(d['cardBg'], '#f8faf9')};--hc-card-border:${hexColor(d['borderColor'], '#e0e8e4')};--hc-card-radius:${clampSize(d['radius'], 14, 0, 40)}px;--hc-card-accent:${hexColor(d['accentColor'], campaign['theme']?.primary || '#246f65')};--hc-donor-title:${hexColor(d['headingColor'], '#203a36')};--hc-donor-text:${hexColor(d['textColor'], '#344e49')};`;
  }

  ngOnDestroy(): void { this.blocks.release(this.host); }

  // ---- toolbar ------------------------------------------------------------------------------

  setView(view: CollectionView): void {
    this.blocks.donorView = view;
    this.blocks.refreshDonors();
  }

  search(event: Event): void {
    this.state.search = (event.target as HTMLInputElement).value;
    this.state.extra = 0;
    this.blocks.refreshDonors({ keepFocus: true });
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen = this.expanded = !this.menuOpen;
    this.cdr.detectChanges();
  }

  sortBy(event: Event, sort: string): void {
    event.stopPropagation();
    this.state.sortOverride = sort;
    this.state.extra = 0;
    this.blocks.refreshDonors();
  }

  /** Three more donors. The click goes on to the preview, which leaves `[data-load]` alone. */
  more(): void {
    this.state.extra += 3;
    this.blocks.refreshDonors();
  }

  // ---- CollectionBlock ----------------------------------------------------------------------

  /**
   * The carousel global on this block. The nav is added on the first call, as the old function
   * created it then: a new block gets it from the preview observer, 30 ms after it is inserted
   * (so the exported page, cloned right after a render, still has none).
   */
  syncCarousel(): void {
    if (!this.navShown) { this.navShown = true; this.cdr.detectChanges(); }
    this.nav?.sync();
  }

  hideMenu(aria: boolean): void {
    if (!this.menuOpen && !(aria && this.expanded)) return;
    this.menuOpen = false;
    if (aria) this.expanded = false;
    this.cdr.detectChanges();
  }
}
