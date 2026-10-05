import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

// Gate for dev-only manual test harnesses (originally built 2026-09-24 for
// the now-removed embedded-donation-test spike; reused 2026-09-27 for the
// OpenFields entity-credentials POC) — deliberately NOT based on
// environment.production: angular.json has no fileReplacements configured
// for the `production` build configuration, so environment.ts
// (production: false, hardcoded) ships unchanged to every build including
// the real production one. That flag cannot be trusted to distinguish dev
// from prod in this project. Hostname is a real, unspoofable-from-source
// signal instead: the actual deployed domain is never literally "localhost".
export const devOnlyGuard: CanActivateFn = () => {
  const router = inject(Router);
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return isLocal ? true : router.createUrlTree(['/']);
};
