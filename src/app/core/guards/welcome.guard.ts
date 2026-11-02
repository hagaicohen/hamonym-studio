import { OrganizationEntryService } from '../services/organization-entry.service';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { EntitiesService } from '../services/entities.service';
import { CurrentContextService } from '../services/current-context.service';
import { CurrentEntityService } from '../services/current-entity.service';

// Public entry: guests/new donors keep the original welcome choices; organization
// managers resume their existing dashboard and validated saved entity context.
export const welcomeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (!auth.getToken()) return true;

  const router = inject(Router);
  const context = inject(CurrentContextService);
  if (context.adminMode()) return router.createUrlTree(['/platform']);

  const entry = inject(OrganizationEntryService);
  const interactiveEntry = router.navigated && router.getCurrentNavigation()?.trigger === 'imperative';
  const entitiesApi = inject(EntitiesService);
  const currentEntity = inject(CurrentEntityService);
  return entitiesApi.getMyEntities().pipe(
    map(result => {
      const entities = result.entities || [];
      const roles = context.roles();
      context.initFromLogin({
        entities,
        ambassadorCampaigns: roles.find(group => group.role === 'ambassador')?.contexts,
        campaignManagerCampaigns: roles.find(group => group.role === 'campaign-manager')?.contexts,
        isDonor: roles.some(group => group.role === 'donor'),
      });
      if (!entities.length) return true;

      const selected = entities.find((entity: { id: string }) => entity.id === context.active()?.context?.id) || entities[0];
      context.switchContext('entity-manager', selected.id);
      currentEntity.setEntity(selected);
      currentEntity.setRole(selected.role);
      if (interactiveEntry) entry.enter(selected.id);
      return router.createUrlTree(['/dashboard']);
    }),
    // An unavailable API is not evidence of organization ownership. Keep the
    // public entry usable and leave protected-route authorization unchanged.
    catchError(() => of(true)),
  );
};
