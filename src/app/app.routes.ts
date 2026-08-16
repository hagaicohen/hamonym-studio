// app.routes.ts

import { Routes } from '@angular/router';
import { AppLayoutComponent } from './core/layout/app-layout/app-layout.component';
import { AuthLayoutComponent } from './modules/auth/layouts/auth-layout/auth-layout.component';
import { contextGuard } from './core/guards/context.guard';
import { campaignEditorGuard } from './core/guards/campaign-editor.guard';
import { superAdminGuard, platformSectionGuard } from './core/guards/super-admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { aiFeatureGuard } from './core/guards/ai-feature.guard';

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

// Campaign Management Dashboard — Sprint 1, shell only (see
// docs/CAMPAIGN_MANAGEMENT_DASHBOARD_SPEC.md). Same route-declaration pattern
// as CAMPAIGN_AMBASSADORS_ROUTE (flat, own guard, no AppLayout shell — this
// page owns its own status bar instead).
const CAMPAIGN_DASHBOARD_ROUTE = {
  path: 'campaigns/:id/dashboard',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/campaigns/pages/campaign-dashboard-page/campaign-dashboard-page.component').then(
      (m) => m.CampaignDashboardPageComponent,
    ),
};

// Dedicated management pages (2026-08-06 architecture reset) — each
// capability is its own page, not an accordion embedded in the Dashboard.
// Same flat/own-guard pattern as CAMPAIGN_AMBASSADORS_ROUTE.
const CAMPAIGN_REWARDS_ROUTE = {
  path: 'campaigns/:id/rewards',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/campaigns/pages/campaign-rewards-page/campaign-rewards-page.component').then(
      (m) => m.CampaignRewardsPageComponent,
    ),
};

const CAMPAIGN_SPONSORS_ROUTE = {
  path: 'campaigns/:id/sponsors',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/campaigns/pages/campaign-sponsors-page/campaign-sponsors-page.component').then(
      (m) => m.CampaignSponsorsPageComponent,
    ),
};

const CAMPAIGN_REGISTRATION_ROUTE = {
  path: 'campaigns/:id/registration',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/campaigns/pages/campaign-registration-page/campaign-registration-page.component').then(
      (m) => m.CampaignRegistrationPageComponent,
    ),
};

// Same flat/no-AppLayout-shell pattern as the other CAMPAIGN_*_ROUTE
// entries — RegistrationsPageComponent renders the Workspace sidebar
// itself when it detects it was reached via :id (this route) rather than
// the entity-wide ?campaignId= query param (/registrations). See
// registrations-page.component.ts's campaignScoped flag.
const CAMPAIGN_REGISTRATIONS_ROUTE = {
  path: 'campaigns/:id/registrations',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/registrations/pages/registrations-page/registrations-page.component').then(
      (m) => m.RegistrationsPageComponent,
    ),
};

const CAMPAIGN_DONATION_ROUTE = {
  path: 'campaigns/:id/donation',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/campaigns/pages/campaign-donation-page/campaign-donation-page.component').then(
      (m) => m.CampaignDonationPageComponent,
    ),
};

const CAMPAIGN_SETTINGS_ROUTE = {
  path: 'campaigns/:id/settings',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/campaigns/pages/campaign-settings-page/campaign-settings-page.component').then(
      (m) => m.CampaignSettingsPageComponent,
    ),
};

const CAMPAIGN_VISIBILITY_ROUTE = {
  path: 'campaigns/:id/visibility',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/campaigns/pages/campaign-visibility-page/campaign-visibility-page.component').then(
      (m) => m.CampaignVisibilityPageComponent,
    ),
};

// Same flat/no-AppLayout-shell pattern as CAMPAIGN_REGISTRATIONS_ROUTE —
// the three "תרומות ונתונים" pages (Donations/Donors/Reports) each detect
// whether they were reached via :id (this route, Workspace shell/sidebar)
// or the entity-wide ?campaignId= query param (plain /donations etc.).
const CAMPAIGN_DONATIONS_ROUTE = {
  path: 'campaigns/:id/donations',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/donations/pages/donations-page/donations-page.component').then(
      (m) => m.DonationsPageComponent,
    ),
};

const CAMPAIGN_DONORS_ROUTE = {
  path: 'campaigns/:id/donors',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/donors/pages/donors-page/donors-page.component').then(
      (m) => m.DonorsPageComponent,
    ),
};

