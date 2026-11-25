import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { OrganizationLifecycleEventsService } from '../../../../core/services/organization-lifecycle-events.service';
import { CommonModule } from '@angular/common';
import { EntitiesService } from '../../../../core/services/entities.service';
import { approvalReasonLabel } from '../../../../shared/config/approval-reason-tags';
import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';

interface ApprovalStatus {
  status: string;
  updatedAt: string;
  comment: string | null;
  reasonTags: string[];
  actionBy: string | null;
}

const STATUS_META: Record<string, { label: string; icon: string; level: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  draft:              { label: 'השלמת פרטים',   icon: 'neutral', level: 'neutral' },
  pending_review:     { label: 'ממתין לאישור',   icon: 'warning', level: 'warn' },
  active:             { label: 'מאושרת',         icon: 'success', level: 'good' },
  changes_requested:  { label: 'נדרשים תיקונים', icon: 'warning', level: 'warn' },
  rejected:           { label: 'נדחתה',          icon: 'danger', level: 'bad' },
  suspended:          { label: 'מושעית',         icon: 'danger', level: 'bad' },
};

@Component({
  selector: 'app-approval-status-card',
  standalone: true,
  imports: [HmIconComponent, CommonModule],
  templateUrl: './approval-status-card.component.html',
  styleUrl: './approval-status-card.component.css',
})
export class ApprovalStatusCardComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) entityId!: string;
  @Input() showResubmit = true;
  @Input() compact = false;
  @Input() displayAllFeedback = false;
  @Input() refreshKey = '';
  @Input() canSubmit = true;
  @Output() entityUpdated = new EventEmitter<any>();

  private entitiesService = inject(EntitiesService);
  private lifecycle = inject(OrganizationLifecycleEventsService);
  private loadRequest?: Subscription;
  private submitRequest?: Subscription;
  private changes = this.lifecycle.changed$.subscribe(id => {
    if (id === this.entityId && !this.resubmitting) this.load();
  });
  private loadedEntityId: string | null = null;

  ngOnDestroy(): void { this.changes.unsubscribe(); this.loadRequest?.unsubscribe(); this.submitRequest?.unsubscribe(); }

  loading = true;
  error: string | null = null;
  data: ApprovalStatus | null = null;
  resubmitting = false;

  ngOnChanges(): void {
    if (this.loadedEntityId !== this.entityId) {
      this.submitRequest?.unsubscribe();
      this.resubmitting = false;
      this.loadedEntityId = this.entityId;
    }
    if (this.entityId) this.load();
  }

  load(): void {
    this.loadRequest?.unsubscribe();
    const entityId = this.entityId;
    this.loading = true;
    this.error = null;
    this.data = null;
    this.loadRequest = this.entitiesService.getApprovalStatus(entityId).subscribe({
      next: (res) => {
        if (this.entityId !== entityId) return;
        this.data = res;
        this.loading = false;
      },
      error: (err) => {
        if (this.entityId !== entityId) return;
        this.error = err.error?.error || 'שגיאה בטעינת סטטוס האישור';
        this.loading = false;
      },
    });
  }

  resubmit(): void {
    if (this.resubmitting || !this.canSubmit || !this.showResubmit || !this.data || !['draft','changes_requested'].includes(this.data.status)) return;
    const entityId = this.entityId;
    this.resubmitting = true;
    this.submitRequest = this.entitiesService.requestReview(entityId).subscribe({
      next: result => {
        if (this.entityId !== entityId) { this.resubmitting = false; return; }
        this.resubmitting = false;
        this.entityUpdated.emit(result.entity || result);
        this.load();
      },
      error: (err) => {
        if (this.entityId !== entityId) { this.resubmitting = false; return; }
        this.error = err.error?.error || 'הפעולה נכשלה';
        this.resubmitting = false;
      },
    });
  }

  meta(status: string) {
    return STATUS_META[status] ?? { label: status, icon: 'neutral', level: 'neutral' as const };
  }

  // The entity-settings hero row already shows registration number + status
  // (active/pending/draft) -- this card should only render on top of that
  // when the entity actually needs the association's attention, not repeat
  // the same "active"/"approved" signal in different words. Also the only
  // real backstop against a future non-approval audit note (billing,
  // MASAV, etc) rendering as if it were "issues to complete" -- the real
  // fix for that is the backend's action filter (entities.service.js#
  // getApprovalStatus), this is defense in depth, not a substitute for it.
  get needsAttention(): boolean {
    return !!this.data && ((this.showResubmit && this.data.status === 'draft') || ['changes_requested', 'rejected', 'suspended'].includes(this.data.status)
      || (this.displayAllFeedback && !!(this.data.comment || this.data.reasonTags.length)));
  }

  reasonLabel(tag: string): string {
    return approvalReasonLabel(tag);
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
}
