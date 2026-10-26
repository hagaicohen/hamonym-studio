import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlatformService } from '../../services/platform.service';
import { APPROVAL_REASON_TAGS } from '../../../../shared/config/approval-reason-tags';
import { AdminDetailsDrawerComponent } from '../../components/admin-details-drawer/admin-details-drawer.component';
import { israelDate, shekels } from '../../utils/admin-display';
import { CurrentContextService } from '../../../../core/services/current-context.service';

const NOTE_REQUIRED_ACTIONS = new Set(['reject', 'requestChanges', 'suspend']);

type Tab = 'overview' | 'campaigns' | 'ambassadors' | 'donations' | 'users' | 'audit';

interface TimelineItem {
  id: string;
  campaignId?: string;
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
  billing_manual_card_retry: 'התבקש ניסיון גבייה ידני',
  ai_access_grant: 'הופעלה גישה לכלי AI',
  ai_access_revoke: 'בוטלה גישה לכלי AI',
};

@Component({
  selector: 'app-platform-organization-detail-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AdminDetailsDrawerComponent],
  templateUrl: './platform-organization-detail-page.component.html',
  styleUrl: './platform-organization-detail-page.component.css',
})
export class PlatformOrganizationDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private platformService = inject(PlatformService);
  readonly context = inject(CurrentContextService);
  pendingManagementAction: 'approve' | 'reject' | 'requestChanges' | 'suspend' | 'reactivate' | null = null;
  get managementActions(): { key: 'approve' | 'reject' | 'requestChanges' | 'suspend' | 'reactivate'; label: string }[] {
    const labels = { approve: 'אישור עמותה', reject: 'דחיית הבקשה', requestChanges: 'בקשת השלמת פרטים', suspend: 'השעיית עמותה', reactivate: 'החזרה לפעילות' };
    const actions: Record<string, (keyof typeof labels)[]> = { pending_review: ['approve', 'requestChanges', 'reject'], active: ['suspend'], suspended: ['reactivate'], draft: ['requestChanges'], changes_requested: ['requestChanges'], rejected: ['requestChanges'] };
    if (this.entity?.status === 'active' && this.entity?.flagged_for_review) return [{ key: 'approve', label: 'אישור בדיקה חוזרת' }, { key: 'suspend', label: labels.suspend }];
    return (actions[this.entity?.status] || []).map(key => ({ key, label: labels[key] }));
  }
  get managementActionTitle(): string { return this.managementActions.find(action => action.key === this.pendingManagementAction)?.label || 'פעולת ניהול'; }
  openManagementAction(action: 'approve' | 'reject' | 'requestChanges' | 'suspend' | 'reactivate'): void {
    if (this.actionInProgress || !this.managementActions.some(item => item.key === action)) return;
    this.pendingManagementAction = action; this.notes = ''; this.selectedReasonTags = []; this.actionError = null; this.noteRequiredError = false;
  }
  closeManagementAction(): void { if (!this.actionInProgress) this.pendingManagementAction = null; }
  confirmManagementAction(): void {
    if (this.pendingManagementAction && !this.actionInProgress && this.managementActions.some(item => item.key === this.pendingManagementAction)) this.runAction(this.pendingManagementAction);
  }
  auditDescription(entry: any): string {
    const notes = typeof entry.notes === 'string' ? entry.notes.trim() : '';
    return notes && /[א-ת]/.test(notes) && !/[{\[]|[0-9a-f]{8}-[0-9a-f-]{27}/i.test(notes) ? notes.slice(0, 110) + (notes.length > 110 ? '…' : '') : 'פרטי הפעולה זמינים בהרחבה';
  }

  get organizationListQuery(): Record<string, string> {
    const query: Record<string, string> = {};
    for (const key of ['status', 'search', 'missingDocs', 'flaggedForReview', 'noCampaigns', 'newSince', 'sortBy', 'sortDir', 'page']) {
      const value = this.route.snapshot.queryParamMap.get(key);
      if (value !== null) query[key] = value;
    }
    return query;
  }

  entityId = '';
  loading = true;
  // Set instead of loading once an entity is already on screen (2026-09-16
  // loading-state fix) -- reloading after approve/reject/suspend/
  // reactivate/AI-access-toggle must never blank the whole detail page;
  // same loading/refreshing convention already proven on
  // platform-organizations-page.
  refreshing = false;
  error: string | null = null;
  // Separate from `error` (page-LOAD failure, the only thing that still
  // blanks the whole page) -- an action failing must show inline near the
  // action buttons instead, exactly like recommendationError/
  // hardDeleteError already do, not replace the entire page the operator
  // is actively looking at.
  actionError: string | null = null;

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
    if (!this.entity) this.loading = true;
    else this.refreshing = true;
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
        this.refreshing = false;
      },
      error: (err) => {
        // A load() triggered by a post-action refresh must not blank an
        // already-visible page just because the refetch itself failed --
        // only a genuine first-load failure (no entity yet) does that.
        if (!this.entity) this.error = err.error?.error || 'שגיאה בטעינת העמותה';
        else this.actionError = err.error?.error || 'רענון הנתונים נכשל';
        this.loading = false;
        this.refreshing = false;
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
      { id: `entity:${this.entity.id}`, icon: '🏗️', label: 'העמותה נוצרה', timestamp: this.entity.created_at },
      ...this.campaigns.map((c) => ({ id: `campaign:${c.id}`, campaignId: c.id, icon: '🎯', label: c.published_at ? `קמפיין פורסם: ${c.title}` : `קמפיין נוצר: ${c.title}`, timestamp: c.published_at || c.created_at })),
      ...this.auditLog.filter(a => Object.hasOwn(ACTION_LABELS, a.action)).map((a) => ({
        id: `audit:${a.id}`,
        icon: '🛡️',
        label: this.actionLabel(a.action),
        timestamp: a.created_at,
      })),
    ];
    const seen = new Set<string>();
    return items.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 8);
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
    return ACTION_LABELS[action] ?? 'פעולת ניהול';
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
    if (this.actionInProgress) return;
    const trimmedNotes = this.notes.trim();

    if (this.isNoteRequired(action) && !trimmedNotes) {
      this.noteRequiredError = true;
      return;
    }
    this.noteRequiredError = false;

    this.actionInProgress = true;
    this.actionError = null;
    this.platformService[action](this.entityId, trimmedNotes || undefined, this.selectedReasonTags).subscribe({
      next: () => {
        this.notes = '';
        this.selectedReasonTags = [];
        this.actionInProgress = false;
        this.pendingManagementAction = null;
        this.load();
      },
      error: (err) => {
        this.actionError = err.error?.error || 'הפעולה נכשלה';
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
    this.actionError = null;
    this.platformService.setAiAccess(this.entityId, !this.entity.ai_features_enabled).subscribe({
      next: () => { this.aiAccessInProgress = false; this.load(); },
      error: (err) => { this.actionError = err.error?.error || 'הפעולה נכשלה'; this.aiAccessInProgress = false; },
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
    return shekels(n);
  }

  fmtDate(iso: string | null): string {
    return israelDate(iso);
  }

  fmtDateTime(iso: string | null): string {
    return israelDate(iso, true);
  }
}
