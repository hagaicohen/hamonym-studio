import { CardData } from './card-format';

/**
 * The donation box's amounts (old core `setupDonationAmountLayouts`, v4.48 moved here): the columns that fit the
 * box's measured width (`--db-effective-cols`, again on every resize), and in the carousel layout the
 * complete-card carousel with RTL arrows, dots and a count.
 *
 * v4.53: the measurement and the carousel's state are here; DonationBoxComponent renders them (its arrows, dots,
 * count and the variable were written into its DOM). `conf` is `content.donate` for the current device (the core's
 * `dbStyleForDevice`), the box's own input.
 */

/** The columns that fit: the configured count, fewer when the cards' minimum width does not fit the track. */
export function fittedColumns(box: HTMLElement, track: HTMLElement, conf: CardData): number {
  const desired = Math.max(1, Math.min(5, Number(conf['boxColumns']) || 2));
  const gap = Math.max(0, Math.min(30, Number(conf['boxGap']) || 9));
  const minimum = conf['boxCardPresentation'] === 'meaning' ? 143 : conf['boxShape'] === 'circle' ? Math.max(80, Number(conf['boxCardHeight']) || 78) : 84;
  const available = track.clientWidth || box.clientWidth - 40;
  const fitted = Math.max(1, Math.floor((available + gap) / (minimum + gap)));
  return Math.max(1, Math.min(desired, fitted));
}

/**
 * The carousel's state (old `updateUI`): the arrows and the footer are shown when there is more than one position;
 * the arrows' disabled state, the count and up to six dots around the current card are set only then (until the
 * first update a new box showed its arrows enabled, an empty count and no dots).
 */
export class DonationCarousel {
  current = 0;
  maxIndex = 0;
  hidden = false;
  prevDisabled = false;
  nextDisabled = false;
  count = '';
  dots: number[] = [];

  reset(): void {
    this.current = this.maxIndex = 0;
    this.hidden = this.prevDisabled = this.nextDisabled = false;
    this.count = '';
    this.dots = [];
  }

  /** `cards`: the amounts; `perView`: the cards shown at once (the effective columns, at most the cards). */
  update(cards: number, perView: number): void {
    this.maxIndex = Math.max(0, cards - perView);
    this.current = Math.min(this.current, this.maxIndex);
    const enabled = this.maxIndex > 0;
    this.hidden = !enabled;
    if (!enabled) return;
    this.prevDisabled = this.current <= 0;
    this.nextDisabled = this.current >= this.maxIndex;
    this.count = `${this.current + 1} / ${cards}`;
    const start = this.maxIndex < 6 ? 0 : Math.max(0, Math.min(this.maxIndex - 5, this.current - 2));
    this.dots = Array.from({ length: Math.min(6, this.maxIndex - start + 1) }, (_, i) => start + i);
  }
}
