import { ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { PagePart } from '../parts/page-part';
import { CampaignStateService } from '../../core/campaign-state.service';
import { hexColor } from '../../core/campaign-style';
import { CollectionHeaderComponent, CollectionView } from '../../collections/collection-header.component';
import { AmbassadorCardComponent } from '../cards/ambassador-card.component';
import { CardData } from '../cards/card-format';
import { CommentCardComponent } from '../cards/comment-card.component';
import { RewardTileComponent } from '../cards/reward-tile.component';
import { UpdateCardComponent } from '../cards/update-card.component';
import { CollectionBlock, CollectionBlocksService, ContentKind, ContentViewState } from './collection-blocks.service';
import { CollectionNavComponent } from './collection-nav.component';
import { headingStyle, presentationFor, raw, rewardStyleVars } from './collection-style';

const TITLES: Record<ContentKind, string> = { ambassadors: 'שגרירים', comments: 'תגובות', updates: 'עדכונים', rewards: 'תשורות' };

/** Sort options of the public toolbar, per kind. */
function sortChoices(kind: ContentKind, personal: boolean): [string, string][] {
  if (kind === 'rewards') return [['recent', 'סדר הוספה'], ['amount-high', 'סכום גבוה'], ['amount-low', 'סכום נמוך'], ['name', 'שם א–ת']];
  if (kind === 'ambassadors') return [['recent', 'סדר הוספה'], ['oldest', 'מהישן לחדש'], ['name', 'שם א–ת'], ...(personal ? [['raised', 'סכום גיוס'] as [string, string]] : [])];
  if (kind === 'comments') return [['recent', 'מהחדש לישן'], ['oldest', 'מהישן לחדש'], ['name', 'שם א–ת']];
  return [['recent', 'מהחדש לישן'], ['oldest', 'מהישן לחדש'], ['name', 'כותרת א–ת']];
}

/** The records a content block lists, before the toolbar's search and sort. */
function sourceRecords(kind: ContentKind, campaign: CardData): CardData[] {
  const cfg = campaign['content'][kind] || {}, modules = campaign['management']?.modules;
  if (kind === 'rewards') return cfg.items || [];
  if (kind === 'ambassadors') {
    const items = modules?.ambassadors?.items;
    return Array.isArray(items) ? items.map((r: CardData, i: number) => ({ ...r, _i: i })) : [];
  }
  if (kind === 'comments') return (modules?.comments?.items || []).filter((r: CardData) => r['approved'] !== false);
  // Updates: the inspector's own update first, then the manager's; no drafts or placeholders; pinned first.
  const data = [cfg, ...(modules?.updates?.items || [])].map((r: CardData, i: number): CardData => ({ ...r, _sourceIndex: i }))
    .filter(r => r['status'] !== 'draft' && (r['title'] || r['text']) && String(r['title'] || '').trim() !== 'כאן תופיע כותרת העדכון');
  data.sort((a, b) => Number(!!b['pinned']) - Number(!!a['pinned']));
  return data;
}

/** The toolbar's search keeps this record (`query`: trimmed, lower case; '' keeps every record). */
export function contentMatches(item: CardData, query: string): boolean {
  if (!query) return true;
  return [item['name'], item['title'], item['text'], item['dedication'], item['description']].some(v => String(v || '').toLocaleLowerCase('he').includes(query));
}

/**
 * A content block of the public page: rewards, ambassadors, updates or comments (old core
 * `hamContentCollection` with `rewardsMarkup`, `ambassadorMarkup`, `updatesMarkup`,
 * `commentsMarkup`, and its document handlers).
 *
 * The host is the block's own `<section class="hc-public-collection hc-content-collection …">`
 * (no wrapper element): the header with the view buttons, the search and the sort menu, the
 * `.hc-items` track with the card components, and the carousel nav after the track. The block reads
 * the campaign and the toolbar state when it is rendered; a toolbar change renders it again
 * (`CollectionBlocksService.refreshContent`).
 */
@Component({
  selector: 'section[ham-content-collection]',
  standalone: true,
  imports: [CollectionHeaderComponent, CollectionNavComponent, RewardTileComponent, AmbassadorCardComponent, UpdateCardComponent, CommentCardComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.class]': "'hc-public-collection hc-collection hc-content-collection hc-content-' + kind",
    '[attr.data-hcc-kind]': 'kind',
    '[attr.data-hc-mode]': 'state.view',
    '[attr.data-hc-preset]': 'preset',
    '[attr.data-hc-text]': 'textDensity',
    '[attr.data-hc-image]': 'imagePosition',
    '[attr.style]': 'styleVars',
    dir: 'rtl'
  },
  template: `<div ham-collection-header [heading]="title" [headingStyle]="headingCss" [view]="state.view" [hasFilters]="true" (viewChange)="setView($event)"><div class="hc-content-filters" role="search" [attr.aria-label]="'חיפוש ומיון ' + title"><label class="hc-content-search"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.2 4.2"/></svg><input [attr.data-hcc-search]="kind" type="search" placeholder="חיפוש..." [attr.value]="state.search" [attr.aria-label]="'חיפוש ' + title" autocomplete="off" (input)="search($event)"></label><div class="hc-content-sort"><button type="button" class="hc-content-sort-trigger" [attr.data-hcc-sort-trigger]="kind" [attr.aria-label]="'מיון ' + title" [attr.aria-expanded]="expanded" aria-haspopup="listbox" (click)="toggleMenu($event)"><svg class="hc-sort-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16m0-16L4 8m4-4 4 4M16 20V4m0 16-4-4m4 4 4-4"/></svg><span>מיון</span><svg class="hc-sort-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="hc-content-sort-menu" role="listbox" [hidden]="!menuOpen">@for (choice of choices; track choice[0]) {<button type="button" role="option" [attr.data-hcc-sort-option]="kind" [attr.data-sort]="choice[0]" [attr.aria-selected]="state.sort === choice[0]" (click)="sortBy($event, choice[0])">{{ choice[1] }}@if (state.sort === choice[0]) {<span aria-hidden="true">✓</span>}</button>}</div></div></div></div>@for (k of [renderKey]; track k) {<div #track class="hc-items">@for (r of items; track r; let i = $index) {@switch (kind) {@case ('ambassadors') {<article ham-ambassador-card [item]="r" [cfg]="cfg" [index]="i" [layout]="state.view === 'list' ? 'list' : 'cards'" [personal]="personal" [collection]="true"></article>}@case ('comments') {<article ham-comment-card [item]="r" [cfg]="commentCfg" [collection]="true"></article>}@case ('updates') {<article ham-update-card [item]="r" [cfg]="cfg" [index]="i" [collection]="true"></article>}@case ('rewards') {<article ham-reward-tile [item]="r" [cfg]="cfg" [index]="r['_hcInitialIndex']" [collection]="true" [live]="true"></article>}}} @empty {<p class="hc-content-empty">אין {{ title }} להצגה.</p>}</div>}@if (navShown) {<nav ham-collection-nav [track]="trackRef!.nativeElement" [active]="state.view === 'carousel'"></nav>}`
})
export class ContentCollectionComponent extends PagePart implements OnInit, OnDestroy, CollectionBlock {
  private readonly blocks = inject(CollectionBlocksService);
  private readonly campaignState = inject(CampaignStateService);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  @ViewChild(CollectionNavComponent) private nav?: CollectionNavComponent;
  @ViewChild('track') trackRef?: ElementRef<HTMLElement>;
  /** A new track on each render (its cards and its scroll position were new): `@for` over this key. */
  renderKey = 0;

