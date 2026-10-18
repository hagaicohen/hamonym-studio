import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  BillingOpsService,
  BillingPeriod,
  StatementListItem,
  StatementDetail,
} from '../../services/billing-ops.service';
import {
  FinanceOpsService,
  ResolutionType,
} from '../../services/finance-ops.service';
import {
  BillingProvisioningService,
  BillingReadinessEntity,
} from '../../services/billing-provisioning.service';
import {
  CollectionOpsService,
  FinancialOverview,
  NeedsAttention,
  NeedsAttentionItem,
  SystemActivity,
  StatementHistoryRow,
} from '../../services/collection-ops.service';

type Tab = 'overview' | 'history' | 'reports';

// Unified Super Admin "ניהול גבייה" page (2026-10) -- replaces the two
// separate "חיובי עמותות"/"ניהול כספים" screens with one. Every action here
// wraps an EXISTING, already-tested backend operation (BillingOpsService/
// FinanceOpsService, unchanged); CollectionOpsService adds ONLY new
// read-only aggregation (overview/needs-attention/system-activity/history/
// report) -- no new write path, no new financial logic, anywhere in this
// page.
@Component({
  selector: 'app-platform-collection-ops-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './platform-collection-ops-page.component.html',
  styleUrl: './platform-collection-ops-page.component.css',
})
export class PlatformCollectionOpsPageComponent implements OnInit {
  private billingOps = inject(BillingOpsService);
  private financeOps = inject(FinanceOpsService);
  private collectionOps = inject(CollectionOpsService);
  private billingProvisioning = inject(BillingProvisioningService);
  private router = inject(Router);

  // Reused by both the "מס״ב חסום" needs-attention link and the "הגדרות
  // גבייה" buttons added to the entity table / all-entities list below --
  // same existing standalone route, same guard, nothing new.
  goToBillingSetupForEntity(entityId: string): void {
    this.router.navigate(['/platform/billing-setup', entityId]);
  }

  tab: Tab = 'overview';
  setTab(t: Tab): void {
    this.tab = t;
    if (t === 'history' && this.historyRows.length === 0) this.runHistorySearch();
  }

  // --- Period selector (shared by Overview + Reports) ------------------
  periods: BillingPeriod[] = [];
  selectedPeriodId: string | null = null;

  ngOnInit(): void {
    this.billingOps.listPeriods().subscribe({
      next: (res) => {
        this.periods = res.periods;
        if (res.periods.length > 0) {
          this.selectedPeriodId = res.periods[0].id;
          this.loadOverviewAndStatements();
        }
      },
    });
    this.loadNeedsAttention();
    this.loadSystemActivity();
  }

  onPeriodChange(): void {
    this.loadOverviewAndStatements();
  }

  fmtPeriodLabel(p: BillingPeriod): string {
    return `${this.fmtDate(p.period_start)} – ${this.fmtDate(p.period_end)}`;
  }

  // --- A. Financial overview --------------------------------------------
  overview: FinancialOverview | null = null;
  overviewLoading = false;
  overviewError: string | null = null;

  loadOverviewAndStatements(): void {
    if (!this.selectedPeriodId) return;
    this.overviewLoading = true;
    this.overviewError = null;
    this.collectionOps.getOverview(this.selectedPeriodId).subscribe({
      next: (res) => {
        this.overview = res.overview;
        this.overviewLoading = false;
      },
      error: () => {
        this.overviewLoading = false;
        this.overviewError = 'שגיאה בטעינת תמונת המצב הכספית';
      },
    });
    this.loadStatements();
  }

  // --- B. דורש טיפולך -----------------------------------------------------
  needsAttention: NeedsAttention | null = null;
  needsAttentionLoading = true;
  needsAttentionError: string | null = null;

  // Which single item's inline action form is open (one at a time, same
  // "pick exactly one target, then act" pattern platform-finance-page
  // already uses).
  openItem: NeedsAttentionItem | null = null;
  approveReason = '';
  overrideReason = '';
  resolutionType: ResolutionType = 'resolve_no_overpayment';
  resolveReason = '';
  resolveEvidenceNotes = '';
  attentionActionBusy = false;
  attentionActionError: string | null = null;

