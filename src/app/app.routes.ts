// app.routes.ts

import { Routes } from '@angular/router';

import { AppLayoutComponent } from './core/layout/app-layout/app-layout.component';

export const routes: Routes = [
  /* ========================================
     PUBLIC ROUTES
  ======================================== */

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

  /* ========================================
     CAMPAIGN STUDIO
     FULL SCREEN
  ======================================== */

  {
    path: 'campaigns/create',

    loadComponent: () =>
      import(
        './modules/campaigns/studio/pages/campaign-studio-page/campaign-studio-page.component'
      ).then((m) => m.CampaignStudioPageComponent),
  },

  {
    path: 'campaigns/:id/edit',

    loadComponent: () =>
      import(
        './modules/campaigns/studio/pages/campaign-studio-page/campaign-studio-page.component'
      ).then((m) => m.CampaignStudioPageComponent),
  },

  {
    path: 'campaigns/:slug/view',

    loadComponent: () =>
      import(
        './modules/campaigns/pages/campaign-public-page/campaign-public-page.component'
      ).then((m) => m.CampaignPublicPageComponent),
  },

  /* ========================================
     APP SHELL
  ======================================== */

  {
    path: '',

    component: AppLayoutComponent,

    children: [
      /* ONBOARDING */

      {
        path: 'onboarding',

        loadComponent: () =>
          import(
            './modules/onboarding/pages/onboarding/onboarding.component'
          ).then((m) => m.OnboardingComponent),
      },

      /* DASHBOARD */

      {
        path: 'dashboard',

        loadComponent: () =>
          import(
            './modules/dashboard/pages/dashboard/dashboard.component'
          ).then((m) => m.DashboardComponent),
      },

      /* ========================================
         CAMPAIGNS
      ======================================== */

      {
        path: 'campaigns',

        children: [
          {
            path: '',

            loadComponent: () =>
              import(
                './modules/campaigns/pages/campaigns-page/campaigns-page.component'
              ).then((m) => m.CampaignsPageComponent),
          },
        ],
      },

      /* ORGANIZATION REGISTRATION */

      {
        path: 'organization-registration',

        loadComponent: () =>
          import(
            './modules/organization-registration/pages/organization-registration/organization-registration.component'
          ).then((m) => m.OrganizationRegistrationComponent),
      },

      /* ========================================
         SETTINGS
      ======================================== */

      {
        path: 'settings',

        loadComponent: () =>
          import(
            './modules/settings/pages/settings-page/settings-page.component'
          ).then((m) => m.SettingsPageComponent),
      },

      /* ENTITY SETTINGS */

      {
        path: 'settings/entities/:id',

        loadComponent: () =>
          import(
            './modules/settings/components/entity-settings/entity-settings.component'
          ).then((m) => m.EntitySettingsComponent),
      },
    ],
  },

  /* ========================================
     FALLBACK
  ======================================== */

  {
    path: '**',

    redirectTo: 'dashboard',
  },
];
