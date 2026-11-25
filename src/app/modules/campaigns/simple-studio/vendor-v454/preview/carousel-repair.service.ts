import { Injectable, OnDestroy } from '@angular/core';
import { PanoramaInlineCarouselService } from './panorama-inline-carousel.service';

/**
 * Replaces the cumulative public-carousel patch scripts 016, 017 and 019.
 * The existing campaign renderer still creates the cards and miniature tracks;
 * Angular takes ownership only of their post-render repair lifecycle.
 */
@Injectable({providedIn: 'root'})
export class CarouselRepairService implements OnDestroy {
  constructor(private readonly panoramaInline: PanoramaInlineCarouselService) {}
  private running = false;
  private observer?: MutationObserver;
  private animationFrame = 0;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly panelSelector = '#preview .ham-panorama-tab-panel[data-ham-view-mode="carousel"], #preview .ham-mobile-tab-panel[data-display-mode="carousel"]';

  private refreshOriginal(): void {
    (window as Window & {ham112RefreshCarousels?: () => void}).ham112RefreshCarousels?.();
  }

  private unwrapOldLayers(panel: HTMLElement): void {
    panel.querySelectorAll<HTMLElement>('.ham-inline-carousel').forEach(layer => {
      layer.querySelectorAll(':scope > .ham-inline-arrow').forEach(arrow => arrow.remove());
      const parent = layer.parentNode;
      if (!parent) return;
      while (layer.firstChild) parent.insertBefore(layer.firstChild, layer);
      layer.remove();
    });
    panel.querySelectorAll<HTMLElement>('.ham-mini-carousel .ham-mini-carousel').forEach(inner => {
      const outer = inner.parentElement;
      const track = inner.querySelector<HTMLElement>('[data-ham-arrow-track]');
      if (!outer || !track) return;
      outer.insertBefore(track, inner);
      inner.remove();
    });
  }

  private revealCards(panel: HTMLElement): void {
    panel.querySelectorAll<HTMLElement>('[data-public-index]').forEach(item => item.style.removeProperty('display'));
    panel.querySelectorAll<HTMLElement>('.is-hidden,[hidden]').forEach(item => {
      if (item.closest('[data-load],[data-amb-more],[data-public-more]')) return;
      if (!item.matches('.ambassador-card,.donors-entry,.ham-update-card,.ham-comment-card')) return;
      item.hidden = false;
      item.classList.remove('is-hidden');
      item.style.removeProperty('display');
    });
  }

  private resetTrack(panel: HTMLElement): void {
    const wrap = panel.querySelector<HTMLElement>('.ham-mini-carousel');
    const track = panel.querySelector<HTMLElement>('.ham-mini-carousel [data-ham-arrow-track],.ham-mini-carousel .ambassador-collection,.ham-mini-carousel .donors-items,.ham-mini-carousel .ham-update-grid');
    if (!track) return;
    try { track.scrollTo({left: 0, behavior: 'auto'}); } catch { track.scrollLeft = 0; }
    if (wrap) wrap.dataset['index'] = '0';
  }

  private normalizeMiniCarousel(panel: HTMLElement, resetPosition: boolean): void {
    const wrap = panel.querySelector<HTMLElement>('.ham-mini-carousel');
    const track = wrap?.querySelector<HTMLElement>('[data-ham-arrow-track]');
    if (!wrap || !track) return;
    const updates = !!panel.querySelector('.ham-update-grid');
    track.style.direction = updates ? 'rtl' : 'ltr';
    Array.from(track.children).forEach(card => {
      if (card instanceof HTMLElement) card.style.direction = 'rtl';
    });
    const prev = wrap.querySelector<HTMLElement>('[data-mini-prev]');
    const next = wrap.querySelector<HTMLElement>('[data-mini-next]');
    if (prev) {
      prev.textContent = updates ? '›' : '‹';
      prev.setAttribute('aria-label', 'הקודם');
    }
    if (next) {
      next.textContent = updates ? '‹' : '›';
      next.setAttribute('aria-label', 'הבא');
    }
    // Do not recreate tracks, cards or handlers: those still belong to the original renderer.
    if (resetPosition) this.resetTrack(panel);
  }

  private repair(resetPosition: boolean): void {
    if (!this.running) return;
    document.querySelectorAll<HTMLElement>(this.panelSelector).forEach(panel => {
      this.unwrapOldLayers(panel);
      if (resetPosition) this.revealCards(panel);
    });
    this.refreshOriginal();
    // The source carousel refresh can create its miniature wrappers.
    document.querySelectorAll<HTMLElement>(this.panelSelector).forEach(panel => {
      this.normalizeMiniCarousel(panel, resetPosition);
    });
    this.refreshOriginal();
    this.panoramaInline.refresh();
  }

  private schedule(): void {
    if (!this.running || this.animationFrame) return;
    this.animationFrame = requestAnimationFrame(() => {
      this.animationFrame = 0;
      this.repair(false);
    });
  }

  private readonly onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('#preview [data-ham-view],#preview [data-ham-mobile-view],#preview [data-ham-panorama-tab],#preview [data-ham-mobile-tab]')) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.repair(true);
    }, 0);
    this.timers.add(timer);
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    const preview = document.getElementById('preview');
    if (preview) {
      this.observer = new MutationObserver(records => {
        if (records.some(record => record.type === 'attributes' || Array.from(record.addedNodes).some(node =>
          node instanceof Element && (node.matches('.ham-inline-carousel,.ham-mini-carousel,.ham-panorama-tab-panel,.ham-mobile-tab-panel') || !!node.querySelector('.ham-inline-carousel,.ham-mini-carousel'))))) {
          this.schedule();
        }
      });
      this.observer.observe(preview, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-ham-view-mode','data-display-mode']});
    }
    document.addEventListener('click', this.onClick, true);
    this.repair(true);
  }

  ngOnDestroy(): void {
    this.running = false;
    document.removeEventListener('click', this.onClick, true);
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}
