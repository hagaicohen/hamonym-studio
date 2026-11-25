import { Injectable, OnDestroy } from '@angular/core';

/** Owns the public story expand/collapse click previously captured by legacy 009.js.
 * Only the engine's private lexical state is forwarded through a small compatibility
 * API; Angular owns the actual interaction and accessibility attributes.
 */
type PanoramaBridge = Window & {
  hamStoryExpansionBridge?: (expanded: boolean) => void;
  hamPanoramaSelectTab?: (tab: string, root?: Element | null, scroll?: boolean) => void;
  hamAlignPanoramaColumns?: () => void;
};

@Injectable({ providedIn: 'root' })
export class StoryExpandService implements OnDestroy {
  private started = false;
  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('#preview .ham-story-article [data-ham-story-toggle]');
    const article = button?.closest<HTMLElement>('.ham-story-article');
    if (!button || !article) return;
    const bridge = window as PanoramaBridge;
    // If the original engine has not initialized yet, leave its own handler active.
    if (typeof bridge.hamStoryExpansionBridge !== 'function' || typeof bridge.hamPanoramaSelectTab !== 'function') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const expanding = article.classList.contains('ham-story-clamped');
    bridge.hamStoryExpansionBridge(expanding);
    article.classList.toggle('ham-story-clamped', !expanding);
    button.textContent = expanding ? 'הצג פחות  ↑' : 'המשך לקרוא  ↓';
    button.setAttribute('aria-expanded', String(expanding));
    const story = article.querySelector<HTMLElement>(':scope > .story');
    if (story) {
      if (expanding) {
        story.setAttribute('role', 'region');
        story.setAttribute('aria-label', 'סיפור הקמפיין');
      } else {
        story.removeAttribute('role');
        story.removeAttribute('aria-label');
      }
    }
    bridge.hamPanoramaSelectTab('story', article.closest('#preview'), false);
    bridge.hamAlignPanoramaColumns?.();
    if (!expanding) requestAnimationFrame(() => article.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    document.addEventListener('click', this.onClick, true);
  }

  ngOnDestroy(): void {
    if (!this.started) return;
    document.removeEventListener('click', this.onClick, true);
    this.started = false;
  }
}
