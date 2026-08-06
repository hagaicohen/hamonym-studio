import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CampaignDraft, CampaignStatus } from '../../../../services/campaign-studio-state.service';

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'טיוטה', published: 'פעיל', paused: 'מושהה', ended: 'הסתיים',
};

// Architecture reset (2026-08-06) — Dashboard is a navigation/control
// center, not an editor; this bar and every section below it now receive
// the campaign as a plain @Input instead of injecting
// CampaignStudioStateService directly (that singleton is the Builder
// wizard's own in-memory state — coupling the Dashboard to it is what made
// this page start looking/behaving like a second Builder).
@Component({
  selector: 'app-campaign-dashboard-status',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './campaign-dashboard-status.component.html',
  styleUrl: './campaign-dashboard-status.component.css',
})
export class CampaignDashboardStatusComponent {
  @Input({ required: true }) draft!: CampaignDraft;
  @Input() campaignId = '';
  @Output() shareMoment = new EventEmitter<void>();

  get statusLabel(): string { return STATUS_LABELS[this.draft.status] ?? this.draft.status; }
  get canView(): boolean { return !!this.draft.slug; }
  get isOngoing(): boolean { return this.draft.campaignLifecycle === 'ongoing'; }

  formatDate(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}.${m}.${y}`;
  }
}
