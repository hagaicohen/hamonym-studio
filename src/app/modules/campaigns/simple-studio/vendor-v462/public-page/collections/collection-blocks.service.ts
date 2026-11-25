import { Injectable, OnDestroy, inject } from '@angular/core';
import { CampaignStateService } from '../../core/campaign-state.service';
import { CampaignCardsService } from '../campaign-cards.service';
import { CollectionView } from '../../collections/collection-header.component';
import { carouselStatus, carouselStep } from './collection-nav.component';
import { headerMarkup, viewButtonsMarkup } from './collection-markup';

import { studioListen } from '../../core/studio-session';
export type ContentKind = 'rewards' | 'ambassadors' | 'updates' | 'comments';
export const CONTENT_KINDS: readonly ContentKind[] = ['ambassadors', 'comments', 'updates', 'rewards'];

/** What the public toolbar of a content block shows (old core `hamContentCollectionStates`). */
export interface ContentViewState { view: CollectionView; search: string; sort: string; sourceLayout: string; }

/** The public donors toolbar (old core `donorsSearch`, `donorsSortOverride`, `donorsVisibleExtra`). */
export interface DonorsViewState { search: string; sortOverride: string | null; extra: number; lastLayout: string; }

/** What a block offers to the carousel global and to the menus closed from the document. */
export interface CollectionBlock {
  /** `HamonymCollection.carousel(root)` on this block: refresh the carousel nav. */
  syncCarousel(): void;
  /** Hide the sort menu; `aria` also resets the trigger's `aria-expanded`. */
  hideMenu(aria: boolean): void;
}

/** What the core provides (registered once at start). */
export interface CollectionHooks {
  /** The preview's current device. */
  device(): string;
}


/** Inspector layout → the view the public toolbar starts with (old core `hamCollectionLayoutView`). */
const LAYOUT_VIEW: Record<string, Record<string, CollectionView>> = {
  ambassadors: { cards: 'grid', leaders: 'list', list: 'list', carousel: 'carousel' },
  rewards: { cards: 'grid', compact: 'grid', list: 'list', carousel: 'carousel' },
  updates: { cards: 'grid', feed: 'list', timeline: 'list', carousel: 'carousel' },
  comments: { cards: 'grid', compact: 'grid', list: 'list', carousel: 'carousel' }
};


/**
 * The collection blocks of the public page (v4.45): the content blocks (rewards, ambassadors,
 * updates, comments: `ContentCollectionComponent`) and the donors block (`DonorsCollectionComponent`).
 *
 * - **State.** The view, search, sort and "show more" of the public toolbars live here (they were
 *   variables of the core). The blocks read them, and the campaign, when they render.
 * - **Rendering.** Since v4.46 the blocks are child components of the public page
 *   (PublicPageComponent), which first syncs each block's toolbar with the inspector's layout
 *   (`prepareContent`, `prepareDonors`). Like the cards, a block is rendered once from the state; a toolbar change renders the block again in
 *   place of the old one (`refreshContent`, `refreshDonors`), as the core did with `innerHTML`.
 *   Everything that ran after that still runs: the carousel pass, the nav refresh, the focus kept
 *   in the search field.
 * - **Document.** What has to listen on the document stays here: closing the sort menus on a click
 *   elsewhere and on Escape, and the preview observer that refreshes the carousel nav of new blocks.
 * - **Globals.** `window.HamonymCollection` (`donorCard`, `viewButtons`, `header`, `carousel`).
 */
@Injectable({ providedIn: 'root' })
export class CollectionBlocksService implements OnDestroy {
  private readonly cards = inject(CampaignCardsService);
  private readonly campaignState = inject(CampaignStateService);
  private hooks: CollectionHooks | null = null;
  private readonly blocks = new WeakMap<Element, CollectionBlock>();
  private observerTimer?: ReturnType<typeof setTimeout>;

  readonly content: Record<ContentKind, ContentViewState> = {
    ambassadors: { view: 'grid', search: '', sort: 'recent', sourceLayout: '' },
    comments: { view: 'grid', search: '', sort: 'recent', sourceLayout: '' },
    updates: { view: 'grid', search: '', sort: 'recent', sourceLayout: '' },
    rewards: { view: 'grid', search: '', sort: 'recent', sourceLayout: '' }
  };
  readonly donors: DonorsViewState = { search: '', sortOverride: null, extra: 0, lastLayout: '' };

