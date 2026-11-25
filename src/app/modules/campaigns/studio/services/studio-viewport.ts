import { InjectionToken } from '@angular/core';

// Whether the Studio is on a narrow screen (< 1024px): the side panels shrink to
// their rails and open over the canvas, so the canvas keeps a usable width
// (bilingual roadmap §14 finding 1). A function, read on load and on resize.
export const STUDIO_NARROW_VIEWPORT = new InjectionToken<() => boolean>('STUDIO_NARROW_VIEWPORT', {
  providedIn: 'root',
  factory: () => () => typeof window !== 'undefined' && window.innerWidth < 1024,
});
