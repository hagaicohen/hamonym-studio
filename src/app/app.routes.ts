// app.routes.ts

import { Routes } from '@angular/router';
import { AppLayoutComponent } from './core/layout/app-layout/app-layout.component';
import { AuthLayoutComponent } from './modules/auth/layouts/auth-layout/auth-layout.component';
import { contextGuard } from './core/guards/context.guard';

export const routes: Routes = [

  /* ========================================
     AUTH — ללא Topbar/Sidebar
     login | register | organization-registration
  ======================================== */

  {
    path: '',
    component: AuthLayoutComponent,
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
      {
        path: 'organization-registration',
        loadComponent: () =>
          import(
            './modules/organization-registration/pages/organization-registration/organization-registration.component'
          ).then((m) => m.OrganizationRegistrationComponent),
      },
      {
        path: 'welcome',
        loadComponent: () =>
          import('./modules/onboarding/pages/welcome/welcome.component').then(
            (m) => m.WelcomeComponent,
          ),
      },
    ],
  },

  /* ========================================
     CAMPAIGN STUDIO — full screen, no shell
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

  /* ========================================
     PUBLIC — no shell, no auth
  ======================================== */

  {
    path: 'campaigns/:slug/view',
    loadComponent: () =>
      import('./modules/campaigns/pages/campaign-public-page/campaign-public-page.component')
        .then((m) => m.CampaignPublicPageComponent),
  },

  {
    path: 'campaigns/:slug/success',
    loadComponent: () =>
      import('./modules/campaigns/pages/donation-success/donation-success.component')
        .then((m) => m.DonationSuccessComponent),
  },

  {
    path: 'campaigns/:slug/:ambassadorSlug',
    loadComponent: () =>
      import('./modules/campaigns/pages/campaign-public-page/campaign-public-page.component')
        .then((m) => m.CampaignPublicPageComponent),
  },

  /* ========================================
     PUBLIC AUTHENTICATED — ללא context
     נגיש גם למשתמשים ללא Role/Entity
  ======================================== */

  {
    path: 'campaigns/discover',
    loadComponent: () =>
      import('./modules/campaigns/pages/campaign-discover/campaign-discover.component').then(
        (m) => m.CampaignDiscoverComponent,
      ),
  },

  /* ========================================
     APP SHELL — Topbar + Sidebar
     רק אחרי שיש Role + Context
  ======================================== */

  {
    path: '',
    component: AppLayoutComponent,
    canActivate: [contextGuard],
    children: [
      {
        path: 'onboarding',
        loadComponent: () =>
          import('./modules/onboarding/pages/onboarding/onboarding.component').then(
            (m) => m.OnboardingComponent,
          ),
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./modules/dashboard/pages/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'campaigns',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./modules/campaigns/pages/campaigns-page/campaigns-page.component').then(
                (m) => m.CampaignsPageComponent,
              ),
          },
        ],
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./modules/settings/pages/settings-page/settings-page.component').then(
            (m) => m.SettingsPageComponent,
          ),
      },
      {
        path: 'settings/entities/:id',
        loadComponent: () =>
          import('./modules/settings/components/entity-settings/entity-settings.component').then(
            (m) => m.EntitySettingsComponent,
          ),
      },
    ],
  },

  /* ========================================
     FALLBACK
  ======================================== */

  {
    path: '**',
    redirectTo: 'login',
  },
];
