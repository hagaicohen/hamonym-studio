// app.routes.ts

import { Routes } from '@angular/router';

import { AppLayoutComponent } from './core/layout/app-layout/app-layout.component';

export const routes: Routes = [
  /* PUBLIC ROUTES */

  {
    path: '',

    children: [
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full',
      },

      {
        path: 'login',
        loadComponent: () =>
          import('./modules/auth/pages/login/login.component').then(
            (m) => m.LoginComponent,
          ),
      },

      {
        path: 'register',
        loadComponent: () =>
          import('./modules/auth/pages/register/register.component').then(
            (m) => m.RegisterComponent,
          ),
      },
    ],
  },

  /* APP SHELL */

  {
    path: '',
    component: AppLayoutComponent,

    children: [
      {
        path: 'onboarding',
        loadComponent: () =>
          import(
            './modules/onboarding/pages/onboarding/onboarding.component'
          ).then((m) => m.OnboardingComponent),
      },

      {
        path: 'dashboard',
        loadComponent: () =>
          import(
            './modules/dashboard/pages/dashboard/dashboard.component'
          ).then((m) => m.DashboardComponent),
      },

      {
        path: 'campaigns',
        loadComponent: () =>
          import(
            './modules/campaigns/pages/campaigns-page/campaigns-page.component'
          ).then((m) => m.CampaignsPageComponent),
      },

      {
        path: 'organization-registration',
        loadComponent: () =>
          import(
            './modules/organization-registration/pages/organization-registration/organization-registration.component'
          ).then((m) => m.OrganizationRegistrationComponent),
      },
    ],
  },

  /* FALLBACK */

  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
