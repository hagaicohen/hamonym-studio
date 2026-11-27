import { Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { HmIconComponent, HmIconName } from '../../../../../shared/ui/design-system/icon.component';

interface WorkspaceNavItem {
  path: string;
  label: string;
  icon: HmIconName;
  race?: boolean;
  full?: boolean;
}

@Component({
  selector: 'app-campaign-management-sidebar',
  standalone: true,
  imports: [HmIconComponent, RouterLink, RouterLinkActive],
  templateUrl: './campaign-management-sidebar.component.html',
  styleUrl: './campaign-management-sidebar.component.css',
})
export class CampaignManagementSidebarComponent {
  @Input() campaignId = '';
  @Input() isRace = false;
  @Input() isMinimalFormat = false;

  // Mobile hamburger + drawer (2026-09-29) — below 860px this nav used to
  // just disappear entirely (.cms-sidebar had display:none and nothing
  // replaced it), so every workspace page (רשומות/תשורות/שגרירים/הגדרות
  // וכו') became unreachable from a phone once already on the Dashboard.
  // Same inline-dropdown pattern (not a fixed overlay) already proven on
  // the public page's own mobile nav (campaign-preview.component's
  // navOpen/.nav-hamburger/.nav-mobile-drawer).
  readonly items: readonly WorkspaceNavItem[] = [
    { path: 'dashboard', label: 'סקירה כללית', icon: 'house' },
    { path: 'donations', label: 'תרומות ועסקאות', icon: 'coins' },
    { path: 'donors', label: 'תורמים', icon: 'users' },
    { path: 'ambassadors', label: 'שגרירים', icon: 'star' },
    { path: 'rewards', label: 'תשורות ורכישות', icon: 'gift', full: true },
    { path: 'registrations', label: 'מקצים ומשתתפים', icon: 'flag', race: true },
    { path: 'sponsors', label: 'שותפים וחסויות', icon: 'handshake', full: true },
    { path: 'updates', label: 'עדכונים ותגובות', icon: 'megaphone' },
    { path: 'reports', label: 'דוחות', icon: 'chart' },
    { path: 'settings', label: 'הגדרות', icon: 'settings' },
    { path: 'visibility', label: 'נראות לציבור', icon: 'eye' },
    { path: 'donation', label: 'טופס תרומה', icon: 'card' },
  ];

  mobileOpen = false;

  toggleMobile(): void { this.mobileOpen = !this.mobileOpen; }
  closeMobile(): void { this.mobileOpen = false; }
}
