import { HmIconComponent } from '../../../shared/ui/design-system/icon.component';
// src/app/core/layout/sidebar/sidebar.component.ts

import { Component, computed, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CurrentContextService } from '../../services/current-context.service';
import { CATEGORY_SUGGESTIONS_ENABLED } from '../../../shared/config/category-suggestions';
import { CampaignsWelcomeService } from '../../services/campaigns-welcome.service';
import { RoleType } from '../../models/user-context.model';
import { campaignCreatePath } from '../../../modules/campaigns/campaign-editor-route';

interface NavItem {
  route: string;
  label: string;
  icon: 'dashboard' | 'entities' | 'campaigns' | 'donations' | 'donors' | 'ambassadors' | 'registrations' | 'reports' | 'settings' | 'platform' | 'partners';
  // true when another nav route is a path-prefix of this one (e.g. '/platform' vs '/platform/organizations') —
  // without it, routerLinkActive's default non-exact match would light up both at once.
  exactMatch?: boolean;
}

const DASHBOARD:   NavItem = { route: '/dashboard',   label: 'shell.nav.dashboard',   icon: 'dashboard' };
// 2026-09-28 — promoted out of Settings ("הישויות שלי") into a first-class
// main-nav destination: an organization is a primary workspace object, not
// a system setting. Reuses the exact same page/data/actions that used to
// live inside SettingsPageComponent — see MyOrganizationsPageComponent.
const ENTITIES:    NavItem = { route: '/entities',    label: 'shell.nav.organizations',  icon: 'entities' };
const CAMPAIGNS:   NavItem = { route: '/campaigns',   label: 'shell.nav.campaigns', icon: 'campaigns' };
const DONATIONS:   NavItem = { route: '/donations',   label: 'shell.nav.donations',   icon: 'donations' };
const REGISTRATIONS: NavItem = { route: '/registrations', label: 'shell.nav.registrations', icon: 'registrations' };
const DONORS:      NavItem = { route: '/donors',      label: 'shell.nav.donors',   icon: 'donors' };
const AMBASSADORS: NavItem = { route: '/ambassadors', label: 'shell.nav.ambassadors',  icon: 'ambassadors' };
const PARTNERS:    NavItem = { route: '/partners',    label: 'shell.nav.partners',   icon: 'partners' };
const REPORTS:     NavItem = { route: '/reports',     label: 'shell.nav.reports',    icon: 'reports' };
const SETTINGS:    NavItem = { route: '/settings',    label: 'shell.nav.settings',   icon: 'settings' };

const PLATFORM_DASHBOARD:     NavItem = { route: '/platform',              label: 'shell.nav.platformDashboard', icon: 'platform', exactMatch: true };
const PLATFORM_ORGANIZATIONS: NavItem = { route: '/platform/organizations', label: 'shell.nav.platformOrganizations',          icon: 'ambassadors' };
const PLATFORM_PARTNERS:      NavItem = { route: '/platform/partners',      label: 'shell.nav.partners',          icon: 'partners' };
const PLATFORM_CAMPAIGNS:     NavItem = { route: '/platform/campaigns',     label: 'shell.nav.campaigns',        icon: 'campaigns' };
const PLATFORM_USERS:         NavItem = { route: '/platform/users',         label: 'shell.nav.platformUsers',         icon: 'donors' };
// UX simplification pass, 2026-09-14: "תפעול CardCom" is gone as a primary
// operator concept -- CardCom is the payment provider underneath the
// donation flow, not something the operator "operates". Replaced with two
// business-facing worlds: תרומות (donor -> provider -> עמותה) and חיובי
// עמותות (עמותה -> provider/מס"ב -> Hamonym), the latter absorbing what
// used to be two separate entries ("חשבונות חיוב" + "תפעול חיוב").
const PLATFORM_DONATIONS:    NavItem = { route: '/platform/donations',   label: 'shell.nav.donations',       icon: 'donations' };
// Unified "ניהול גבייה" (2026-10) -- replaces the two separate "חיובי
// עמותות"/"ניהול כספים" entries with one page (3 tabs: סקירה ופעולות /
// היסטוריה / דוחות). Both old routes still exist and redirect here
// (app.routes.ts) so any existing bookmark/link keeps working.
const PLATFORM_COLLECTION_OPS: NavItem = { route: '/platform/collection-ops', label: 'shell.nav.platformCollectionOps', icon: 'settings' };
// "הגדרות כלליות" (2026-09-14j) -- platform-wide settings that aren't about
// any one association or billing operation (currently: system VAT rate).
const PLATFORM_GENERAL_SETTINGS: NavItem = { route: '/platform/settings', label: 'shell.nav.platformSettings', icon: 'settings' };
const PLATFORM_CATEGORY_SUGGESTIONS: NavItem = { route: '/platform/category-suggestions', label: 'shell.nav.platformCategorySuggestions', icon: 'reports' };

