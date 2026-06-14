import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CurrentContextService } from '../services/current-context.service';

export const campaignEditorGuard: CanActivateFn = () => {
  const context = inject(CurrentContextService);
  const router  = inject(Router);

  const token = localStorage.getItem('token');
  if (!token) return router.createUrlTree(['/login']);

  if (context.active()?.role === 'ambassador') {
    return router.createUrlTree(['/campaigns']);
  }

  return true;
};
