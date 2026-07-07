import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const contextGuard: CanActivateFn = () => {
  const router = inject(Router);

  const token = localStorage.getItem('token');
  if (!token) {
    return router.createUrlTree(['/login']);
  }

  // User is authenticated but has no active context yet
  const hasContext =
    localStorage.getItem('currentContext_v1') ||
    localStorage.getItem('currentEntity');

  if (!hasContext) {
    return router.createUrlTree(['/welcome']);
  }

  return true;
};
