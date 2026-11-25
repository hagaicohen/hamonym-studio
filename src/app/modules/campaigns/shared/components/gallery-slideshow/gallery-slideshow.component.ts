import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgZone, OnChanges, OnDestroy, inject } from '@angular/core';
import { HmPublicTextPipe } from '../../../../../core/i18n/content-language';
import { GalleryBlockData } from '../../../services/campaign-studio-state.service';

export const SLIDESHOW_INTERVAL = { min: 2, max: 30, default: 5 } as const;

export function slideshowInterval(data: Pick<GalleryBlockData, 'intervalSeconds'>): number {
  const s = data.intervalSeconds;
  return typeof s === 'number' && Number.isFinite(s) ? Math.min(SLIDESHOW_INTERVAL.max, Math.max(SLIDESHOW_INTERVAL.min, Math.round(s))) : SLIDESHOW_INTERVAL.default;
}

// The gallery's "slideshow" style: one image at a time, arrows, dots, and an
// optional automatic advance. The timer runs outside Angular and re-renders
// only this view; it pauses while the pointer or keyboard focus is on it, and
// never runs for visitors who ask for reduced motion.
@Component({
  selector: 'app-gallery-slideshow',
  standalone: true,
  imports: [HmPublicTextPipe],
  templateUrl: './gallery-slideshow.component.html',
  styleUrl: './gallery-slideshow.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-transition]': "data.transition ?? 'slide'",
    '(mouseenter)': 'paused = true',
    '(mouseleave)': 'paused = false',
    '(focusin)': 'paused = true',
    '(focusout)': 'paused = false',
  },
})
export class GallerySlideshowComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) data!: GalleryBlockData;
  @Input() aspect = '16 / 9';

  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  index = 0;
  paused = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  get items() { return this.data?.items ?? []; }

  ngOnChanges(): void {
    if (this.index >= this.items.length) this.index = 0;
    this.restart();
  }

  ngOnDestroy(): void { this.stop(); }

  private reducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private restart(): void {
    this.stop();
    if (!this.data?.autoPlay || this.items.length < 2 || this.reducedMotion()) return;
    const ms = slideshowInterval(this.data) * 1000;
    this.zone.runOutsideAngular(() => {
      this.timer = setInterval(() => {
        if (this.paused || document.hidden) return;
        this.index = (this.index + 1) % this.items.length;
        this.cdr.detectChanges();
      }, ms);
    });
  }

  go(i: number): void {
    const n = this.items.length;
    if (!n) return;
    this.index = ((i % n) + n) % n;
    this.restart();
  }

  // Arrow keys follow the reading direction (RTL: ← is "next").
  onKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const rtl = getComputedStyle(event.currentTarget as Element).direction === 'rtl';
    const forward = (event.key === 'ArrowLeft') === rtl;
    this.go(this.index + (forward ? 1 : -1));
    event.preventDefault();
  }
}
