import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CampaignDraft, CampaignStatus } from '../../../../services/campaign-studio-state.service';
import { CurrentEntityService } from '../../../../../../core/services/current-entity.service';

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

  private currentEntity = inject(CurrentEntityService);

  get statusLabel(): string { return STATUS_LABELS[this.draft.status] ?? this.draft.status; }
  get canView(): boolean { return !!this.draft.slug; }
  get isOngoing(): boolean { return this.draft.campaignLifecycle === 'ongoing'; }

  // 2026-09-24 — a draft campaign under a pending entity is a normal,
  // real, saved campaign (see the audit: nothing about create/save/list/
  // Workspace access depends on entity.status, only publish and donation
  // creation do). This bar is where that "publish gate, not a lifecycle
  // gate" distinction should surface — small and secondary, not a blocking
  // warning state, since every other capability on this page works
  // normally regardless.
  get isDraft(): boolean { return this.draft.status === 'draft'; }
  get entityApproved(): boolean { return this.currentEntity.currentEntity()?.status === 'active'; }

  // Reuses the Builder's own publish step (returnStep=10) rather than
  // duplicating its isReady/missingFields validation here — this bar only
  // ever offers to take the manager there, it never claims publish will
  // succeed on its own.
  get publishStepLink(): any[] {
    return ['/campaigns', this.campaignId, 'edit'];
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}.${m}.${y}`;
  }
}
