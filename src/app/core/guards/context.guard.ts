import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const contextGuard: CanActivateFn = () => {
  const router = inject(Router);

  const token = localStorage.getItem('token');
  if (!token) {
    return router.createUrlTree(['/login']);
  }

  // User is authenticated but has no active context yet.
  // A pure super admin with no entities, entering via /admin (adminMode), still belongs in the shell.
  const hasContext =
    localStorage.getItem('currentContext_v1') ||
    localStorage.getItem('currentEntity') ||
    localStorage.getItem('adminMode') === 'true';

  if (!hasContext) {
    return router.createUrlTree(['/welcome']);
  }

  return true;
};
