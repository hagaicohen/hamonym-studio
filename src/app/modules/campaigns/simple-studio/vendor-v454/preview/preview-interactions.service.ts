import { Injectable, OnDestroy } from '@angular/core';

/**
 * Angular-owned replacement for small UI legacy patches 008, 010, 018, 020, 023.
 * Original DOM structure, RTL arrows, cascade and campaign renderer remain intact.
 * Remaining preview engine migration is tracked separately.
 */
@Injectable({ providedIn: 'root' })
export class PreviewInteractionsService implements OnDestroy {
  private active = false;
  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const modeButton = target.closest<HTMLElement>('.ham-panorama-tab-panel [data-ham-view]');
    if (modeButton) {
      const panel = modeButton.closest<HTMLElement>('.ham-panorama-tab-panel');
      if (panel) {
        panel.dataset['hamViewMode'] = modeButton.dataset['hamView'] || 'grid';
        panel.querySelectorAll<HTMLElement>('[data-ham-view]').forEach(el => {
          const selected = el === modeButton;
          el.classList.toggle('ham-view-active', selected);
          el.setAttribute('aria-pressed', String(selected));
        });
        event.preventDefault();
        event.stopPropagation();
      }
    }
    if (target.closest('#preview [data-ham-view], #preview [data-ham-panorama-tab], #preview [data-ham-mobile-view]')) {
      // The existing renderer runs after the click. Apply the final original
      // arrow convention after it has finished updating the tab contents.
      setTimeout(() => this.normalizeArrows(), 0);
    }
  };

  /** Final result of old panorama alignment shims: remove obsolete locks. */
  readonly alignPanorama = (preview: HTMLElement | null = document.getElementById('preview')): void => {
    if (!preview?.matches('.desktop.layout-panorama')) return;
    preview.querySelector<HTMLElement>('.ham-story-article')?.style.removeProperty('--ham-panorama-story-height');
    preview.style.removeProperty('--ham-panorama-nav-height');
  };

  private normalizeArrows(): void {
    // Legacy 020 applied after legacy 018 for donors, so donors use ‹ / ›.
    document.querySelectorAll<HTMLElement>('#preview .ham-mini-carousel:has(.donors-items), #preview .ham-mini-carousel:has(.ham-update-grid)').forEach(wrap => {
      const previous = wrap.querySelector<HTMLElement>(':scope > [data-mini-prev]');
      const next = wrap.querySelector<HTMLElement>(':scope > [data-mini-next]');
      if (previous) { previous.textContent = '‹'; previous.setAttribute('aria-label', 'הקודם'); }
      if (next) { next.textContent = '›'; next.setAttribute('aria-label', 'הבא'); }
    });
    // Legacy 023 was registered later and overrides panorama update arrows.
    document.querySelectorAll<HTMLElement>('#preview .ham-panorama-tab-panel .ham-mini-carousel').forEach(wrap => {
      if (!wrap.querySelector(':scope > .ham-update-grid')) return;
      const previous = wrap.querySelector<HTMLElement>(':scope > [data-mini-prev]');
      const next = wrap.querySelector<HTMLElement>(':scope > [data-mini-next]');
      if (previous) { previous.textContent = '›'; previous.setAttribute('aria-label','הקודם'); previous.title = 'הקודם'; }
      if (next) { next.textContent = '‹'; next.setAttribute('aria-label','הבא'); next.title = 'הבא'; }
    });
    document.querySelectorAll<HTMLElement>('#preview .ham-mini-carousel:has(.donors-items) .donors-items').forEach(track => track.style.direction = 'rtl');
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    // These functions are called by the retained campaign renderer. Do not
    // change their names until the public preview itself is Angular-owned.
    (window as Window & {hamAlignPanoramaColumns?: (preview?: HTMLElement | null) => void}).hamAlignPanoramaColumns = this.alignPanorama;
    document.addEventListener('click', this.onClick, true);
    this.normalizeArrows();
  }

  ngOnDestroy(): void {
    if (!this.active) return;
    this.active = false;
    document.removeEventListener('click', this.onClick, true);
  }
}
