// src/app/core/layout/sidebar/sidebar.component.ts

import { Component, computed, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CurrentContextService } from '../../services/current-context.service';
import { RoleType } from '../../models/user-context.model';

interface NavItem {
  route: string;
  label: string;
  icon: 'dashboard' | 'campaigns' | 'donations' | 'donors' | 'ambassadors' | 'reports' | 'settings' | 'platform';
  // true when another nav route is a path-prefix of this one (e.g. '/platform' vs '/platform/organizations') —
  // without it, routerLinkActive's default non-exact match would light up both at once.
  exactMatch?: boolean;
}

const DASHBOARD:   NavItem = { route: '/dashboard',   label: 'דשבורד',   icon: 'dashboard' };
const CAMPAIGNS:   NavItem = { route: '/campaigns',   label: 'קמפיינים', icon: 'campaigns' };
const DONATIONS:   NavItem = { route: '/donations',   label: 'תרומות',   icon: 'donations' };
const DONORS:      NavItem = { route: '/donors',      label: 'תורמים',   icon: 'donors' };
const AMBASSADORS: NavItem = { route: '/ambassadors', label: 'שגרירים',  icon: 'ambassadors' };
const REPORTS:     NavItem = { route: '/reports',     label: 'דוחות',    icon: 'reports' };
const SETTINGS:    NavItem = { route: '/settings',    label: 'הגדרות',   icon: 'settings' };

const PLATFORM_DASHBOARD:     NavItem = { route: '/platform',              label: 'דשבורד פלטפורמה', icon: 'platform', exactMatch: true };
const PLATFORM_ORGANIZATIONS: NavItem = { route: '/platform/organizations', label: 'עמותות',          icon: 'ambassadors' };

const NAV_BY_ROLE: Record<RoleType, NavItem[]> = {
  'entity-manager':   [DASHBOARD, CAMPAIGNS, DONATIONS, DONORS, AMBASSADORS, REPORTS, SETTINGS],
  'campaign-manager': [CAMPAIGNS, AMBASSADORS, DONATIONS, REPORTS],
  'ambassador':       [CAMPAIGNS, DONATIONS],
  'company':          [CAMPAIGNS],
  'donor':            [],
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
})
export class SidebarComponent {
  @Input() mobileOpen = false;
  @Output() closeMobile = new EventEmitter<void>();

  private readonly ctx = inject(CurrentContextService);
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
  readonly platformNavItems = computed(() =>
    this.ctx.adminMode() ? [PLATFORM_DASHBOARD, PLATFORM_ORGANIZATIONS] : []
  );

  readonly showNewCampaignBtn = computed(() => {
    if (this.ctx.adminMode()) return false;
    const a = this.ctx.active();
    if (!a) return false;
    return a.role === 'entity-manager' || a.role === 'campaign-manager';
  });

  onNavigate(): void {
    this.closeMobile.emit();
  }

  createCampaign(): void {
    this.closeMobile.emit();
    this.router.navigate(['/campaigns/create']);
  }
}
