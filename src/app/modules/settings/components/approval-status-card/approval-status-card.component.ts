import { Component, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntitiesService } from '../../../../core/services/entities.service';
import { approvalReasonLabel } from '../../../../shared/config/approval-reason-tags';

interface ApprovalStatus {
  status: string;
  updatedAt: string;
  comment: string | null;
  reasonTags: string[];
  actionBy: string | null;
}

const STATUS_META: Record<string, { label: string; icon: string; level: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  draft:              { label: 'השלמת פרטים',   icon: '⚪', level: 'neutral' },
  pending_review:     { label: 'ממתין לאישור',   icon: '🟡', level: 'warn' },
  active:             { label: 'מאושרת',         icon: '🟢', level: 'good' },
  changes_requested:  { label: 'נדרשים תיקונים', icon: '🟡', level: 'warn' },
  rejected:           { label: 'נדחתה',          icon: '🔴', level: 'bad' },
  suspended:          { label: 'מושעית',         icon: '🔴', level: 'bad' },
};

@Component({
  selector: 'app-approval-status-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './approval-status-card.component.html',
  styleUrl: './approval-status-card.component.css',
})
export class ApprovalStatusCardComponent implements OnChanges {
  @Input({ required: true }) entityId!: string;

  private entitiesService = inject(EntitiesService);

  loading = true;
  error: string | null = null;
  data: ApprovalStatus | null = null;
  resubmitting = false;

  ngOnChanges(): void {
    if (this.entityId) this.load();
  }

  load(): void {
    this.loading = true;
    this.entitiesService.getApprovalStatus(this.entityId).subscribe({
      next: (res) => {
        this.data = res;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'שגיאה בטעינת סטטוס האישור';
        this.loading = false;
      },
    });
  }

  resubmit(): void {
    this.resubmitting = true;
    this.entitiesService.requestReview(this.entityId).subscribe({
      next: () => {
        this.resubmitting = false;
        this.load();
      },
      error: (err) => {
        this.error = err.error?.error || 'הפעולה נכשלה';
        this.resubmitting = false;
      },
    });
  }

  meta(status: string) {
    return STATUS_META[status] ?? { label: status, icon: '⚪', level: 'neutral' as const };
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
