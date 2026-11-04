import { Routes } from '@angular/router';
import { devOnlyGuard } from '../../core/guards/dev-only.guard';

/* Local-only pages. Production builds replace this file with
   dev-only.routes.prod.ts (angular.json fileReplacements), so none of these
   chunks ship; devOnlyGuard additionally limits them to localhost. */
export const DEV_ONLY_ROUTES: Routes = [
  {
    path: 'dev/design-system',
    canActivate: [devOnlyGuard],
    loadComponent: () =>
      import('./pages/design-system/design-system-page.component')
        .then((m) => m.DesignSystemPageComponent),
  },
];