const PLATFORM_TASKS: NavItem = { route: '/platform/tasks', label: 'shell.nav.platformTasks', icon: 'reports' };
const PLATFORM_BUSINESS: NavItem = { route: '/platform/business-reports', label: 'shell.nav.platformBusinessReports', icon: 'reports' };
const PLATFORM_PORTAL: NavItem = { route: '/platform/portal', label: 'shell.nav.platformPortal', icon: 'platform' };
const PLATFORM_AUDIT: NavItem = { route: '/platform/audit', label: 'shell.nav.platformAudit', icon: 'reports' };
const PLATFORM_DEV: NavItem = { route: '/platform/developer-tools', label: 'shell.nav.platformDeveloperTools', icon: 'settings' };

const NAV_BY_ROLE: Record<RoleType, NavItem[]> = {
  'entity-manager':   [DASHBOARD, ENTITIES, CAMPAIGNS, DONATIONS, REGISTRATIONS, DONORS, AMBASSADORS, PARTNERS, REPORTS, SETTINGS],
  'campaign-manager': [CAMPAIGNS, AMBASSADORS, DONATIONS, REGISTRATIONS, REPORTS],
  'ambassador':       [CAMPAIGNS, DONATIONS],
  'company':          [CAMPAIGNS],
  'donor':            [],
};

import { TranslocoPipe } from '@jsverse/transloco';
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [HmIconComponent, TranslocoPipe, CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css', '../../../shared/styles/new-campaign-button.css'],
})
export class SidebarComponent {
  @Input() mobileOpen = false;
  @Output() closeMobile = new EventEmitter<void>();

  protected readonly ctx = inject(CurrentContextService);
  private readonly campaignsWelcome = inject(CampaignsWelcomeService);
  private readonly router = inject(Router);

  // Entered via the dedicated /admin login — shows only the platform section,
  // regardless of what other roles/entities this user also has.
  readonly navItems = computed(() => {
    if (this.ctx.adminMode()) return [];
    const a = this.ctx.active();
    return a ? (NAV_BY_ROLE[a.role] ?? []) : [];
  });

  // Only shown when the user entered via the dedicated /admin login — a regular
  // login never surfaces platform nav, even for an account flagged is_super_admin.
  // A scoped admin (not is_super_admin) only sees the sections they were granted;
  // "משתמשים" never appears for them — admin/permission management stays
  // full-super-admin-only.
  readonly platformNavItems = computed(() => {
    if (!this.ctx.adminMode()) return [];
    const items = [PLATFORM_DASHBOARD];
    if (this.ctx.isSuperAdmin()) items.push(PLATFORM_TASKS);
    if (this.ctx.hasPlatformSection('organizations')) items.push(PLATFORM_ORGANIZATIONS, PLATFORM_PARTNERS);
    if (this.ctx.hasPlatformSection('campaigns')) items.push(PLATFORM_CAMPAIGNS);
    if (this.ctx.isSuperAdmin()) items.push(PLATFORM_USERS, PLATFORM_DONATIONS, PLATFORM_COLLECTION_OPS, PLATFORM_BUSINESS, PLATFORM_PORTAL, ...(CATEGORY_SUGGESTIONS_ENABLED ? [PLATFORM_CATEGORY_SUGGESTIONS] : []), PLATFORM_GENERAL_SETTINGS, PLATFORM_AUDIT, PLATFORM_DEV);
    return items;
  });

  readonly platformNavigationGroups = computed(() => {
    const items = this.platformNavItems();
    const overview = [PLATFORM_DASHBOARD, PLATFORM_TASKS];
    const management = [PLATFORM_ORGANIZATIONS, PLATFORM_CAMPAIGNS, PLATFORM_USERS, PLATFORM_PARTNERS];
    const finance = [PLATFORM_DONATIONS, PLATFORM_COLLECTION_OPS, PLATFORM_BUSINESS];
    return [
      { label: 'shell.sidebar.platform', icon: 'chart' as const, items: overview.filter(item => items.includes(item)) },
      { label: 'shell.nav.platformManagementGroup', icon: 'building' as const, items: management.filter(item => items.includes(item)) },
      { label: 'shell.nav.platformFinanceGroup', icon: 'coins' as const, items: finance.filter(item => items.includes(item)) },
      { label: 'shell.nav.platformSystemGroup', icon: 'settings' as const, items: items.filter(item => ![...overview, ...management, ...finance].includes(item)) },
    ].filter(group => group.items.length);
  });

  readonly showNewCampaignBtn = computed(() => {
    if (this.ctx.adminMode() || this.campaignsWelcome.visible()) return false;
    const a = this.ctx.active();
    if (!a) return false;
    return a.role === 'entity-manager' || a.role === 'campaign-manager';
  });

  onNavigate(): void {
    this.closeMobile.emit();
  }

  createCampaign(): void {
    this.closeMobile.emit();
    this.router.navigate(campaignCreatePath());
  }
}