  @Input({ required: true }) kind!: ContentKind;
  /** The preview's device when the core built the page (presentation, card sizes). */
  @Input() device = 'mobile';

  state!: ContentViewState;
  title = '';
  cfg: CardData = {};
  commentCfg: CardData = {};
  personal = false;
  choices: [string, string][] = [];
  items: CardData[] = [];
  headingCss: string | null = null;
  styleVars = '';
  preset = 'balanced';
  textDensity = 'full';
  imagePosition = 'top';
  /** The sort menu is shown; `expanded` is its trigger's `aria-expanded` (Escape hides the menu only). */
  menuOpen = false;
  expanded = false;
  /** The carousel nav exists (see `syncCarousel`). */
  navShown = false;

  ngOnInit(): void {
    this.render();
    this.blocks.own(this.host, this);
  }

  /**
   * The block from the campaign and its toolbar's state (v4.53: also again in place, on a page render and on a
   * toolbar change). What a new block started with comes back: the sort menu closed, no carousel nav until the
   * carousel global runs on the block, the track at its first card.
   */
  protected render(): void {
    const kind = this.kind, campaign = this.campaignState.current as CardData;
    this.menuOpen = this.expanded = this.navShown = false;
    this.renderKey++;
    this.state = this.blocks.content[kind];
    this.title = TITLES[kind];
    this.cfg = campaign['content'][kind] || {};
    this.commentCfg = { ...this.cfg, showAvatars: false, showLikes: false };
    const ambassadors = campaign['management']?.modules?.ambassadors;
    this.personal = ambassadors?.publicAmounts === true || !(ambassadors?.items || []).length;
    this.choices = sortChoices(kind, this.personal);
    this.items = this.arrange(sourceRecords(kind, campaign));
    this.headingCss = kind === 'rewards' ? headingStyle(this.cfg, kind, raw) : null;
    this.styleVars = this.vars(campaign);
    const presentation = presentationFor(campaign, kind, this.device);
    this.preset = ['compact', 'balanced', 'wide', 'two'].includes(presentation.preset) ? presentation.preset : 'balanced';
    this.textDensity = ['full', 'two', 'one', 'hide'].includes(presentation.text) ? presentation.text : 'full';
    this.imagePosition = kind === 'rewards' ? presentation.imagePosition : 'top';
  }

