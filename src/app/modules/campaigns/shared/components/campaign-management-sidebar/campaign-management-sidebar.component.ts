import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

// Shared across the Dashboard ("סקירה כללית") and every dedicated
// management page (Rewards/Sponsors/Registration/Settings/Visibility) — see
// the 2026-08-06 architecture reset: Dashboard is a navigation/control
// center, not a container for editing UI. Each capability is its own full
// page ("Rewards Management", not an accordion), and this sidebar is the
// connective tissue so users don't have to return to the Dashboard between
// them (mirrors the reference mockup's persistent right-rail nav).
//
// "תרומות ונתונים" (Donations/Donors/Reports/Registrations) reuse the same
// entity-wide page components but through dedicated campaign-scoped routes
// (/campaigns/:id/donations etc., flat/no-AppLayout-shell, same pattern as
// Rewards/Ambassadors) instead of the entity-wide routes' ?campaignId=
// query param — landing on the generic /donations etc. shell (main app
// sidebar, not this one) read as "kicked out of the campaign" even though
// the data was correctly filtered. Each page component detects which
// route it was reached through and renders this sidebar only in the
// campaign-scoped case. "שיתוף קמפיין" is deliberately NOT a link — "צפה
// בקמפיין" in the page header already covers sharing.
@Component({
  selector: 'app-campaign-management-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './campaign-management-sidebar.component.html',
  styleUrl: './campaign-management-sidebar.component.css',
})
export class CampaignManagementSidebarComponent {
  @Input() campaignId = '';
  @Input() isOngoing = false;
  @Input() isMinimalFormat = false;

  // Mobile hamburger + drawer (2026-09-29) — below 860px this nav used to
  // just disappear entirely (.cms-sidebar had display:none and nothing
  // replaced it), so every workspace page (רשומות/תשורות/שגרירים/הגדרות
  // וכו') became unreachable from a phone once already on the Dashboard.
  // Same inline-dropdown pattern (not a fixed overlay) already proven on
  // the public page's own mobile nav (campaign-preview.component's
  // navOpen/.nav-hamburger/.nav-mobile-drawer).
  mobileOpen = false;

  toggleMobile(): void { this.mobileOpen = !this.mobileOpen; }
  closeMobile(): void { this.mobileOpen = false; }
}
