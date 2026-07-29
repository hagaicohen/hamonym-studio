// app.routes.ts

import { Routes } from '@angular/router';
import { AppLayoutComponent } from './core/layout/app-layout/app-layout.component';
import { AuthLayoutComponent } from './modules/auth/layouts/auth-layout/auth-layout.component';
import { contextGuard } from './core/guards/context.guard';
import { campaignEditorGuard } from './core/guards/campaign-editor.guard';
import { superAdminGuard, platformSectionGuard } from './core/guards/super-admin.guard';
import { authGuard } from './core/guards/auth.guard';

// These must be declared above campaigns/:slug/:ambassadorSlug to avoid being swallowed by the wildcard
const AMBASSADOR_STUDIO_ROUTE = {
  path: 'campaigns/:id/ambassador-studio',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/campaigns/pages/ambassador-studio-page/ambassador-studio-page.component').then(
      (m) => m.AmbassadorStudioPageComponent,
    ),
};

const CAMPAIGN_AMBASSADORS_ROUTE = {
  path: 'campaigns/:id/ambassadors',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/campaigns/pages/campaign-ambassadors-page/campaign-ambassadors-page.component').then(
      (m) => m.CampaignAmbassadorsPageComponent,
    ),
};

export const routes: Routes = [

  /* ========================================
     MOCK PAYMENT — ללא auth, ללא layout
     מחליף את Cardcom בסביבת פיתוח
  ======================================== */
  {
    path: 'mock-payment',
    loadComponent: () =>
      import('./modules/campaigns/pages/mock-payment-page/mock-payment-page.component').then(
        (m) => m.MockPaymentPageComponent,
      ),
  },

  /* ========================================
     ADMIN — כניסה ייעודית ל-Super Admin
     ללא auth, ללא layout, ללא Topbar/Sidebar
  ======================================== */
  {
    path: 'admin',
    loadComponent: () =>
      import('./modules/platform/pages/admin-login-page/admin-login-page.component').then(
        (m) => m.AdminLoginPageComponent,
      ),
  },

  /* ========================================
     RESET PASSWORD — ללא auth, ללא layout
     נכנסים אליו דרך קישור שמייצר מנהל הפלטפורמה
  ======================================== */
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./modules/auth/pages/reset-password/reset-password.component').then(
        (m) => m.ResetPasswordComponent,
      ),
  },

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
    canActivate: [campaignEditorGuard],
    loadComponent: () =>
      import(
        './modules/campaigns/studio/pages/campaign-studio-page/campaign-studio-page.component'
      ).then((m) => m.CampaignStudioPageComponent),
  },

  {
    path: 'campaigns/create/ai',
    canActivate: [campaignEditorGuard],
    loadComponent: () =>
      import(
        './modules/campaigns/pages/ai-campaign-creation-page/ai-campaign-creation-page.component'
      ).then((m) => m.AiCampaignCreationPageComponent),
  },

  {
    path: 'campaigns/:id/edit',
    canActivate: [campaignEditorGuard],
    loadComponent: () =>
      import(
        './modules/campaigns/studio/pages/campaign-studio-page/campaign-studio-page.component'
      ).then((m) => m.CampaignStudioPageComponent),
  },

  // Phase 3 — Page Builder Owner Context. Same Builder/Renderer as
  // campaigns/:id/edit, pointed at a Partner entity's own draft instead of a
  // campaign's — see docs/PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md. Ownership is
  // enforced server-side (requireEntityOwnership on /api/entities/:id/draft),
  // authGuard here only gates "must be logged in".
  {
    path: 'partners/:id/builder',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        './modules/campaigns/studio/pages/partner-builder-page/partner-builder-page.component'
      ).then((m) => m.PartnerBuilderPageComponent),
  },

  /* ========================================
     PUBLIC — no shell, no auth
  ======================================== */

  // Phase 4 — Partner Management, Epic 3 (Invite). No guard — must render
  // for logged-out visitors (offers login/register) and logged-in ones
  // (offers accept) alike; the accept action itself is auth-checked
  // server-side (POST /api/invites/:token/accept requires a valid JWT).
  {
    path: 'accept-invite',
    loadComponent: () =>
      import('./modules/auth/pages/accept-invite/accept-invite.component')
        .then((m) => m.AcceptInviteComponent),
  },

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
    path: 'receipts/:id',
    loadComponent: () =>
      import('./modules/campaigns/pages/receipt-view/receipt-view.component')
        .then((m) => m.ReceiptViewComponent),
  },

  AMBASSADOR_STUDIO_ROUTE,
  CAMPAIGN_AMBASSADORS_ROUTE,

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
      import('./modules/campaigns/pages/campaign-discover/campaign-discover.component')
        .then((m) => m.CampaignDiscoverComponent),
  },

  /* Bare /campaigns/:slug (no /view suffix) — same public, unguarded page as
     campaigns/:slug/view, just reachable via the shorter link people actually
     share. Must stay below every literal campaigns/<word> route above
     (create, discover, etc.) or :slug would swallow them as a "slug" value. */
  {
    path: 'campaigns/:slug',
    loadComponent: () =>
      import('./modules/campaigns/pages/campaign-public-page/campaign-public-page.component')
        .then((m) => m.CampaignPublicPageComponent),
  },

  {
    path: 'my-donations',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./modules/campaigns/pages/my-donations/my-donations.component')
        .then((m) => m.MyDonationsComponent),
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
        path: 'donations',
        loadComponent: () =>
          import('./modules/donations/pages/donations-page/donations-page.component').then(
            (m) => m.DonationsPageComponent,
          ),
      },
      {
        path: 'registrations',
        loadComponent: () =>
          import('./modules/registrations/pages/registrations-page/registrations-page.component').then(
            (m) => m.RegistrationsPageComponent,
          ),
      },
      {
        path: 'donors',
        loadComponent: () =>
          import('./modules/donors/pages/donors-page/donors-page.component').then(
            (m) => m.DonorsPageComponent,
          ),
      },
      {
        path: 'ambassadors',
        loadComponent: () =>
          import('./modules/ambassadors/pages/ambassadors-page/ambassadors-page.component').then(
            (m) => m.AmbassadorsPageComponent,
          ),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./modules/reports/pages/reports-page/reports-page.component').then(
            (m) => m.ReportsPageComponent,
          ),
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
      {
        path: 'platform',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./modules/platform/pages/platform-dashboard-page/platform-dashboard-page.component').then(
            (m) => m.PlatformDashboardPageComponent,
          ),
      },
      {
        path: 'platform/organizations',
        canActivate: [platformSectionGuard('organizations')],
        loadComponent: () =>
          import('./modules/platform/pages/platform-organizations-page/platform-organizations-page.component').then(
            (m) => m.PlatformOrganizationsPageComponent,
          ),
      },
      {
        path: 'platform/organizations/:id',
        canActivate: [platformSectionGuard('organizations')],
        loadComponent: () =>
          import('./modules/platform/pages/platform-organization-detail-page/platform-organization-detail-page.component').then(
            (m) => m.PlatformOrganizationDetailPageComponent,
          ),
      },
      {
        path: 'platform/campaigns',
        canActivate: [platformSectionGuard('campaigns')],
        loadComponent: () =>
          import('./modules/platform/pages/platform-campaigns-page/platform-campaigns-page.component').then(
            (m) => m.PlatformCampaignsPageComponent,
          ),
      },
      {
        path: 'platform/users',
        canActivate: [platformSectionGuard('users')],
        loadComponent: () =>
          import('./modules/platform/pages/platform-users-page/platform-users-page.component').then(
            (m) => m.PlatformUsersPageComponent,
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
