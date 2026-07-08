import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CurrentContextService } from '../services/current-context.service';

export const superAdminGuard: CanActivateFn = () => {
  const context = inject(CurrentContextService);
  const router  = inject(Router);

  const token = localStorage.getItem('token');
  if (!token) return router.createUrlTree(['/login']);

  // Platform access is only granted via the dedicated /admin entry point —
  // being flagged is_super_admin isn't enough on its own during a regular login.
  if (!context.adminMode()) {
    return router.createUrlTree(['/campaigns']);
  }

  return true;
};
