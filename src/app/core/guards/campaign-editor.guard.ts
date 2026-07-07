import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { CurrentContextService } from '../services/current-context.service';

export const campaignEditorGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const context = inject(CurrentContextService);
  const router  = inject(Router);

  const token = localStorage.getItem('token');
  if (!token) return router.createUrlTree(['/login']);

  const active = context.active();
  const roles  = context.roles();

  // In ambassador mode — block campaign editor regardless of other roles
  if (active?.role === 'ambassador') {
    const campaignId        = route.paramMap.get('id');
    const ambassadorCampaignIds = new Set(
      roles.find(g => g.role === 'ambassador')?.contexts.map(c => c.id) ?? []
    );
    if (campaignId && ambassadorCampaignIds.has(campaignId)) {
      return router.createUrlTree(['/campaigns', campaignId, 'ambassador-studio']);
    }
    return router.createUrlTree(['/campaigns']);
  }

  // Entity-manager mode — must actually have the entity-manager role
  const hasEntityManager = roles.some(g => g.role === 'entity-manager');
  if (!hasEntityManager) {
    return router.createUrlTree(['/campaigns']);
  }

  return true;
};
