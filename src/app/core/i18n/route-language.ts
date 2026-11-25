import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, ResolveEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { UiLanguageService } from './ui-language.service';

// Interface language follows the existing preference unless a route explicitly opts out.
export const BILINGUAL_ROUTE = { bilingual: true } as const;
export const HEBREW_ONLY_ROUTE = { bilingual: false } as const;

export function isBilingualRoute(root: ActivatedRouteSnapshot): boolean {
  let deepest = root;
  while (deepest.firstChild) deepest = deepest.firstChild;
  const flag = deepest.data?.['bilingual'];
  if (typeof flag === 'boolean') return flag;
  return true;
}

// Applies the route's flag before the new page renders (ResolveEnd).
export function syncLanguageWithRoutes(): void {
  const router = inject(Router);
  const language = inject(UiLanguageService);
  router.events
    .pipe(filter((e): e is ResolveEnd => e instanceof ResolveEnd))
    .subscribe((e) => language.setRouteBilingual(isBilingualRoute(e.state.root)));
}
