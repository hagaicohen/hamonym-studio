import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CampaignDraft } from '../../../../services/campaign-studio-state.service';

// Real data via @Input (see campaign-dashboard-status for why — no more
// direct CampaignStudioStateService injection on this page).
@Component({
  selector: 'app-campaign-dashboard-kpis',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaign-dashboard-kpis.component.html',
  styleUrl: './campaign-dashboard-kpis.component.css',
})
export class CampaignDashboardKpisComponent {
  @Input({ required: true }) draft!: CampaignDraft;

  get isOngoing(): boolean { return this.draft.campaignLifecycle === 'ongoing'; }

  get progressPct(): number {
    const target = this.draft.targetAmount || 0;
    if (!target) return 0;
    return Math.min(100, Math.round(((this.draft.currentAmount ?? 0) / target) * 100));
  }

  get remaining(): number {
    return Math.max(0, (this.draft.targetAmount || 0) - (this.draft.currentAmount ?? 0));
  }

  get daysRemaining(): number {
    const end = new Date(this.draft.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    return Math.max(0, diff);
  }

  formatMoney(n: number | null | undefined): string {
    return '₪' + (n ?? 0).toLocaleString('he-IL');
  }
}