  loadNeedsAttention(): void {
    this.needsAttentionLoading = true;
    this.needsAttentionError = null;
    this.collectionOps.getNeedsAttention().subscribe({
      next: (res) => {
        this.needsAttention = res;
        this.needsAttentionLoading = false;
      },
      error: () => {
        this.needsAttentionLoading = false;
        this.needsAttentionError = 'שגיאה בטעינת הפעולות הדרושות';
      },
    });
  }

  toggleItem(item: NeedsAttentionItem): void {
    this.openItem = this.openItem === item ? null : item;
    this.approveReason = '';
    this.overrideReason = '';
    this.resolveReason = '';
    this.resolveEvidenceNotes = '';
    this.resolutionType = 'resolve_no_overpayment';
    this.attentionActionError = null;
  }

  // "הצעות מס״ב מחכות לאישור" -- reuses FinanceOpsService#approveMasavProposal verbatim.
  approveProposal(item: NeedsAttentionItem): void {
    if (!item.proposalId || this.attentionActionBusy) return;
    const reason = this.approveReason.trim();
    if (!reason) { this.attentionActionError = 'נדרשת הערה לאישור'; return; }
    if (!window.confirm(`לאשר הצעת מס״ב בסך ₪${item.amount} עבור ${item.entityName}? היתרה תיבדק מחדש ברגע האישור.`)) return;

    this.attentionActionBusy = true;
    this.financeOps.approveMasavProposal(item.proposalId, reason).subscribe({
      next: () => { this.attentionActionBusy = false; this.openItem = null; this.loadNeedsAttention(); },
      error: (err) => { this.attentionActionBusy = false; this.attentionActionError = err?.error?.error || 'האישור נכשל'; },
    });
  }

  // "חריגי גביית-יתר" -- reuses FinanceOpsService#overrideExceptionHold / resolveException verbatim.
  overrideHold(item: NeedsAttentionItem): void {
    if (!item.exceptionId || this.attentionActionBusy) return;
    const reason = this.overrideReason.trim();
    if (!reason) { this.attentionActionError = 'נדרשת הערה המסבירה למה בטוח לבטל את ההגבלה'; return; }
    if (!window.confirm('לבטל את ההגבלה על גבייה חדשה מהעמותה הזו? החריג עצמו יישאר פתוח עד שיוכרע.')) return;

    this.attentionActionBusy = true;
    this.financeOps.overrideExceptionHold(item.exceptionId, reason).subscribe({
      next: () => { this.attentionActionBusy = false; this.loadNeedsAttention(); },
      error: (err) => { this.attentionActionBusy = false; this.attentionActionError = err?.error?.error || 'הפעולה נכשלה'; },
    });
  }

  resolveException(item: NeedsAttentionItem): void {
    if (!item.exceptionId || this.attentionActionBusy) return;
    const reason = this.resolveReason.trim();
    if (!reason) { this.attentionActionError = 'נדרשת הערה המסבירה את ההחלטה'; return; }
    if (!window.confirm('לתעד את ההכרעה הזו? שום החזר/זיכוי לא מבוצע אוטומטית על ידי המערכת. הפעולה לא ניתנת לביטול.')) return;

    this.attentionActionBusy = true;
    this.financeOps.resolveException(item.exceptionId, this.resolutionType, reason, this.resolveEvidenceNotes.trim() || undefined).subscribe({
      next: () => { this.attentionActionBusy = false; this.openItem = null; this.loadNeedsAttention(); },
      error: (err) => { this.attentionActionBusy = false; this.attentionActionError = err?.error?.error || 'הפעולה נכשלה'; },
    });
  }

  // "כשלי גבייה בכרטיס" -- no safe in-page action per the approved design
  // (no new charge/refund action may bypass FIN-11 safeguards); opens the
  // existing Statement drawer so the admin can see attempt history and
  // decide (e.g. reopen for collection) through the existing, unchanged
  // actions already wired below.
  openStatementFromAttention(item: NeedsAttentionItem): void {
    this.openStatement(item.statementId);
  }

