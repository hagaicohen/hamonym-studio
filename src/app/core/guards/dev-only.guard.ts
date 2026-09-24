import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

// Gate for the embedded-donation-test spike route (2026-09-24) —
// deliberately NOT based on environment.production: angular.json has no
// fileReplacements configured for the `production` build configuration, so
// environment.ts (production: false, hardcoded) ships unchanged to every
// build including the real production one. That flag cannot be trusted to
// distinguish dev from prod in this project today — found while building
// this exact guard. Hostname is a real, unspoofable-from-source signal
// instead: the actual deployed domain (see environment.apiUrl) is never
// literally "localhost". This is one half of a two-layer gate — the
// backend independently requires ALLOW_EMBEDDED_DONATION_SPIKE=true (see
// donations.service.js#createDonation) regardless of what reaches this
// route, so a stray deploy of this route to a non-localhost dev/preview
// domain still can't actually create an embedded LowProfile.
export const devOnlyGuard: CanActivateFn = () => {
  const router = inject(Router);
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return isLocal ? true : router.createUrlTree(['/']);
};
