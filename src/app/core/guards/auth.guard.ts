import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

// Requires a logged-in user but not a role/entity context — for pages a pure
// donor (no entities, no ambassador campaigns) can reach, unlike contextGuard
// which redirects anyone without a saved context to /welcome.
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (!localStorage.getItem('token')) return router.createUrlTree(['/login']);
  return true;
};