  // "מס״ב חסום" -- the actual fix lives on the existing per-entity billing
  // setup screen (bank details / authorization), not on the Statement
  // itself. This is the "link directly to an existing configuration
  // screen" case the approved design explicitly allows.
  goToBillingSetup(item: NeedsAttentionItem): void {
    if (!item.entityId) return;
    this.goToBillingSetupForEntity(item.entityId);
  }

  // "כל העמותות" -- settings must be reachable for every nonprofit, not
  // only ones with a current Statement or an attention item (product-owner
  // correction, 2026-10). Lazy-loaded once (collapsed <details>), reusing
  // BillingProvisioningService#getReadiness verbatim -- the exact same
  // read the old "הגדרות עמותות" tab already used.
  allEntities: BillingReadinessEntity[] = [];
  allEntitiesLoading = false;
  private allEntitiesLoaded = false;

  loadAllEntitiesOnce(): void {
    if (this.allEntitiesLoaded) return;
    this.allEntitiesLoaded = true;
    this.allEntitiesLoading = true;
    this.billingProvisioning.getReadiness().subscribe({
      next: (res) => { this.allEntities = res.entities; this.allEntitiesLoading = false; },
      error: () => { this.allEntitiesLoading = false; },
    });
  }

  // --- C. פעילות המערכת ----------------------------------------------------
  systemActivity: SystemActivity | null = null;
  systemActivityLoading = true;

  loadSystemActivity(): void {
    this.systemActivityLoading = true;
    this.collectionOps.getSystemActivity().subscribe({
      next: (res) => { this.systemActivity = res; this.systemActivityLoading = false; },
      error: () => { this.systemActivityLoading = false; },
    });
  }

  jobStatusLabel(status: string): string {
    switch (status) {
      case 'success': return 'הצליח';
      case 'failed': return 'נכשל';
      case 'never_run': return 'עדיין לא רץ';
      case 'not_registered': return 'לא פעיל';
      case 'active': return 'פעיל';
      default: return status;
    }
  }

  // --- D. חיובי העמותות (period-scoped table, reuses BillingOpsService#listStatements) ---
  statements: StatementListItem[] = [];
  statementsLoading = false;
  entitySearch = '';
  statusFilter = '';

  loadStatements(): void {
    if (!this.selectedPeriodId) return;
    this.statementsLoading = true;
    this.billingOps.listStatements({ periodId: this.selectedPeriodId, status: this.statusFilter || undefined }).subscribe({
      next: (res) => { this.statements = res.statements; this.statementsLoading = false; },
      error: () => { this.statementsLoading = false; },
    });
  }

  get filteredStatements(): StatementListItem[] {
    const q = this.entitySearch.trim().toLowerCase();
    if (!q) return this.statements;
    return this.statements.filter((s) => s.entity_name.toLowerCase().includes(q));
  }

  // --- Shared Statement drawer (reuses BillingOpsService verbatim) -------
  selectedStatement: StatementDetail | null = null;
  drawerLoading = false;
  drawerError: string | null = null;
  drawerActionBusy = false;
  // Collapsed by default -- "פעולות חריגות" must not read as the normal,
  // expected flow under the approved FIN-11-automatic model.
  showExceptionalActions = false;
  showAdjustment = false;
  adjustAmount: number | null = null;
  adjustReason = '';

  openStatement(id: string): void {
    this.drawerLoading = true;
    this.drawerError = null;
    this.showExceptionalActions = false;
    this.showAdjustment = false;
    this.billingOps.getStatement(id).subscribe({
      next: (res) => { this.selectedStatement = res.statement; this.drawerLoading = false; },
      error: () => { this.drawerLoading = false; this.drawerError = 'שגיאה בטעינת החיוב'; },
    });
  }

  closeDrawer(): void {
    this.selectedStatement = null;
    this.adjustAmount = null;
    this.adjustReason = '';
  }

