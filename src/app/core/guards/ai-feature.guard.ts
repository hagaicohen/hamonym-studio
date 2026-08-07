import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CurrentEntityService } from '../services/current-entity.service';

// AI Visibility Gate — blocks direct navigation to an AI-only route for an
// entity that hasn't been granted access by a Platform Admin (see
// entities.ai_features_enabled, migration 041). The buttons that would
// normally lead here are already greyed out — this is the guard for
// someone who navigates straight to the URL.
export const aiFeatureGuard: CanActivateFn = () => {
  const currentEntity = inject(CurrentEntityService);
  const router = inject(Router);

  if (currentEntity.currentEntity()?.ai_features_enabled) return true;
  return router.createUrlTree(['/campaigns']);
};
