import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CampaignDraft } from '../../../../services/campaign-studio-state.service';

import { HmIconComponent } from '../../../../../../shared/ui/design-system/icon.component';
// Architecture reset (2026-08-06) — this used to embed the Builder's own
// step components directly (Offerings/Sponsors/Ambassadors/Registration) in
// an accordion. Per explicit product direction: "Dashboard הוא המקום שבו
// מחליטים מה לערוך, לא המקום שבו עורכים" — this is now entry-point cards
// only (icon/count/›), each navigating to its own dedicated management
// page. No embedded editing UI here, no Design controls, no accordion.
@Component({
  selector: 'app-campaign-dashboard-management',
  standalone: true,
  imports: [HmIconComponent, CommonModule, RouterLink],
  templateUrl: './campaign-dashboard-management.component.html',
  styleUrl: './campaign-dashboard-management.component.css',
})
export class CampaignDashboardManagementComponent {
  @Input({ required: true }) draft!: CampaignDraft;
  @Input() campaignId = '';

  // Same reasoning as campaign-workspace-shell.component.ts's sidebar gate —
  // Rewards/Sponsors have no equivalent on MinimalDonationPageComponent,
  // Ambassadors does apply to every format. UI-only.
  get isMinimalFormat(): boolean { return this.draft.layout?.pageFormat === 'minimal'; }

  @Input() ambassadorCount: number | null = null;
}
