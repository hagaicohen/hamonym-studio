import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgZone, OnDestroy, OnInit, ViewEncapsulation, inject } from '@angular/core';

/** Cards of a track that the carousel steps through: shown `.hc-card` children. */
export function carouselCards(track: Element): HTMLElement[] {
  return Array.from(track.children).filter((el): el is HTMLElement => el instanceof HTMLElement && !el.hidden && el.matches('.hc-card'));
}

/** Index of the card aligned with the track's right edge (RTL start). */
function currentIndex(track: Element, cards: HTMLElement[]): number {
  if (!cards.length) return 0;
  const r = track.getBoundingClientRect();
  let ix = 0, d = Infinity;
  cards.forEach((c, i) => { const delta = Math.abs(c.getBoundingClientRect().right - r.right); if (delta < d) { d = delta; ix = i; } });
  return ix;
}

/** Page counter and arrow states of a track (old `HamonymCollection.carousel` refresh). */
export function carouselStatus(track: HTMLElement): { label: string; prevDisabled: boolean; nextDisabled: boolean } {
  const cards = carouselCards(track), idx = currentIndex(track, cards);
  const per = Math.max(1, Math.round(track.clientWidth / Math.max(cards[0]?.getBoundingClientRect().width || track.clientWidth, 1)));
  const pages = Math.max(1, Math.ceil(cards.length / per));
  const page = Math.min(pages, Math.floor(idx / per) + 1);
  return { label: `${cards.length ? page : 0} / ${cards.length ? pages : 0}`, prevDisabled: idx <= 0, nextDisabled: idx + per >= cards.length };
}

/**
 * Scrolls a track by one page (old `HamonymCollection.carousel` arrows).
 *
 * v4.45 FIX: a track without layout (a collection in a hidden tab) has cards of width 0, and the
 * page size was `round(0 / 0)` = NaN: the target card was `cards[NaN]` and the click threw. The
 * page size now defaults to 1, and a missing card is ignored.
 */
export function carouselStep(track: HTMLElement, direction: 1 | -1): void {
  const cards = carouselCards(track);
  if (!cards.length) return;
  const count = Math.max(1, Math.round(track.clientWidth / (cards[0].getBoundingClientRect().width || track.clientWidth))) || 1;
  cards[Math.max(0, Math.min(cards.length - 1, currentIndex(track, cards) + direction * count))]
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
}

/**
 * Carousel navigation of a public collection (old `HamonymCollection.carousel()`, which created
 * this `<nav>` after the track). As before:
 * - the block adds it the first time the carousel global runs on the block (the preview observer,
 *   30 ms after a new block is inserted; at once after a toolbar change), right after the track;
 * - it is shown in the carousel view, starts as "1 / 1" with both arrows enabled, and its counter
 *   and arrows are computed on the next frame by `sync()` and after the track scrolls;
 * - an arrow click is not stopped: it reaches the preview, which selects the block.
 * `data-hc-ready` tells the old function that this nav already has its handlers.
 */
@Component({
  selector: 'nav[ham-collection-nav]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hc-carousel-nav', 'aria-label': 'ניווט בקרוסלה', 'data-hc-ready': '1', '[hidden]': '!active' },
  template: `<button type="button" data-hc-prev aria-label="הקודם" [disabled]="prevDisabled" (click)="step(-1)">‹</button><span class="hc-page-count">{{ label }}</span><button type="button" data-hc-next aria-label="הבא" [disabled]="nextDisabled" (click)="step(1)">›</button>`
})
export class CollectionNavComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  /** The `.hc-items` track. */
  @Input({ required: true }) track!: HTMLElement;
  /** The collection shows the carousel view. */
  @Input() active = false;
  label = '1 / 1';
  prevDisabled = false;
  nextDisabled = false;
  private destroyed = false;
  private readonly onScroll = () => this.frame();

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => this.track.addEventListener('scroll', this.onScroll, { passive: true }));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.track.removeEventListener('scroll', this.onScroll);
  }

  /** The old function's call on an existing nav: refresh on the next frame when shown. */
  sync(): void { if (this.active) this.frame(); }

  step(direction: 1 | -1): void { carouselStep(this.track, direction); }

  private frame(): void { this.zone.runOutsideAngular(() => requestAnimationFrame(() => this.refresh())); }

  private refresh(): void {
    if (this.destroyed) return;
    const status = carouselStatus(this.track);
    this.label = status.label;
    this.prevDisabled = status.prevDisabled;
    this.nextDisabled = status.nextDisabled;
    this.cdr.detectChanges();
  }
}
