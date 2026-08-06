import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CampaignDraft } from '../../../../services/campaign-studio-state.service';

// "דורש תשומת לב" (2026-08-06) — mockup showed 4 cards (manual donations
// pending / new registrants / rewards out of stock / new ambassadors), but
// only "rewards out of stock" is honestly computable from real data today.
// "New" ambassadors/registrants need a timestamp that doesn't exist on
// CampaignAmbassador/RegistrationOption; pending manual donations need the
// Finance backend, which is still Mock. Deliberately NOT fabricated —
// those three are omitted until the underlying data exists (see
// docs/CAMPAIGN_MANAGEMENT_DASHBOARD_SPEC.md Migration Plan). The whole
// section hides itself if there's nothing real to show — an empty
// "everything's fine" state would itself be a claim about data (donations,
// registrants) this component doesn't have.
@Component({
  selector: 'app-campaign-dashboard-attention',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './campaign-dashboard-attention.component.html',
  styleUrl: './campaign-dashboard-attention.component.css',
})
export class CampaignDashboardAttentionComponent {
  @Input({ required: true }) draft!: CampaignDraft;
  @Input() campaignId = '';

  get outOfStockCount(): number {
    return this.draft.offerings.filter(o => o.stock === 0).length;
  }

  get hasAnything(): boolean {
    return this.outOfStockCount > 0;
  }
}
