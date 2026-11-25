import { DestroyRef, Injectable, NgZone, inject } from '@angular/core';
import { MEDIA_PREFIX } from './media.types';
import { MediaStoreService } from './media-store.service';

const REF_SELECTOR = 'img[src*="hamonymmedia:"],video[poster*="hamonymmedia:"],[style*="hamonymmedia:"]';

/**
 * Resolves `hamonymmedia:` refs that reach the DOM through markup still
 * produced by the legacy renderer. Once the preview is rendered by Angular
 * templates, those templates bind resolved URLs directly and this goes away.
 */
@Injectable({ providedIn: 'root' })
export class MediaDomPatchService {
  private readonly store = inject(MediaStoreService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private queued = false;
  private observer?: MutationObserver;

  start(): void {
    const sub = this.store.hydrated$.subscribe(() => this.schedule());
    this.zone.runOutsideAngular(() => {
      this.observer = new MutationObserver(mutations => {
        const relevant = mutations.some(m => m.type === 'childList' || m.attributeName === 'src' || m.attributeName === 'style');
        if (relevant && document.querySelector(REF_SELECTOR)) this.schedule();
      });
      this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style', 'poster'] });
    });
    this.destroyRef.onDestroy(() => { sub.unsubscribe(); this.observer?.disconnect(); });
  }

  schedule(): void {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => { this.queued = false; this.patch(document); });
  }

  patch(root: ParentNode | Element = document): void {
    const elements: Element[] = [];
    if ((root as Node).nodeType === Node.ELEMENT_NODE) elements.push(root as Element);
    elements.push(...Array.from(root.querySelectorAll(REF_SELECTOR + ',[data-ham-media-ref]')));
    for (const el of elements) {
      const ref = el.getAttribute('data-ham-media-ref');
      if (ref?.startsWith(MEDIA_PREFIX)) this.bindRef(el, ref);
      for (const attr of ['src', 'poster', 'style']) {
        const value = el.getAttribute(attr);
        if (value?.includes(MEDIA_PREFIX)) el.setAttribute(attr, String(this.store.safeMarkup(value)));
      }
    }
  }

  /** Elements marked with data-ham-media-ref get their src once the blob is loaded. */
  private bindRef(el: Element, ref: string): void {
    const url = this.store.src(ref);
    if (url) { if (el.getAttribute('src') !== url) el.setAttribute('src', url); return; }
    if (el.hasAttribute('data-ham-media-loading')) return;
    el.setAttribute('data-ham-media-loading', '');
    void this.store.read(ref).finally(() => {
      el.removeAttribute('data-ham-media-loading');
      const resolved = this.store.src(ref);
      if (el.isConnected && resolved) el.setAttribute('src', resolved);
    });
  }
}
