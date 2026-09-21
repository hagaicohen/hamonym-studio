import { Component, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CampaignDraft } from '../../../../services/campaign-studio-state.service';
import { AmbassadorService } from '../../../../services/ambassador.service';

// Architecture reset (2026-08-06) — this used to embed the Builder's own
// step components directly (Offerings/Sponsors/Ambassadors/Registration) in
// an accordion. Per explicit product direction: "Dashboard הוא המקום שבו
// מחליטים מה לערוך, לא המקום שבו עורכים" — this is now entry-point cards
// only (icon/count/›), each navigating to its own dedicated management
// page. No embedded editing UI here, no Design controls, no accordion.
@Component({
  selector: 'app-campaign-dashboard-management',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './campaign-dashboard-management.component.html',
  styleUrl: './campaign-dashboard-management.component.css',
})
export class CampaignDashboardManagementComponent implements OnChanges {
  @Input({ required: true }) draft!: CampaignDraft;
  @Input() campaignId = '';

  private ambassadorSvc = inject(AmbassadorService);

  get isOngoing(): boolean { return this.draft.campaignLifecycle === 'ongoing'; }

  // Ambassadors moved to their own table/service (campaign_ambassadors,
  // ambassadorSvc) — draft.ambassadors is the pre-migration CampaignDraft
  // field, never written to since, so this card always showed 0 real
  // ambassadors regardless of how many actually existed. Every other card
  // here (Rewards/Sponsors/Updates) is still genuinely JSONB-on-campaign,
  // so draft.*.length stays correct for those.
  ambassadorCount: number | null = null;

  ngOnChanges(): void {
    if (!this.campaignId) return;
    this.ambassadorSvc.list(this.campaignId).subscribe({
      next: (list) => { this.ambassadorCount = list.length; },
      error: () => { this.ambassadorCount = null; },
    });
  }
}
