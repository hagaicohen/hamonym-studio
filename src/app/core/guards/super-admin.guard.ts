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

// Narrower than superAdminGuard: gates a specific platform section (e.g. 'campaigns').
// A scoped admin (is_super_admin=false, non-empty platformPermissions) only passes for
// sections they were explicitly granted; a full super admin always passes. 'users' is
// deliberately unreachable for scoped admins — admin/permission management stays
// full-super-admin-only so a scoped admin can't grant themselves more access.
export function platformSectionGuard(section: 'organizations' | 'campaigns' | 'users'): CanActivateFn {
  return () => {
    const context = inject(CurrentContextService);
    const router  = inject(Router);

    const token = localStorage.getItem('token');
    if (!token) return router.createUrlTree(['/login']);
    if (!context.adminMode()) return router.createUrlTree(['/campaigns']);

    if (context.isSuperAdmin()) return true;
    if (section !== 'users' && context.platformPermissions().includes(section)) return true;

    return router.createUrlTree(['/platform']);
  };
}
