import { Injectable, OnDestroy } from '@angular/core';
import { studioClearInterval, studioInterval } from '../../core/studio-session';

/** A gallery the page renders (StoryGalleryComponent): shows a slide itself, instead of the DOM being changed. */
export interface SlideView { show(index: number): void; }

/** `auto`: a slideshow (the clock advances it); a carousel only moves with its arrows. */
interface SlideState { index: number; seconds: number; nextAt: number; auto?: boolean; }

const SLIDESHOWS = '.sb-gallery.slideshow[data-sb-slideshow]';
const STEPPABLE = '.sb-gallery.slideshow[data-sb-slideshow],.sb-gallery.carousel[data-sb-slideshow]';

/**
 * The Story Builder's slideshows (v4.51; the core's `sbSlideState`, `sbApplySlide`, `sbStepSlide`, `sbInitSlides`
 * and `sbClearSlides`, which the core now calls through `window.hamStorySlides`). A gallery's slide is keyed by
 * its story-block id, so a render keeps it; galleries with the same id (the page and the Story Builder's canvas)
 * show the same slide.
 *
 * The galleries are found as before, in document order (the page, the canvas, a hidden export copy). A gallery
 * that the page renders (registered by StoryGalleryComponent) shows the slide itself; any other (the canvas, still
 * the core's markup, and copies of the page) gets the classes and the count written, as before.
 */
@Injectable({ providedIn: 'root' })
export class StorySlidesService implements OnDestroy {
  private readonly state = new Map<string, SlideState>();
  private readonly views = new Map<Element, SlideView>();
  private clock: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    this.clear();
  }

  register(host: Element, view: SlideView): void { this.views.set(host, view); }
  unregister(host: Element): void { this.views.delete(host); }

  /** The Story Builder's seconds slider (it changed the state directly): the timer restarts with the new time. */
  setSeconds(id: string, seconds: number): void {
    const st = this.state.get(id);
    if (st) { st.seconds = seconds; st.nextAt = performance.now() + seconds * 1000; }
  }

  /** Old `sbClearSlides`. */
  clear(): void {
    if (this.clock !== null) { studioClearInterval(this.clock); this.clock = null; }
    this.state.clear();
  }

  /** Old `sbApplySlide`. */
  private apply(g: Element, index: number): void {
    const imgs = Array.from(g.querySelectorAll('img'));
    if (!imgs.length) return;
    const i = ((index % imgs.length) + imgs.length) % imgs.length;
    const view = this.views.get(g);
    if (view) { view.show(i); return; }
    imgs.forEach((img, j) => img.classList.toggle('sb-gallery-active', j === i));
    const count = g.querySelector('.sb-gallery-count');
    if (count) count.textContent = `${i + 1} / ${imgs.length}`;
  }

  /** Old `sbStepSlide` (the prev / next buttons; the core's document handler calls it). */
  step(g: HTMLElement, step = 1): void {
    const id = g.dataset['sbSlideshow'];
    const imgs = g.querySelectorAll('img');
    if (!id || imgs.length < 2) return;
    const now = performance.now();
    const seconds = Math.max(0.5, Math.min(30, Number(g.dataset['sbSeconds']) || 3.5));
    const st = this.state.get(id) || { index: 0, nextAt: now + seconds * 1000, seconds, auto: g.matches(SLIDESHOWS) };
    st.index = (st.index + step + imgs.length) % imgs.length;
    st.nextAt = now + seconds * 1000;
    st.seconds = seconds;
    this.state.set(id, st);
    document.querySelectorAll<HTMLElement>(STEPPABLE).forEach(other => { if (other.dataset['sbSlideshow'] === id) this.apply(other, st.index); });
  }

  /**
   * Old `sbInitSlides` (after each render of the page or of the canvas). v4.55 (known bug 7): a carousel's slide is
   * kept too (it was forgotten here, so a render after its arrow, which selects the story, showed the first image
   * again). A carousel gets no state until its arrow is used, and the clock does not advance it.
   */
  init(): void {
    const galleries = Array.from(document.querySelectorAll<HTMLElement>(STEPPABLE));
    const now = performance.now();
    const live = new Set<string>();
    for (const g of galleries) {
      if (g.querySelectorAll('img').length < 2) continue;
      const id = g.dataset['sbSlideshow']!;
      const auto = g.matches(SLIDESHOWS);
      let st = this.state.get(id);
      if (!auto) { if (st) { live.add(id); st.auto = false; this.apply(g, st.index); } continue; }
      live.add(id);
      const seconds = Math.max(0.5, Math.min(30, Number(g.dataset['sbSeconds']) || 3.5));
      if (!st) { st = { index: 0, seconds, nextAt: now + seconds * 1000 }; this.state.set(id, st); }
      st.auto = true;
      if (st.seconds !== seconds) { st.seconds = seconds; st.nextAt = now + seconds * 1000; }
      this.apply(g, st.index);
    }
    for (const id of this.state.keys()) if (!live.has(id)) this.state.delete(id);
    if (this.clock === null) {
      this.clock = studioInterval(() => {
        if (document.hidden) return;
        const now = performance.now();
        for (const [id, st] of this.state) {
          if (!st.auto || now < st.nextAt) continue;
          const related = Array.from(document.querySelectorAll<HTMLElement>(SLIDESHOWS)).filter(g => g.dataset['sbSlideshow'] === id && g.querySelectorAll('img').length > 1);
          if (!related.length) { this.state.delete(id); continue; }
          const count = related[0].querySelectorAll('img').length;
          st.index = (st.index + 1) % count;
          st.nextAt = now + st.seconds * 1000;
          related.forEach(g => this.apply(g, st.index));
        }
      }, 100);
    }
  }
}