  refreshDrawer(): void {
    if (this.selectedStatement) this.openStatement(this.selectedStatement.id);
    this.loadStatements();
    this.loadNeedsAttention();
    if (this.selectedPeriodId) this.loadOverviewAndStatements();
  }

  approveStatementAction(): void {
    if (!this.selectedStatement || this.drawerActionBusy) return;
    this.drawerActionBusy = true;
    this.billingOps.approveStatement(this.selectedStatement.id).subscribe({
      next: () => { this.drawerActionBusy = false; this.refreshDrawer(); },
      error: () => { this.drawerActionBusy = false; },
    });
  }

  triggerCollectionAction(): void {
    if (!this.selectedStatement || this.drawerActionBusy) return;
    if (!window.confirm('להפעיל גבייה עבור חיוב זה? זה המסלול הקיים בלבד (עדיין לא FIN-11), עם הגנות שלוש-ניסיונות שהוספו.')) return;
    this.drawerActionBusy = true;
    this.billingOps.triggerCollection(this.selectedStatement.id).subscribe({
      next: () => { this.drawerActionBusy = false; this.refreshDrawer(); },
      error: () => { this.drawerActionBusy = false; },
    });
  }

  applyAdjustmentAction(): void {
    if (!this.selectedStatement || this.drawerActionBusy || this.adjustAmount === null) return;
    const reason = this.adjustReason.trim();
    if (!reason) return;
    if (!window.confirm(`לשמור תיקון בסך ₪${this.adjustAmount}?`)) return;
    this.drawerActionBusy = true;
    this.billingOps.applyAdjustment(this.selectedStatement.id, this.adjustAmount, reason).subscribe({
      next: () => { this.drawerActionBusy = false; this.adjustAmount = null; this.adjustReason = ''; this.refreshDrawer(); },
      error: () => { this.drawerActionBusy = false; },
    });
  }

  reopenForCollectionAction(): void {
    if (!this.selectedStatement || this.drawerActionBusy) return;
    if (!window.confirm('לפתוח את החיוב לגבייה (ללא הפעלה אוטומטית)?')) return;
    this.drawerActionBusy = true;
    this.billingOps.reopenForCollection(this.selectedStatement.id).subscribe({
      next: () => { this.drawerActionBusy = false; this.refreshDrawer(); },
      error: () => { this.drawerActionBusy = false; },
    });
  }

  // --- Tab 2: היסטוריה (cross-period search, new read-only endpoint) ------
  historyRows: StatementHistoryRow[] = [];
  historyLoading = false;
  historyFilters = { entityName: '', dateFrom: '', dateTo: '', status: '' };

  runHistorySearch(): void {
    this.historyLoading = true;
    this.collectionOps.searchHistory({
      entityName: this.historyFilters.entityName || undefined,
      dateFrom: this.historyFilters.dateFrom || undefined,
      dateTo: this.historyFilters.dateTo || undefined,
      status: this.historyFilters.status || undefined,
    }).subscribe({
      next: (res) => { this.historyRows = res.statements; this.historyLoading = false; },
      error: () => { this.historyLoading = false; },
    });
  }

  // --- Tab 3: דוחות --------------------------------------------------------
  reportBusy = false;
  reportError: string | null = null;

  downloadReport(): void {
    if (!this.selectedPeriodId || this.reportBusy) return;
    this.reportBusy = true;
    this.reportError = null;
    this.collectionOps.exportReport(this.selectedPeriodId).subscribe({
      next: (blob) => {
        this.reportBusy = false;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `financial-report-${Date.now()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => { this.reportBusy = false; this.reportError = 'הורדת הדוח נכשלה'; },
    });
  }

  // --- Shared formatting helpers ------------------------------------------
  fmtMoney(v: string | number | null | undefined): string {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  resolutionLabel(t: ResolutionType): string {
    switch (t) {
      case 'resolve_refund': return 'יוחזר לתורם';
      case 'resolve_credit': return 'יזוכה לעמותה';
      case 'resolve_no_overpayment': return 'אינה גביית-יתר אמיתית';
    }
  }
}
