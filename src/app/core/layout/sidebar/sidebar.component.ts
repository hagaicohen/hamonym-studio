// src/app/core/layout/sidebar/sidebar.component.ts

import { Component, computed, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CurrentContextService } from '../../services/current-context.service';
import { RoleType } from '../../models/user-context.model';

interface NavItem {
  route: string;
  label: string;
  icon: 'dashboard' | 'campaigns' | 'donations' | 'donors' | 'ambassadors' | 'reports' | 'settings';
}

const DASHBOARD:   NavItem = { route: '/dashboard',   label: 'דשבורד',   icon: 'dashboard' };
const CAMPAIGNS:   NavItem = { route: '/campaigns',   label: 'קמפיינים', icon: 'campaigns' };
const DONATIONS:   NavItem = { route: '/donations',   label: 'תרומות',   icon: 'donations' };
const DONORS:      NavItem = { route: '/donors',      label: 'תורמים',   icon: 'donors' };
const AMBASSADORS: NavItem = { route: '/ambassadors', label: 'שגרירים',  icon: 'ambassadors' };
const REPORTS:     NavItem = { route: '/reports',     label: 'דוחות',    icon: 'reports' };
const SETTINGS:    NavItem = { route: '/settings',    label: 'הגדרות',   icon: 'settings' };

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

  readonly navItems = computed(() => {
    const a = this.ctx.active();
    return a ? (NAV_BY_ROLE[a.role] ?? []) : [];
  });

  readonly showNewCampaignBtn = computed(() => {
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
