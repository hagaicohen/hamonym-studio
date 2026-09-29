import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { CurrentContextService } from '../services/current-context.service';
import { CampaignApiService } from '../../modules/campaigns/services/campaign-api.service';

export const campaignEditorGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const context     = inject(CurrentContextService);
  const router      = inject(Router);
  const campaignApi = inject(CampaignApiService);

  const token = localStorage.getItem('token');
  // TEMPORARY DIAGNOSTIC (2026-09-29) — remove once "חזרה לעריכה" is
  // confirmed fixed.
  console.log('[campaignEditorGuard] entered for URL:', router.getCurrentNavigation()?.finalUrl?.toString() ?? '(unknown)', '| token present:', !!token, '| route.paramMap id:', route.paramMap.get('id'));
  if (!token) { console.log('[campaignEditorGuard] no token -> /login'); return router.createUrlTree(['/login']); }

  const campaignId = route.paramMap.get('id');

  // Editing an EXISTING campaign — verify ownership LIVE, against this
  // specific campaign, the same way canEdit itself is decided on the
  // owner-preview banner (getCampaignById's own user_entities join,
  // 2026-09-29). NOT based on CurrentContextService.roles()'s
  // entity-manager list (what the previous fix, c3cb132, still checked) —
  // that list is deliberately filtered by getMyEntities' own `NOT EXISTS
  // (... er.role = 'partner')` clause, for topbar-switcher purposes only.
  // A campaign belonging to an entity that ALSO holds a Partner role is
  // still fully editable by its manager, but that entity never appears as
  // 'entity-manager' there — so c3cb132's reordering alone still silently
  // failed for exactly that case (found via manual retest after c3cb132).
  // A live, per-campaign check can't be fooled by which entity/role
  // happens to be active in the topbar, and needs no exclusion list at all.
  if (campaignId) {
    console.log('[campaignEditorGuard] editing existing campaign, calling getById(', campaignId, ')');
    return campaignApi.getById(campaignId).pipe(
      map(data => {
        console.log('[campaignEditorGuard] getById result: data?.id =', data?.id, '| full response:', data);
        if (data?.id) { console.log('[campaignEditorGuard] ALLOW (true)'); return true; }
        // Not the owning entity's manager — an ambassador reaching their
        // own campaign's edit link lands on ambassador-studio instead;
        // anyone else is bounced to the campaign list. Unchanged from
        // before, just now gated on the live check failing.
        const active = context.active();
        if (active?.role === 'ambassador') {
          const ambassadorCampaignIds = new Set(
            context.roles().find(g => g.role === 'ambassador')?.contexts.map(c => c.id) ?? []
          );
          if (ambassadorCampaignIds.has(campaignId)) {
            console.log('[campaignEditorGuard] REDIRECT -> ambassador-studio');
            return router.createUrlTree(['/campaigns', campaignId, 'ambassador-studio']);
          }
        }
        console.log('[campaignEditorGuard] REDIRECT -> /campaigns (ownership check failed)');
        return router.createUrlTree(['/campaigns']);
      }),
      catchError(err => {
        console.log('[campaignEditorGuard] getById ERRORED:', err, '-> REDIRECT -> /campaigns');
        return of(router.createUrlTree(['/campaigns']));
      }),
    );
  }

  // Creating a brand-new campaign — no campaign row to verify ownership of
  // yet, so this stays the existing, unrelated check: some real
  // entity-manager role to attach it to. Unchanged from before.
  const hasEntityManager = context.roles().some(g => g.role === 'entity-manager');
  console.log('[campaignEditorGuard] no campaignId (create flow) -> hasEntityManager:', hasEntityManager);
  return hasEntityManager ? true : router.createUrlTree(['/campaigns']);
};
