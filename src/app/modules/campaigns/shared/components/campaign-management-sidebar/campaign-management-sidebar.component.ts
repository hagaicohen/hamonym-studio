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
// "כספים" (donations/manual entry/export) and "שיתוף קמפיין" are
// deliberately NOT links yet — those pages don't exist (Finance backend is
// still Mock). Listing them as dead links would be worse than omitting
// them; "צפה בקמפיין" in the page header already covers sharing.
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
}
