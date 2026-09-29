import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { CurrentContextService } from '../services/current-context.service';

export const campaignEditorGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const context = inject(CurrentContextService);
  const router  = inject(Router);

  const token = localStorage.getItem('token');
  if (!token) return router.createUrlTree(['/login']);

  const roles = context.roles();

  // Entity-manager rights take priority over whichever role happens to be
  // ACTIVE in the topbar switcher (2026-09-28) — this guard previously
  // checked active-role first, so an entity manager whose topbar happened
  // to be switched to their (unrelated) ambassador context got silently
  // bounced away before their entity-manager rights were ever checked:
  // clicking "חזרה לעריכה" from a campaign's own owner-preview banner (a
  // request to edit THAT specific campaign, independent of whatever mode
  // is currently active) did nothing useful. Grants nothing new — having
  // an entity-manager role was already sufficient to return true below;
  // this only fixes WHEN that already-granted access actually applies.
  const hasEntityManager = roles.some(g => g.role === 'entity-manager');
  if (hasEntityManager) return true;

  // No entity-manager role at all — an ambassador reaching their own
  // campaign's edit link lands on ambassador-studio instead; anyone else
  // is bounced to the campaign list. Unchanged from before.
  const active = context.active();
  if (active?.role === 'ambassador') {
    const campaignId        = route.paramMap.get('id');
    const ambassadorCampaignIds = new Set(
      roles.find(g => g.role === 'ambassador')?.contexts.map(c => c.id) ?? []
    );
    if (campaignId && ambassadorCampaignIds.has(campaignId)) {
      return router.createUrlTree(['/campaigns', campaignId, 'ambassador-studio']);
    }
  }

  return router.createUrlTree(['/campaigns']);
};