  /** A toolbar change (CollectionBlocksService `refreshContent`): the block again, at once. */
  refresh(): void { this.render(); this.update(); }

  ngOnDestroy(): void { this.blocks.release(this.host); }

  /** The toolbar's search and sort over the records. */
  private arrange(records: CardData[]): CardData[] {
    const { search, sort } = this.state, kind = this.kind;
    const query = search.trim().toLocaleLowerCase('he');
    const data = records.map((item, index): CardData => ({ ...item, _hcInitialIndex: index })).filter(item => contentMatches(item, query));
    if (sort === 'name') data.sort((a, b) => String(a['name'] || a['title'] || '').localeCompare(String(b['name'] || b['title'] || ''), 'he'));
    else if (sort === 'oldest') data.reverse();
    else if (sort === 'raised' && kind === 'ambassadors') data.sort((a, b) => Number(b['raised'] || 0) - Number(a['raised'] || 0));
    else if (sort === 'amount-high' && kind === 'rewards') data.sort((a, b) => Number(b['amount'] || 0) - Number(a['amount'] || 0));
    else if (sort === 'amount-low' && kind === 'rewards') data.sort((a, b) => Number(a['amount'] || 0) - Number(b['amount'] || 0));
    return data;
  }

  /** Theme and inspector values of the cards, as CSS variables on the block. */
  private vars(campaign: CardData): string {
    const cfg = this.cfg, primary = campaign['theme']?.primary || '#246f65';
    const safeColor = (value: unknown, fallback: string) => hexColor(value, fallback);
    const safeNumber = (value: unknown, fallback: number, min: number, max: number) => {
      const n = Number(value); return Math.min(max, Math.max(min, Number.isFinite(n) && value !== '' && value != null ? n : fallback));
    };
    const variable = (name: string, value: string) => `${name}:${value};`;
    let css = variable('--hc-gap', safeNumber(cfg['gap'], 10, 0, 36) + 'px');
    if (this.kind === 'rewards') {
      css += rewardStyleVars(campaign, cfg, this.device, raw) +
        variable('--reward-bg', safeColor(cfg['cardBg'], '#fff')) +
        variable('--reward-accent', safeColor(cfg['accentColor'], primary));
    } else if (this.kind === 'ambassadors') {
      css += variable('--hc-card-bg', safeColor(cfg['cardBg'], '#fafcfb')) +
        variable('--hc-card-border', safeColor(cfg['borderColor'], '#e3e9e6')) +
        variable('--hc-card-radius', safeNumber(cfg['radius'], 13, 0, 40) + 'px') +
        variable('--hc-card-accent', safeColor(cfg['accentColor'], primary));
    } else if (this.kind === 'updates') {
      css += variable('--hc-card-bg', safeColor(cfg['cardBg'], '#fff')) +
        variable('--hc-card-border', safeColor(cfg['borderColor'], '#e0e8e4')) +
        variable('--hc-card-radius', safeNumber(cfg['radius'], 13, 0, 40) + 'px') +
        variable('--hc-card-title', safeColor(cfg['titleColor'], '#24463b')) +
        variable('--hc-card-text', safeColor(cfg['textColor'], '#62746d'));
    } else {
      css += variable('--hc-card-bg', safeColor(cfg['cardBg'], '#f9fbfa')) +
        variable('--hc-card-border', safeColor(cfg['borderColor'], '#dfe9e3')) +
        variable('--hc-card-radius', safeNumber(cfg['radius'], 14, 0, 40) + 'px') +
        variable('--hc-card-title', safeColor(cfg['nameColor'], '#23493f')) +
        variable('--hc-card-text', safeColor(cfg['textColor'], '#344b43'));
    }
    return css;
  }

  // ---- toolbar ------------------------------------------------------------------------------

  setView(view: CollectionView): void {
    this.state.view = view;
    this.blocks.refreshContent(this.kind);
  }

  search(event: Event): void {
    this.state.search = (event.target as HTMLInputElement).value;
    this.blocks.refreshContent(this.kind, { keepFocus: true });
  }

  /** Opens this block's sort menu (every other content menu is hidden), or closes it. */
  toggleMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const opening = !this.menuOpen;
    this.blocks.hideContentMenus(false);
    this.menuOpen = this.expanded = opening;
    this.cdr.detectChanges();
  }

  sortBy(event: Event, sort: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.state.sort = sort;
    this.blocks.refreshContent(this.kind);
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