  /** The donors view chosen in the public toolbar (v4.61: a field; formerly `window.hamPublicDonorView`). */
  donorView: string | undefined;
  /** Show every donor (the carousel view always does). The `window.hamCarouselAllItems` flag it read had no writer. */
  readonly allDonors = false;

  device(): string { return this.hooks?.device() || 'mobile'; }

  /**
   * Called by the core where it registered these handlers before (the preview exists):
   * the globals, the document listeners and the preview observer.
   */
  start(hooks: CollectionHooks): void {
    this.hooks = hooks;
    // v4.61: `window.HamonymCollection` (card markup helpers with no reader left) is no longer published.
    studioListen(document, 'click', this.onCaptureClick, true);
    studioListen(document, 'click', this.onClick);
    studioListen(document, 'keydown', this.onKeydown);
  }

  /**
   * v4.53 (old: a MutationObserver on the preview): a new collection gets its carousel nav refreshed once it is laid
   * out, 30 ms after it is rendered (so the exported page, cloned right after a render, still has none). The page
   * calls this on each render (every block is a new one for its nav), a block after a toolbar change.
   */
  rendered(): void {
    clearTimeout(this.observerTimer);
    this.observerTimer = setTimeout(() => document.getElementById('preview')?.querySelectorAll('.hc-public-collection').forEach(c => this.carousel(c)), 30);
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.onCaptureClick, true);
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('keydown', this.onKeydown);
    clearTimeout(this.observerTimer);
  }

  // ---- blocks ------------------------------------------------------------------------------

  /** A block registers its root element (for the carousel global and the menus). */
  own(root: Element, block: CollectionBlock): void { this.blocks.set(root, block); }
  release(root: Element): void { this.blocks.delete(root); }

  /**
   * Building a content block: the inspector's layout is the source of the initial view. The
   * toolbar may override the view until the layout changes (also across full re-renders).
   */
  private syncContentLayout(kind: ContentKind): void {
    const settings = this.content[kind];
    const layout = String(this.campaignState.current['content']?.[kind]?.layout || 'cards');
    if (settings.sourceLayout !== layout) {
      settings.sourceLayout = layout;
      settings.view = LAYOUT_VIEW[kind]?.[layout] || 'grid';
    }
  }

  /** Building the donors block: a new inspector layout drops the toolbar's view. */
  private syncDonorsLayout(): void {
    const layout = String(this.campaignState.current['content']?.donors?.layout || 'list');
    if (this.donors.lastLayout !== layout) {
      this.donors.lastLayout = layout;
      this.donorView = undefined;
    }
  }

  /** Before the public page renders a content block (v4.46; old `hamContentCollection`, later `contentSlot`). */
  prepareContent(kind: ContentKind): void { this.syncContentLayout(kind); }

  /** Before the public page renders the donors block (v4.46; old `donorsMarkup`, later `donorsSlot`). */
  prepareDonors(): void { this.syncDonorsLayout(); }

  /**
   * Renders a content block again from the state (old `hamUpdatePublicCollection`). v4.53: the block computes again in
   * place (it was a new block in place of the old one); what ran after that still runs.
   */
  refreshContent(kind: ContentKind, { keepFocus = false } = {}): void {
    const part = document.querySelector(`#preview [data-part="${kind}"]`);
    const root = part?.querySelector('.hc-content-collection');
    const block = root && this.blocks.get(root) as (CollectionBlock & { refresh(): void }) | undefined;
    if (!part || !block) return;
    const start = part.querySelector<HTMLInputElement>('[data-hcc-search]')?.selectionStart ?? 0;
    this.dropFocus(part);
    this.syncContentLayout(kind);
    block.refresh();
    this.rendered();
    this.carousel(root);
    if (keepFocus) this.focus(part.querySelector<HTMLInputElement>('[data-hcc-search]'), start);
  }

  /**
   * Renders the donors block again from the state (old `updateDonorsPreview`). v4.55 (known bug 5): a campaign
   * without donors shows none, as a full render does (it showed seven sample donors here).
   */
  refreshDonors({ keepFocus = false } = {}): void {
    const part = document.querySelector('#preview [data-part="donors"]');
    const root = part?.querySelector('.hc-donor-collection');
    const block = root && this.blocks.get(root) as (CollectionBlock & { refresh(items: unknown[]): void }) | undefined;
    if (!part || !block) return;
    const start = part.querySelector<HTMLInputElement>('[data-donors-search]')?.selectionStart ?? 0;
    const items = this.campaignState.current['management']?.modules?.donors?.items;
    this.dropFocus(part);
    this.syncDonorsLayout();
    block.refresh(Array.isArray(items) ? items : []);
    this.rendered();
    this.carousel(root);
    if (keepFocus) this.focus(part.querySelector<HTMLInputElement>('[data-donors-search]'), start);
  }

  /** The block was a new one: the focus inside it was lost (a search field takes it back, `keepFocus`). */
  private dropFocus(part: Element): void {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && part.contains(focused)) focused.blur();
  }

  private focus(input: HTMLInputElement | null, at: number): void {
    input?.focus();
    try { input?.setSelectionRange(at, at); } catch { /* a field type without a selection */ }
  }

  /** Hides the sort menus of the content blocks in the preview (`aria`: also their triggers' state). */
  hideContentMenus(aria: boolean): void {
    document.querySelectorAll('#preview .hc-content-collection').forEach(root => this.blocks.get(root)?.hideMenu(aria));
  }

  // ---- HamonymCollection.carousel --------------------------------------------------------

  /**
   * `HamonymCollection.carousel(root)`: a block refreshes its own nav. Any other collection
   * (`.hc-items` track, `.hc-card` cards) gets the nav and handlers the old function created.
   */
  carousel(root: Element | null | undefined): void {
    if (!root) return;
    const block = this.blocks.get(root);
    if (block) { block.syncCarousel(); return; }
    legacyCarousel(root as HTMLElement);
  }

  // ---- document listeners ------------------------------------------------------------------

  /**
   * A click outside a content block's sort control closes the content sort menus (capture, so a
   * handler that stops the click does not keep them open). A click on a content view button
   * leaves them: that block is rendered again anyway.
   */
  private readonly onCaptureClick = (e: MouseEvent): void => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('#preview .hc-content-sort,#preview .hc-content-collection [data-hc-view]')) return;
    this.hideContentMenus(true);
  };

  /** A click that reaches the document outside a donors sort control closes the donors sort menu. */
  private readonly onClick = (e: MouseEvent): void => {
    if (e.target instanceof Element && e.target.closest('.list-sort-wrap')) return;
    document.querySelectorAll('.hc-donor-collection').forEach(root => this.blocks.get(root)?.hideMenu(true));
  };

  /** Escape hides the content sort menus (their triggers keep `aria-expanded`, as before). */
  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.hideContentMenus(false);
  };
}