const CAMPAIGN_REPORTS_ROUTE = {
  path: 'campaigns/:id/reports',
  canActivate: [contextGuard],
  loadComponent: () =>
    import('./modules/reports/pages/reports-page/reports-page.component').then(
      (m) => m.ReportsPageComponent,
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
    canActivate: [campaignEditorGuard, aiFeatureGuard],
    loadComponent: () =>
      import(
        './modules/campaigns/pages/ai-campaign-creation-page/ai-campaign-creation-page.component'
      ).then((m) => m.AiCampaignCreationPageComponent),
  },

  // Same component as campaigns/create/ai — it reads the URL itself to
  // decide creationMode('partner') vs the campaign flow (see
  // ai-campaign-creation-page.component.ts's ngOnInit). authGuard, not
  // campaignEditorGuard: creating a first Partner must work for a user with
  // NO existing entity-manager role yet — campaignEditorGuard would block
  // exactly that person (see partners-list-page.component.ts's own
  // createPartner(), which has the same no-prerequisite requirement).
  // No aiFeatureGuard here either, same reason — a brand-new user has no
  // entity yet for the flag to live on; the backend's own
  // requireAiAccessFromBody middleware allows this one specific case
  // (missing entityId + zero existing entities) through instead.
  {
    path: 'partners/create/ai',
    canActivate: [authGuard],
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

  // Partner identity/contact details (name/phone/email/website/logo) —
  // deliberately separate from the Builder above, which is only about the
  // public page's own content. See docs/DECISIONS.md (2026-08-04).
  {
    path: 'partners/:id/details',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        './modules/campaigns/pages/partner-details-page/partner-details-page.component'
      ).then((m) => m.PartnerDetailsPageComponent),
  },

  // Campaign Participation Builder (Phase 5 model refinement, 2026-07-30) —
  // :id is a campaign_partners row id, not an entity. Ownership enforced
  // server-side the same way (requireAuth + assertCampaignOwnership inside
  // the service), authGuard here only gates "must be logged in".
  {
    path: 'campaign-partners/:id/builder',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        './modules/campaigns/studio/pages/campaign-partner-builder-page/campaign-partner-builder-page.component'
      ).then((m) => m.CampaignPartnerBuilderPageComponent),
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

  // Phase 5, Sprint 5.1 — Public Partner Page. id-based (no slug yet — see
  // docs/PARTNER_DOMAIN_MODEL_ADR.md §8, deliberately not implemented until
  // actually needed). Renderer-only: no Builder, no auth, no navigation —
  // those are later sprints.
  {
    path: 'partners/:id/view',
    loadComponent: () =>
      import('./modules/campaigns/pages/partner-public-page/partner-public-page.component')
        .then((m) => m.PartnerPublicPageComponent),
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
  CAMPAIGN_DASHBOARD_ROUTE,
  CAMPAIGN_REWARDS_ROUTE,
  CAMPAIGN_SPONSORS_ROUTE,
  CAMPAIGN_REGISTRATION_ROUTE,
  CAMPAIGN_REGISTRATIONS_ROUTE,
  CAMPAIGN_DONATION_ROUTE,
  CAMPAIGN_SETTINGS_ROUTE,
  CAMPAIGN_VISIBILITY_ROUTE,
  CAMPAIGN_DONATIONS_ROUTE,
  CAMPAIGN_DONORS_ROUTE,
  CAMPAIGN_REPORTS_ROUTE,

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
      // Standalone Partner back-office (Scenario 0 / "Partner First" — see
      // docs/PARTNER_DOMAIN_MODEL_ADR.md §11). Primary entry point for
      // creating/managing a Partner independently of any campaign.
      {
        path: 'partners',
        loadComponent: () =>
          import('./modules/campaigns/pages/partners-list-page/partners-list-page.component').then(
            (m) => m.PartnersListPageComponent,
          ),
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
        // Reuses the 'organizations' platform permission scope — see
        // platform.routes.js's own comment on why a dedicated 'partners'
        // scope wasn't introduced here.
        path: 'platform/partners',
        canActivate: [platformSectionGuard('organizations')],
        loadComponent: () =>
          import('./modules/platform/pages/platform-partners-page/platform-partners-page.component').then(
            (m) => m.PlatformPartnersPageComponent,
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
      {
        // Full super admin only, matching the backend route
        // (requireSuperAdmin, not a scoped platform permission) — see
        // cardcom-ops.routes.js's own comment on why.
        path: 'platform/cardcom-ops',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./modules/platform/pages/platform-cardcom-ops-page/platform-cardcom-ops-page.component').then(
            (m) => m.PlatformCardcomOpsPageComponent,
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
