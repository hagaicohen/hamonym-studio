import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, NgZone, afterRender, inject, input, signal } from '@angular/core';

/**
 * Angular version of HamonymCollection.carousel(): page counter and
 * prev/next for a `.hc-items` track. Place it right after the track.
 */
@Component({
  selector: 'ham-collection-carousel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
<nav class="hc-carousel-nav" aria-label="ניווט בקרוסלה" [hidden]="!active()" [attr.data-hc-ready]="ready() ? '1' : null">
  <button type="button" data-hc-prev aria-label="הקודם" [disabled]="!canPrev()" (click)="move($event, -1)">‹</button>
  <span class="hc-page-count">{{ pageLabel() }}</span>
  <button type="button" data-hc-next aria-label="הבא" [disabled]="!canNext()" (click)="move($event, 1)">›</button>
</nav>`
})
export class CollectionCarouselComponent {
  readonly track = input.required<HTMLElement>();
  readonly active = input(false);
  /** `data-hc-ready` (the old carousel function marked a nav it had set up). */
  readonly ready = input(false);
  readonly pageLabel = signal('1 / 1');
  readonly canPrev = signal(false);
  readonly canNext = signal(true);
  private readonly zone = inject(NgZone);
  /** The page is not attached to the application (v4.53: it renders its own changes, as the old function wrote them). */
  private readonly cdr = inject(ChangeDetectorRef);
  private listening?: HTMLElement;
  private readonly onScroll = () => requestAnimationFrame(() => this.zone.run(() => this.refresh()));

  constructor() {
    afterRender(() => {
      const track = this.track();
      if (this.listening !== track) {
        this.listening?.removeEventListener('scroll', this.onScroll);
        this.zone.runOutsideAngular(() => track.addEventListener('scroll', this.onScroll, { passive: true }));
        this.listening = track;
      }
      if (this.active()) requestAnimationFrame(() => this.zone.run(() => this.refresh()));
    });
    inject(DestroyRef).onDestroy(() => this.listening?.removeEventListener('scroll', this.onScroll));
  }

  private cards(): HTMLElement[] {
    return Array.from(this.track().children).filter((el): el is HTMLElement => el instanceof HTMLElement && !el.hidden && el.matches('.hc-card'));
  }

  private perPage(cards: HTMLElement[]): number {
    const track = this.track();
    return Math.max(1, Math.round(track.clientWidth / Math.max(cards[0]?.getBoundingClientRect().width || track.clientWidth, 1)));
  }

  /** Index of the card aligned with the track's right edge (RTL start). */
  private current(cards: HTMLElement[]): number {
    if (!cards.length) return 0;
    const right = this.track().getBoundingClientRect().right;
    let index = 0, best = Infinity;
    cards.forEach((c, i) => { const d = Math.abs(c.getBoundingClientRect().right - right); if (d < best) { best = d; index = i; } });
    return index;
  }

  refresh(): void {
    const cards = this.cards(), index = this.current(cards), per = this.perPage(cards);
    const pages = Math.max(1, Math.ceil(cards.length / per));
    const page = Math.min(pages, Math.floor(index / per) + 1);
    const label = `${cards.length ? page : 0} / ${cards.length ? pages : 0}`;
    if (label !== this.pageLabel()) this.pageLabel.set(label);
    if (this.canPrev() !== index > 0) this.canPrev.set(index > 0);
    if (this.canNext() !== index + per < cards.length) this.canNext.set(index + per < cards.length);
    this.cdr.detectChanges();
  }

  move(event: Event, direction: 1 | -1): void {
    event.stopPropagation();
    const cards = this.cards();
    if (!cards.length) return;
    const target = cards[Math.max(0, Math.min(cards.length - 1, this.current(cards) + direction * this.perPage(cards)))];
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }
}