/**
 * The old `HamonymCollection.carousel` for a collection that is not a block (it creates the nav
 * after the track once, with its handlers). Includes the v4.45 FIX of the arrows (`carouselStep`).
 */
function legacyCarousel(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>('.hc-items');
  if (!track) return;
  let nav = root.querySelector<HTMLElement>('.hc-carousel-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'hc-carousel-nav';
    nav.setAttribute('aria-label', 'ניווט בקרוסלה');
    nav.innerHTML = '<button type="button" data-hc-prev aria-label="הקודם">‹</button><span class="hc-page-count">1 / 1</span><button type="button" data-hc-next aria-label="הבא">›</button>';
    track.after(nav);
  }
  const bar = nav;
  const refresh = () => {
    const status = carouselStatus(track);
    bar.querySelector('.hc-page-count')!.textContent = status.label;
    bar.querySelector<HTMLButtonElement>('[data-hc-prev]')!.disabled = status.prevDisabled;
    bar.querySelector<HTMLButtonElement>('[data-hc-next]')!.disabled = status.nextDisabled;
  };
  if (!bar.dataset['hcReady']) {
    bar.dataset['hcReady'] = '1';
    bar.addEventListener('click', e => {
      const button = (e.target as Element).closest('[data-hc-prev],[data-hc-next]');
      if (button) carouselStep(track, button.hasAttribute('data-hc-next') ? 1 : -1);
    });
    track.addEventListener('scroll', () => requestAnimationFrame(refresh), { passive: true });
  }
  bar.hidden = root.dataset['hcMode'] !== 'carousel';
  if (!bar.hidden) requestAnimationFrame(refresh);
}
