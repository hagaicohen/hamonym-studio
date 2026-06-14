import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { CurrentContextService } from '../services/current-context.service';

export const campaignEditorGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const context = inject(CurrentContextService);
  const router  = inject(Router);

  const token = localStorage.getItem('token');
  if (!token) return router.createUrlTree(['/login']);

  if (context.active()?.role === 'ambassador') {
    const campaignId = route.paramMap.get('id');
    if (campaignId) {
      return router.createUrlTree(['/campaigns', campaignId, 'ambassador-studio']);
    }
    return router.createUrlTree(['/campaigns']);
  }

  return true;
};
