import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlatformService } from '../../services/platform.service';
import { APPROVAL_REASON_TAGS } from '../../../../shared/config/approval-reason-tags';

const NOTE_REQUIRED_ACTIONS = new Set(['reject', 'requestChanges', 'suspend']);

type Tab = 'overview' | 'campaigns' | 'ambassadors' | 'donations' | 'users' | 'audit';

interface TimelineItem {
  icon: string;
  label: string;
  timestamp: string;
}

interface HealthCheck {
  label: string;
  ok: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'השלמת פרטים',
  pending_review: 'ממתין לאישור',
  active: 'פעיל',
  changes_requested: 'נדרשים תיקונים',
  rejected: 'נדחה',
  suspended: 'מושעה',
};

const ACTION_LABELS: Record<string, string> = {
  approve: 'אושרה',
  reject: 'נדחתה',
  request_changes: 'התבקשו תיקונים',
  suspend: 'הושעתה',
  reactivate: 'הופעלה מחדש',
};

@Component({
  selector: 'app-platform-organization-detail-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './platform-organization-detail-page.component.html',
  styleUrl: './platform-organization-detail-page.component.css',
})
export class PlatformOrganizationDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private platformService = inject(PlatformService);

  entityId = '';
  loading = true;
  error: string | null = null;

  entity: any = null;
  users: any[] = [];
  campaigns: any[] = [];
  ambassadors: any[] = [];
  donations: any[] = [];
  donationsKpi: any = null;
  auditLog: any[] = [];
  donorCount = 0;

  tab: Tab = 'overview';
  actionInProgress = false;
  notes = '';
  selectedReasonTags: string[] = [];
  noteRequiredError = false;

  readonly reasonTagOptions = APPROVAL_REASON_TAGS;

  ngOnInit(): void {
    this.entityId = this.route.snapshot.paramMap.get('id') || '';
    this.load();
  }

  load(): void {
    this.loading = true;
    this.platformService.getOrganization(this.entityId).subscribe({
      next: (res) => {
        this.entity = res.entity;
        this.users = res.users ?? [];
        this.campaigns = res.campaigns ?? [];
        this.ambassadors = res.ambassadors ?? [];
        this.donations = res.donations ?? [];
        this.donationsKpi = res.donationsKpi ?? null;
        this.auditLog = res.auditLog ?? [];
        this.donorCount = res.donorCount ?? 0;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'שגיאה בטעינת העמותה';
        this.loading = false;
      },
    });
  }

  setTab(t: Tab): void { this.tab = t; }

  get successRate(): number {
    const paid = this.donationsKpi?.paidCount ?? 0;
    const failed = this.donationsKpi?.failedCount ?? 0;
    const total = paid + failed;
    return total > 0 ? Math.round((paid / total) * 100) : 0;
  }

  get healthChecks(): HealthCheck[] {
    if (!this.entity) return [];
    return [
      { label: 'מסמכי רישום', ok: !!this.entity.association_certificate_name },
      { label: 'אישור מס', ok: !!this.entity.tax_document_name },
      { label: 'סליקה מחוברת', ok: this.entity.cardcom_connection_status === 'success' },
      { label: 'איש קשר מוגדר', ok: !!this.entity.contact_full_name },
      { label: 'קמפיין קיים', ok: this.campaigns.length > 0 },
    ];
  }

  get healthScore(): number {
    const checks = this.healthChecks;
    if (checks.length === 0) return 0;
    return Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  }

  get healthScoreLevel(): 'good' | 'warn' | 'bad' {
    if (this.healthScore >= 80) return 'good';
    if (this.healthScore >= 50) return 'warn';
    return 'bad';
  }

  get timeline(): TimelineItem[] {
    if (!this.entity) return [];
    const items: TimelineItem[] = [
      { icon: '🏗️', label: 'העמותה נוצרה', timestamp: this.entity.created_at },
      ...this.campaigns.map((c) => ({ icon: '🎯', label: `קמפיין נוצר: ${c.title}`, timestamp: c.created_at })),
      ...this.auditLog.map((a) => ({
        icon: '🛡️',
        label: this.actionLabel(a.action) + (a.notes ? ` — ${a.notes}` : ''),
        timestamp: a.created_at,
      })),
    ];
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  isNoteRequired(action: string): boolean {
    return NOTE_REQUIRED_ACTIONS.has(action);
  }

  toggleReasonTag(tag: string): void {
    const i = this.selectedReasonTags.indexOf(tag);
    if (i >= 0) this.selectedReasonTags.splice(i, 1);
    else this.selectedReasonTags.push(tag);
  }

  private runAction(action: 'approve' | 'reject' | 'requestChanges' | 'suspend' | 'reactivate'): void {
    const trimmedNotes = this.notes.trim();

    if (this.isNoteRequired(action) && !trimmedNotes) {
      this.noteRequiredError = true;
      return;
    }
    this.noteRequiredError = false;

    this.actionInProgress = true;
    this.platformService[action](this.entityId, trimmedNotes || undefined, this.selectedReasonTags).subscribe({
      next: () => {
        this.notes = '';
        this.selectedReasonTags = [];
        this.actionInProgress = false;
        this.load();
      },
      error: (err) => {
        this.error = err.error?.error || 'הפעולה נכשלה';
        this.actionInProgress = false;
      },
    });
  }

  approve(): void { this.runAction('approve'); }
  reject(): void { this.runAction('reject'); }
  requestChanges(): void { this.runAction('requestChanges'); }
  suspend(): void { this.runAction('suspend'); }
  reactivate(): void { this.runAction('reactivate'); }

  fmtMoney(n: number): string {
    return '₪' + Math.round(n || 0).toLocaleString('he-IL');
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  fmtDateTime(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    const t = new Date(iso);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y} ${hh}:${mm}`;
  }
}
