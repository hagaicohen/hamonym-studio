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
  analyzing = false;
  recommendation: {
    summary: string;
    confidence: number;
    recommendation: string;
    checks: { id: string; title: string; status: 'pass' | 'warning' | 'fail'; explanation: string }[];
    trace: { tool: string; durationMs: number; success: boolean; meta?: Record<string, unknown> }[];
  } | null = null;
  recommendationError = '';
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
    const checks: HealthCheck[] = [
      { label: 'מסמכי רישום', ok: !!this.entity.association_certificate_name },
    ];
    // אישור מס (סעיף 46) רלוונטי רק לעמותה — חל״צ/מפלגה/עוסק פטור/עוסק
    // מורשה לא מעלים את המסמך הזה בכלל באשף ההרשמה (entity-config.ts,
    // showSection46), אז זה לא "חסר" אצלם — זה פשוט לא רלוונטי.
    if (this.entity.entity_type === 'association') {
      checks.push({ label: 'אישור מס', ok: !!this.entity.tax_document_name });
    }
    checks.push(
      { label: 'סליקה מחוברת', ok: this.entity.cardcom_connection_status === 'success' },
      { label: 'איש קשר מוגדר', ok: !!this.entity.contact_full_name },
      { label: 'קמפיין קיים', ok: this.campaigns.length > 0 },
    );
    return checks;
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

  // Same gap as the organizations list — display_name is only filled in
  // step 2 of the registration wizard, so an entity that only completed
  // step 1 would otherwise show a blank title/placeholder here.
  get orgName(): string {
    return this.entity?.display_name || this.entity?.legal_name || 'ללא שם';
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

  // Internal/debug API — returns raw ApprovalContext, no LLM call. Not wired
  // to any button; kept for future consumers (tests, CLI, batch jobs) that
  // only need the collected data, not a recommendation.
  analyzeOrganization(): void {
    this.analyzing = true;
    this.platformService.analyzeOrganization(this.entityId).subscribe({
      next: (context) => { console.log('ApprovalContext', context); this.analyzing = false; },
      error: (err) => { console.error('analyze failed', err); this.analyzing = false; },
    });
  }

  recommendOrganization(): void {
    this.analyzing = true;
    this.recommendationError = '';
    this.platformService.recommendOrganization(this.entityId).subscribe({
      next: (result) => {
        this.recommendation = result;
        this.analyzing = false;
      },
      error: (err) => {
        this.recommendationError = err.error?.error || 'שגיאה בהפעלת הסוכן';
        this.analyzing = false;
      },
    });
  }

  approve(): void { this.runAction('approve'); }
  reject(): void { this.runAction('reject'); }
  requestChanges(): void { this.runAction('requestChanges'); }
  suspend(): void { this.runAction('suspend'); }
  reactivate(): void { this.runAction('reactivate'); }

  // ── AI Visibility Gate ──
  aiAccessInProgress = false;
  toggleAiAccess(): void {
    if (this.aiAccessInProgress || !this.entity) return;
    this.aiAccessInProgress = true;
    this.platformService.setAiAccess(this.entityId, !this.entity.ai_features_enabled).subscribe({
      next: () => { this.aiAccessInProgress = false; this.load(); },
      error: (err) => { this.error = err.error?.error || 'הפעולה נכשלה'; this.aiAccessInProgress = false; },
    });
  }

  // ── HARD DELETE (permanent, platform admin only) ──
  hardDeleteConfirmOpen = false;
  hardDeleteConfirmText = '';
  hardDeleteNotes = '';
  hardDeleteInProgress = false;
  hardDeleteError = '';

  get hardDeleteConfirmValid(): boolean {
    return this.hardDeleteConfirmText.trim() === this.orgName.trim();
  }

  openHardDeleteModal(): void {
    this.hardDeleteConfirmText = '';
    this.hardDeleteNotes = '';
    this.hardDeleteError = '';
    this.hardDeleteConfirmOpen = true;
  }

  closeHardDeleteModal(): void {
    this.hardDeleteConfirmOpen = false;
  }

  confirmHardDelete(): void {
    if (!this.hardDeleteConfirmValid || this.hardDeleteInProgress) return;
    if (!this.hardDeleteNotes.trim()) {
      this.hardDeleteError = 'נדרשת הערה';
      return;
    }

    this.hardDeleteInProgress = true;
    this.platformService.hardDelete(this.entityId, this.hardDeleteNotes.trim()).subscribe({
      next: () => {
        this.router.navigate(['/platform/organizations']);
      },
      error: (err) => {
        this.hardDeleteInProgress = false;
        this.hardDeleteError = err.error?.error || 'המחיקה נכשלה';
      },
    });
  }

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
