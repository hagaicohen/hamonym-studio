import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';

import { provideRouter, withRouterConfig } from '@angular/router';

import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({
      eventCoalescing: true,
    }),

    // paramsInheritanceStrategy: 'always' (2026-09-23, Campaign Workspace
    // persistent-shell fix) -- the Workspace's 12 pages (Settings/Visibility/
    // Donations/etc.) are now children of a shared campaigns/:id parent
    // route instead of each independently declaring campaigns/:id/xxx. This
    // lets every child keep reading campaignId via its own
    // route.snapshot.paramMap.get('id') completely unchanged -- the child
    // segment has no :id of its own, so without this the param would only
    // be visible on the parent's ActivatedRoute, not the child's.
    provideRouter(routes, withRouterConfig({ paramsInheritanceStrategy: 'always' })),

    provideHttpClient(),
  ],
};
