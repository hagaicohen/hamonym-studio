import { Injectable, OnDestroy } from '@angular/core';

/**
 * Owns the Panorama inline carousel previously installed by legacy 012.js.
 * Preserves the existing preview DOM/CSS contract until the campaign renderer
 * can be converted to Angular templates.
 */
@Injectable({ providedIn: 'root' })
export class PanoramaInlineCarouselService implements OnDestroy {
  private started = false;
  private raf = new Set<number>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly panels = '#preview.preview.desktop.layout-panorama .ham-panorama-tab-panel';
  private readonly tracks = '.donors-items,.ambassador-collection,.ham-comment-grid,.ham-update-grid';
  private readonly onResize = (): void => this.refresh();
  private readonly onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element) || !event.target.closest(`${this.panels} [data-ham-view]`)) return;
    const timer = setTimeout(() => { this.timers.delete(timer); this.refresh(); }, 0);
    this.timers.add(timer);
  };

  private children(track: HTMLElement): HTMLElement[] {
    return Array.from(track.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
  }
  private visibleCount(track: HTMLElement): number {
    const children = this.children(track);
    if (!children.length) return 1;
    const width = children[0].getBoundingClientRect().width || 1;
    const gap = parseFloat(getComputedStyle(track).gap || '12') || 12;
    return Math.max(1, Math.round((track.clientWidth + gap) / (width + gap)));
  }
  private nearestIndex(track: HTMLElement): number {
    const right = track.getBoundingClientRect().right;
    let best = 0, distance = Infinity;
    this.children(track).forEach((item, index) => {
      const candidate = Math.abs(item.getBoundingClientRect().right - right);
      if (candidate < distance) { distance = candidate; best = index; }
    });
    return best;
  }
  private update(wrap: HTMLElement): void {
    const track = wrap.querySelector<HTMLElement>('.ham-inline-carousel-track');
    if (!track) return;
    const max = Math.max(0, this.children(track).length - this.visibleCount(track));
    const index = Math.max(0, Math.min(max, this.nearestIndex(track)));
    wrap.dataset['hamIndex'] = String(index);
    wrap.classList.toggle('no-nav', max <= 0);
    const previous = wrap.querySelector<HTMLButtonElement>('.ham-inline-arrow.prev');
    const next = wrap.querySelector<HTMLButtonElement>('.ham-inline-arrow.next');
    if (previous) previous.disabled = index <= 0;
    if (next) next.disabled = index >= max;
  }
  private move(wrap: HTMLElement, delta: number): void {
    const track = wrap.querySelector<HTMLElement>('.ham-inline-carousel-track');
    if (!track) return;
    const children = this.children(track);
    if (!children.length) return;
    const max = Math.max(0, children.length - this.visibleCount(track));
    const next = Math.max(0, Math.min(max, Number(wrap.dataset['hamIndex'] || '0') + delta));
    const offset = children[next].getBoundingClientRect().right - track.getBoundingClientRect().right;
    track.scrollBy({left: offset, behavior: 'smooth'});
    wrap.dataset['hamIndex'] = String(next);
    this.queueUpdate(wrap);
  }
  private queueUpdate(wrap: HTMLElement): void {
    const frame = requestAnimationFrame(() => { this.raf.delete(frame); if (this.started && wrap.isConnected) this.update(wrap); });
    this.raf.add(frame);
  }
  private makeArrow(wrap: HTMLElement, direction: 'prev'|'next', label: string, path: string): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ham-inline-arrow ${direction}`;
    button.setAttribute('aria-label', label);
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    icon.appendChild(shape);
    button.appendChild(icon);
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      this.move(wrap, direction === 'prev' ? -1 : 1);
    });
    wrap.appendChild(button);
  }
  private ensure(panel: HTMLElement): void {
    const track = panel.querySelector<HTMLElement>(this.tracks);
    if (!track || !track.parentElement) return;
    let wrap = track.parentElement;
    if (!wrap.classList.contains('ham-inline-carousel')) {
      wrap = document.createElement('div');
      wrap.className = 'ham-inline-carousel';
      track.before(wrap);
      wrap.appendChild(track);
    }
    // In case a previous renderer removed arrow nodes, restore them without duplicating.
    if (!wrap.querySelector('.ham-inline-arrow.prev')) this.makeArrow(wrap, 'prev', 'הקודם', 'm9 18 6-6-6-6');
    if (!wrap.querySelector('.ham-inline-arrow.next')) this.makeArrow(wrap, 'next', 'הבא', 'm15 18-6-6 6-6');
    track.classList.add('ham-inline-carousel-track');
    // The DOM may be reused across view toggles; bind one scroll listener per track.
    if (track.dataset['hamAngularInlineScroll'] !== '1') {
      track.dataset['hamAngularInlineScroll'] = '1';
      track.addEventListener('scroll', () => this.queueUpdate(wrap!), {passive:true});
    }
    this.update(wrap);
  }
  refresh(): void {
    if (!this.started) return;
    document.querySelectorAll<HTMLElement>(this.panels).forEach(panel => {
      if (panel.dataset['hamViewMode'] === 'carousel') this.ensure(panel);
    });
  }
  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('resize', this.onResize);
    document.addEventListener('click', this.onClick, true);
    this.refresh();
  }
  ngOnDestroy(): void {
    this.started = false;
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('click', this.onClick, true);
    this.raf.forEach(id => cancelAnimationFrame(id)); this.raf.clear();
    this.timers.forEach(id => clearTimeout(id)); this.timers.clear();
  }
}
