import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import {
  BillingOpsService,
  BillingPeriod,
  BillingRun,
  StatementListItem,
  StatementDetail,
  BlockedMasavStatement,
  ActionableMasavStatement,
  BlockedBillingEntity,
  BillingActivityDiscovered,
  BulkApproveResult,
} from '../../services/billing-ops.service';

type Tab = 'periods' | 'statements' | 'masav';

const STATEMENT_STATUS_LABELS: Record<string, string> = {
  draft: 'ממתין לאישור',
  approved: 'מאושר',
  abandoned: 'בוטל (טיוטה)',
  open: 'בגבייה',
  paid: 'שולם',
  cancelled: 'מבוטל',
  written_off: 'נמחק כחוב אבוד',
};

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין',
  succeeded: 'הצליח',
  declined: 'נדחה',
  technical_failure: 'תקלה טכנית',
  ambiguous: 'לא ודאי',
};

const BLOCKED_REASON_LABELS: Record<string, string> = {
  masav_not_configured: 'אין פרטי בנק מוגדרים',
  masav_incomplete: 'פרטי בנק חסרים',
  masav_not_authorized: 'לא אושרה הרשאה',
};

// Statement-drawer collection state (Billing Collection UX truthfulness
// fix, 2026-09-02) -- derived only from the backend's own readiness
// computation (StatementDetail.readiness), never re-decided in the UI, so
// this can never again show a state ("חסום") that contradicts what an
// actual click on the action button would do. See
// PlatformBillingOpsPageComponent#collectionState.
interface CollectionState {
  label: string;
  sublabel: string | null;
  canCollect: boolean;
}

const BILLING_SETUP_REASON_LABELS: Record<string, string> = {
  no_billing_account: 'אין חשבון חיוב מוגדר לעמותה',
  account_suspended: 'חשבון החיוב מושהה',
};

const HE_MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

@Component({
  selector: 'app-platform-billing-ops-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './platform-billing-ops-page.component.html',
  styleUrl: './platform-billing-ops-page.component.css',
})
export class PlatformBillingOpsPageComponent implements OnInit {
  private service = inject(BillingOpsService);
  private route = inject(ActivatedRoute);

  tab: Tab = 'periods';

  // "Return to the workflow" -- set when arriving back from the focused
  // Billing setup screen (platform-billing-setup-page) right after it
  // created a billing_account, so the operator sees the confirmation here
  // instead of having to go find the entity again.
  justSetupEntityName: string | null = null;

  // ---- periods & calculation -------------------------------------------
  periods: BillingPeriod[] = [];
  periodsLoading = true;
  periodsError: string | null = null;
  newPeriodStart = '';
  newPeriodEnd = '';
  newPeriodStartDate = '';
  newPeriodStartTime = '00:00';
  newPeriodEndDate = '';
  newPeriodEndTime = '00:00';
  creatingPeriod = false;
  periodActionError: string | null = null;
  showCreateForm = false;
  showAdvanced = false;
  confirmingRecalcPeriodId: string | null = null;

  runs: BillingRun[] = [];
  runsLoading = false;
  calculatingPeriodId: string | null = null;
  calcAsOf = '';
  calcAsOfDate = '';
  calcAsOfTime = '';

  // ---- statements ---------------------------------------------------
  statements: StatementListItem[] = [];
  statementsLoading = true;
  statementsError: string | null = null;
  filterPeriodId = '';
  filterStatus = '';

  selectedStatement: StatementDetail | null = null;
  statementDetailLoading = false;
  statementActionBusy = false;
  statementActionError: string | null = null;

  // ---- bulk approval (current-period table) ---------------------------
  // Normal operator workflow: Calculation -> review table -> bulk approve.
  // The drawer above (openStatement/approveStatement) stays the path for
  // exceptional/manual single-Statement inspection -- untouched by this.
  selectedApprovalStatementIds = new Set<string>();
  bulkApprovalBusy = false;
  bulkApprovalError: string | null = null;
  bulkApprovalResult: { approvedText: string | null; failedText: string | null } | null = null;

  // ---- masav ----------------------------------------------------------
  blockedStatements: BlockedMasavStatement[] = [];
  actionableStatements: ActionableMasavStatement[] = [];
  masavLoading = true;
  masavError: string | null = null;

  configuringEntityId: string | null = null;
  masavBankCode = '';
  masavBranchCode = '';
  masavAccountNumber = '';
  masavAccountHolderName = '';
  masavFormBusy = false;
  masavFormError: string | null = null;

  selectedExportStatementIds = new Set<string>();
  exporting = false;
  exportError: string | null = null;

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const requestedTab = qp.get('tab') as Tab | null;
    if (requestedTab === 'periods' || requestedTab === 'statements' || requestedTab === 'masav') {
      this.tab = requestedTab;
    }
    this.justSetupEntityName = qp.get('justSetupName') || (qp.get('justSetupEntity') ? 'העמותה' : null);

    this.loadPeriods();
    this.loadStatements();
    this.loadMasav();
  }

  setTab(tab: Tab): void {
    this.tab = tab;
  }

  dismissJustSetupBanner(): void {
    this.justSetupEntityName = null;
  }

  // ---- periods & calculation -------------------------------------------

  private loadPeriods(): void {
    this.periodsLoading = true;
    this.periodsError = null;
    this.service.listPeriods().subscribe({
      next: (res) => {
        this.periods = res.periods;
        this.periodsLoading = false;
      },
      error: () => {
        this.periodsError = 'שגיאה בטעינת תקופות חיוב';
        this.periodsLoading = false;
      },
    });
    this.loadRuns();
  }

  private loadRuns(): void {
    this.runsLoading = true;
    this.service.listRuns().subscribe({
      next: (res) => { this.runs = res.runs; this.runsLoading = false; },
      error: () => { this.runsLoading = false; },
    });
  }

  private combineDateTime(date: string, time: string): string {
    if (!date) return '';
    return `${date}T${time || '00:00'}`;
  }

  updateNewPeriodStart(): void {
    this.newPeriodStart = this.combineDateTime(this.newPeriodStartDate, this.newPeriodStartTime);
  }

  updateNewPeriodEnd(): void {
    this.newPeriodEnd = this.combineDateTime(this.newPeriodEndDate, this.newPeriodEndTime);
  }

  updateCalcAsOf(): void {
    this.calcAsOf = this.combineDateTime(this.calcAsOfDate, this.calcAsOfTime);
  }

  createPeriod(): void {
    if (this.creatingPeriod || !this.newPeriodStart || !this.newPeriodEnd) return;
    this.creatingPeriod = true;
    this.periodActionError = null;
    this.service.createPeriod(this.newPeriodStart, this.newPeriodEnd).subscribe({
      next: () => {
        this.creatingPeriod = false;
        this.newPeriodStart = '';
        this.newPeriodEnd = '';
        this.newPeriodStartDate = '';
        this.newPeriodStartTime = '00:00';
        this.newPeriodEndDate = '';
        this.newPeriodEndTime = '00:00';
        this.showCreateForm = false;
        this.loadPeriods();
      },
      error: (err) => {
        this.creatingPeriod = false;
        this.periodActionError = err?.error?.error || 'יצירת התקופה נכשלה';
      },
    });
  }

  calculatePeriod(period: BillingPeriod): void {
    if (this.calculatingPeriodId) return;
    this.calculatingPeriodId = period.id;
    this.periodActionError = null;
    this.service.calculatePeriod(period.id, this.calcAsOf || undefined).subscribe({
      next: () => {
        this.calculatingPeriodId = null;
        this.loadPeriods();
        this.loadStatements();
      },
      error: (err) => {
        this.calculatingPeriodId = null;
        this.periodActionError = err?.error?.error || 'הרצת החישוב נכשלה';
      },
    });
  }

  runsForPeriod(periodId: string): BillingRun[] {
    return this.runs.filter((r) => r.billing_period_id === periodId);
  }

  // ---- operational periods view ----------------------------------------
  // "Current period" = the latest non-retired period. Retired periods
  // (test/harness residue, see billing_periods.retired) never show up as
  // the operator's current period or clutter the previous-periods list --
  // they're invisible here without being touched at the data layer.

  get currentPeriod(): BillingPeriod | null {
    const active = this.periods.filter((p) => !p.retired);
    return active.length ? active[0] : null;
  }

  get previousPeriods(): BillingPeriod[] {
    const active = this.periods.filter((p) => !p.retired);
    return active.slice(1);
  }

  periodStatementCount(periodId: string): number {
    return this.statements.filter((s) => s.billing_period_id === periodId).length;
  }

  periodTotalDue(periodId: string): string {
    const sum = this.statements
      .filter((s) => s.billing_period_id === periodId)
      .reduce((acc, s) => acc + Number(s.total_due), 0);
    return sum.toFixed(2);
  }

  periodStatements(periodId: string): StatementListItem[] {
    return this.statements.filter((s) => s.billing_period_id === periodId);
  }

  // Aggregates already-authoritative per-Statement values (same pattern as
  // periodTotalDue above) -- never re-derives fee/VAT/total, only sums them.
  periodStatementTotals(periodId: string): { donations: number; gross: number; fee: number; vat: number; due: number } {
    return this.periodStatements(periodId).reduce(
      (acc, s) => ({
        donations: acc.donations + (s.component_count ?? 0),
        gross: acc.gross + Number(s.gross_raised),
        fee: acc.fee + Number(s.fee_amount),
        vat: acc.vat + Number(s.vat_amount),
        due: acc.due + Number(s.total_due),
      }),
      { donations: 0, gross: 0, fee: 0, vat: 0, due: 0 },
    );
  }

  // Primary-summary numbers must represent the period's total historical
  // activity, stable across draft -> approved -> collection -> paid --
  // NOT "activity still eligible for a future Calculation run".
  //
  // The old implementation read the latest run's activityDiscovered
  // (calculation.service.js Stage A) directly. That figure is computed with
  // `effective_statement_id IS NULL` at calculation time and then FROZEN
  // into billing_runs.result_summary -- so it does not itself change after
  // Approval. But it goes stale the moment a *later* Calculation run
  // executes on the same period: by then, every donation Approval already
  // claimed is (correctly) no longer "eligible", so a fresh Stage A query
  // finds 0 remaining activity for those entities -- and since the KPI blindly
  // took runs[0] (ORDER BY created_at DESC), a recalculation after approval
  // made the tiles read 0/0/0 even though the period's real Statements (and
  // real money, ₪7.61 total_due) were completely unaffected. Confirmed
  // against the real August period's billing_runs: run c391453b
  // (2026-09-02T05:51) recorded activityDiscovered 13/₪215/2 and created the
  // two real Statements; a later run 524da916 (07:32) found 0 remaining
  // activity for the same two entities (now correctly claimed) and became
  // runs[0], zeroing the tiles.
  //
  // Fix: combine two non-overlapping sources so nothing is ever double
  // counted --
  //   (a) authoritative, frozen totals from every Statement that already
  //       exists for this period, any lifecycle status (periodStatementTotals
  //       / periodStatements, backed by statements.gross_raised and
  //       statement_components -- immutable once Calculation writes them,
  //       untouched by Approval); plus
  //   (b) real activity the latest Calculation run discovered but that has
  //       NOT been captured by any Statement in this period at all -- i.e.
  //       latestRunSummary(period).blockedEntities, entities Stage C
  //       explicitly skipped creating a Statement for (no/suspended
  //       billing_account). A donation can only ever be in bucket (a) (it
  //       requires a real statement_components row) or bucket (b) (Stage C
  //       only lists entities that got no Statement) -- never both -- so
  //       filtering blockedEntities down to entity ids NOT already present
  //       among this period's Statements is enough to guarantee no overlap.
  private periodCapturedActivity(period: BillingPeriod): { donations: number; gross: number; entities: number } {
    const captured = this.periodStatementTotals(period.id);
    const capturedEntityIds = new Set(this.periodStatements(period.id).map((s) => s.entity_id));

    const uncaptured = this.periodBlockedEntities(period).filter((b) => !capturedEntityIds.has(b.entityId));
    const uncapturedDonations = uncaptured.reduce((sum, b) => sum + b.donationCount, 0);
    const uncapturedGross = uncaptured.reduce((sum, b) => sum + Number(b.grossAmount), 0);

    return {
      donations: captured.donations + uncapturedDonations,
      gross: captured.gross + uncapturedGross,
      entities: capturedEntityIds.size + uncaptured.length,
    };
  }

  periodDonationsCount(period: BillingPeriod): number {
    return this.periodCapturedActivity(period).donations;
  }

  periodGrossAmount(period: BillingPeriod): number {
    return this.periodCapturedActivity(period).gross;
  }

  periodEntitiesCount(period: BillingPeriod): number {
    return this.periodCapturedActivity(period).entities;
  }

  periodStatementStatusLabel(status: string): string {
    return this.statementStatusLabel(status);
  }

  // "מה המצב?" -- one clear phase, derived only from actual existing state
  // (run history + real draft-statement rows), never invented.
  periodPhaseLabel(period: BillingPeriod): string {
    const runs = this.runsForPeriod(period.id);
    if (runs.length === 0) return 'טרם חושב';
    const latest = runs[0];
    if (!latest.result_summary) return 'מריץ חישוב...';
    const draftCount = this.statements.filter(
      (s) => s.billing_period_id === period.id && s.status === 'draft',
    ).length;
    if (draftCount > 0) return 'חשבונות ממתינים לאישור';
    const blocked = latest.result_summary.blockedEntities;
    if (blocked && blocked.length > 0) return 'החישוב הסתיים — יש עמותות שדורשות השלמת הגדרות חיוב';
    if (latest.result_summary.statementsCreated === 0) return 'החישוב הסתיים — ללא חשבונות לחיוב';
    return 'החישוב הסתיים';
  }

  latestRunSummary(period: BillingPeriod): BillingRun['result_summary'] | null {
    const runs = this.runsForPeriod(period.id);
    return runs.length ? runs[0].result_summary : null;
  }

  // Only present on runs executed after the Billing readiness correction
  // (2026-09-02) -- older runs in run history simply have no blocked
  // entities to show, not an error.
  periodBlockedEntities(period: BillingPeriod): BlockedBillingEntity[] {
    return this.latestRunSummary(period)?.blockedEntities ?? [];
  }

  periodActivityDiscovered(period: BillingPeriod): BillingActivityDiscovered | null {
    return this.latestRunSummary(period)?.activityDiscovered ?? null;
  }

  blockingReasonLabel(reason: string): string {
    return BILLING_SETUP_REASON_LABELS[reason] ?? reason;
  }

  notificationStatusLabel(entity: BlockedBillingEntity): string {
    const n = entity.notification;
    if (!n) return '';
    if (n.sent) return 'נשלחה התראה למנהל העמותה';
    if (n.reason === 'already_notified') return 'התראה נשלחה בעבר עבור תקופה זו';
    if (n.reason === 'no_admin_found') return 'לא נמצא מנהל עמותה לשליחת התראה';
    return '';
  }

  // "מה יצא?" -- a single narrative that first states the real, known fact
  // (donation activity discovered this period, independent of any
  // billing_account) and only then explains how much of it produced a
  // financial Statement -- so "0 Statements" never reads as "0 activity"
  // when real donations exist. Falls back to the pre-correction wording for
  // any run executed before activityDiscovered existed on result_summary.
  periodResultDetail(period: BillingPeriod): { text: string; isWarning: boolean } | null {
    const runs = this.runsForPeriod(period.id);
    if (runs.length === 0) return null;
    const s = runs[0].result_summary;
    if (!s) return null;
    if (s.errors.length > 0) {
      return { text: `${s.errors.length} חשבונות נכשלו בחישוב — יש לבדוק בלוגים`, isWarning: true };
    }

    const activity = s.activityDiscovered;
    if (!activity) {
      // legacy result_summary shape (run predates this correction)
      if (s.accountsEvaluated === 0) {
        return { text: 'לא נמצאו חשבונות חיוב פעילים לבדיקה בתקופה זו', isWarning: false };
      }
      if (s.statementsCreated === 0) {
        return {
          text: `נבדקו ${s.accountsEvaluated} חשבונות חיוב, ולא נמצאה עבור אף אחד מהם פעילות (תרומות) בתקופה זו`,
          isWarning: false,
        };
      }
      return {
        text: `${s.statementsCreated} חשבונות לחיוב נוצרו מתוך ${s.accountsEvaluated} חשבונות שנבדקו`,
        isWarning: false,
      };
    }

    if (activity.entitiesWithActivity === 0) {
      return { text: 'לא נמצאה פעילות תרומות (בתשלום) בתקופה זו', isWarning: false };
    }

    const blocked = s.blockedEntities ?? [];
    const base = `חישוב התקופה הושלם — ${activity.totalDonations} תרומות | ₪${activity.totalGross.toFixed(2)} | ${activity.entitiesWithActivity} עמותות עם פעילות`;

    if (blocked.length > 0) {
      return {
        text: `${base} — ${blocked.length} מהן דורשות השלמת הגדרות חיוב ולא הופק להן חשבון לחיוב (${s.statementsCreated} חשבונות לחיוב הופקו)`,
        isWarning: true,
      };
    }
    if (s.statementsCreated === 0) {
      return { text: `${base} — לא הופקו חשבונות לחיוב`, isWarning: false };
    }
    return { text: `${base} — ${s.statementsCreated} חשבונות לחיוב הופקו`, isWarning: false };
  }

  // Recalculating a period that already has draft (unapproved) Statements
  // can double-cover the same donations: eligibility is
  // effective_statement_id IS NULL, cleared only on approval, not on
  // calculation (see calculation.service.js's own header comment) -- so a
  // rerun before approving is not a safe no-op. Require an explicit,
  // separate confirmation rather than letting "הרץ חישוב מחדש" behave like
  // an ordinary primary action.
  onCalculateClick(period: BillingPeriod): void {
    if (period.run_count > 0 && this.confirmingRecalcPeriodId !== period.id) {
      this.confirmingRecalcPeriodId = period.id;
      return;
    }
    this.confirmingRecalcPeriodId = null;
    this.calculatePeriod(period);
  }

  cancelRecalcConfirm(): void {
    this.confirmingRecalcPeriodId = null;
  }

  // Only claims a calendar-month label when period_start genuinely falls
  // on the 1st -- never mislabels a custom/partial range as "אוגוסט 2026".
  periodMonthLabel(period: BillingPeriod): string | null {
    const d = new Date(period.period_start);
    if (d.getDate() !== 1) return null;
    return `${HE_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${d.getFullYear()}`;
  }

  // period_end is an exclusive boundary ([start, end)) -- stepping back
  // 1ms always lands on the real last covered instant, so the displayed
  // "end date" reads as the last day of the period, not the day after it.
  fmtInclusiveEndDate(iso: string | null): string {
    if (!iso) return '—';
    return this.fmtDate(new Date(new Date(iso).getTime() - 1).toISOString());
  }

  // ---- statements -----------------------------------------------------

  loadStatements(): void {
    this.statementsLoading = true;
    this.statementsError = null;
    this.service.listStatements({ periodId: this.filterPeriodId || undefined, status: this.filterStatus || undefined }).subscribe({
      next: (res) => {
        this.statements = res.statements;
        this.statementsLoading = false;
        this.pruneApprovalSelection();
      },
      error: () => {
        this.statementsError = 'שגיאה בטעינת חשבונות לחיוב';
        this.statementsLoading = false;
      },
    });
  }

  openStatement(statement: StatementListItem): void {
    this.statementDetailLoading = true;
    this.statementActionError = null;
    this.selectedStatement = null;
    this.service.getStatement(statement.id).subscribe({
      next: (res) => {
        this.selectedStatement = res.statement;
        this.statementDetailLoading = false;
      },
      error: () => {
        this.statementDetailLoading = false;
        this.statementActionError = 'שגיאה בטעינת פרטי חשבון לחיוב';
      },
    });
  }

  closeStatement(): void {
    this.selectedStatement = null;
  }

  private refreshSelectedStatement(): void {
    if (!this.selectedStatement) return;
    const id = this.selectedStatement.id;
    this.service.getStatement(id).subscribe({ next: (res) => { this.selectedStatement = res.statement; } });
    this.loadStatements();
  }

  // Only draft Statements are eligible for bulk approval -- anything else
  // (approved/open/paid/abandoned/...) is either already handled or belongs
  // to the individual drawer for exceptional inspection.
  eligibleForBulkApproval(periodId: string): StatementListItem[] {
    return this.periodStatements(periodId).filter((s) => s.status === 'draft');
  }

  isSelectedForApproval(statementId: string): boolean {
    return this.selectedApprovalStatementIds.has(statementId);
  }

  toggleApprovalSelection(statementId: string): void {
    if (this.selectedApprovalStatementIds.has(statementId)) this.selectedApprovalStatementIds.delete(statementId);
    else this.selectedApprovalStatementIds.add(statementId);
    this.bulkApprovalResult = null;
  }

  isAllEligibleSelected(periodId: string): boolean {
    const eligible = this.eligibleForBulkApproval(periodId);
    return eligible.length > 0 && eligible.every((s) => this.selectedApprovalStatementIds.has(s.id));
  }

  toggleSelectAllEligible(periodId: string): void {
    const eligible = this.eligibleForBulkApproval(periodId);
    if (this.isAllEligibleSelected(periodId)) {
      eligible.forEach((s) => this.selectedApprovalStatementIds.delete(s.id));
    } else {
      eligible.forEach((s) => this.selectedApprovalStatementIds.add(s.id));
    }
    this.bulkApprovalResult = null;
  }

  // Drops any selected id that no longer refers to an eligible draft
  // Statement after a reload (approved elsewhere, abandoned, etc.) -- keeps
  // the button's count and the actual request in sync with what's on screen.
  private pruneApprovalSelection(): void {
    const draftIds = new Set(this.statements.filter((s) => s.status === 'draft').map((s) => s.id));
    for (const id of [...this.selectedApprovalStatementIds]) {
      if (!draftIds.has(id)) this.selectedApprovalStatementIds.delete(id);
    }
  }

  bulkApproveSelected(): void {
    const statementIds = [...this.selectedApprovalStatementIds];
    if (statementIds.length === 0 || this.bulkApprovalBusy) return;
    this.bulkApprovalBusy = true;
    this.bulkApprovalError = null;
    this.bulkApprovalResult = null;
    this.service.bulkApproveStatements(statementIds).subscribe({
      next: (res) => {
        this.bulkApprovalBusy = false;
        this.bulkApprovalResult = this.summarizeBulkApproval(res.result);
        this.selectedApprovalStatementIds.clear();
        this.loadStatements();
      },
      error: (err) => {
        this.bulkApprovalBusy = false;
        this.bulkApprovalError = err?.error?.error || 'אישור מרוכז נכשל';
      },
    });
  }

  private summarizeBulkApproval(result: BulkApproveResult): { approvedText: string | null; failedText: string | null } {
    const approvedText = result.approvedCount === 0 ? null
      : result.approvedCount === 1 ? '1 חשבון אושר'
      : `${result.approvedCount} חשבונות אושרו`;
    const failedText = result.failedCount === 0 ? null
      : result.failedCount === 1 ? '1 חשבון דורש טיפול'
      : `${result.failedCount} חשבונות דורשים טיפול`;
    return { approvedText, failedText };
  }

  approveStatement(): void {
    if (!this.selectedStatement || this.statementActionBusy) return;
    this.statementActionBusy = true;
    this.statementActionError = null;
    this.service.approveStatement(this.selectedStatement.id).subscribe({
      next: () => { this.statementActionBusy = false; this.refreshSelectedStatement(); },
      error: (err) => { this.statementActionBusy = false; this.statementActionError = err?.error?.error || 'האישור נכשל'; },
    });
  }

  abandonStatement(): void {
    if (!this.selectedStatement || this.statementActionBusy) return;
    this.statementActionBusy = true;
    this.statementActionError = null;
    this.service.abandonStatement(this.selectedStatement.id).subscribe({
      next: () => { this.statementActionBusy = false; this.refreshSelectedStatement(); },
      error: (err) => { this.statementActionBusy = false; this.statementActionError = err?.error?.error || 'הביטול נכשל'; },
    });
  }

  // Truthful collection state for the drawer (Billing Collection UX
  // truthfulness fix, 2026-09-02) -- reads only StatementDetail.readiness,
  // the same rule the backend independently re-checks before ever calling
  // the collection engine (billing-ops.service.js#triggerCollection). The
  // action button below is only ever shown when canCollect is true, so the
  // UI can never again expose an enabled action while describing the
  // Statement as blocked/not ready.
  collectionState(statement: StatementDetail): CollectionState {
    const readiness = statement.readiness;
    if (!readiness) return { label: '—', sublabel: null, canCollect: false };

    if (readiness.route === 'card') {
      if (readiness.ready) {
        return { label: 'מוכן לגבייה בכרטיס', sublabel: `₪${statement.total_due}`, canCollect: true };
      }
      return { label: 'דורש טיפול', sublabel: 'לא הוגדר אמצעי גבייה בכרטיס', canCollect: false };
    }

    // route === 'masav' -- actual MASAV collection is driven from the מס״ב
    // tab (export/authorize flow), never from this generic button.
    if (readiness.ready) {
      return { label: 'מוכן למס״ב', sublabel: null, canCollect: false };
    }
    return { label: 'דורש טיפול', sublabel: 'חסרים פרטי מס״ב / הרשאת מס״ב', canCollect: false };
  }

  triggerCollection(): void {
    if (!this.selectedStatement || this.statementActionBusy || !this.collectionState(this.selectedStatement).canCollect) return;
    this.statementActionBusy = true;
    this.statementActionError = null;
    this.service.triggerCollection(this.selectedStatement.id).subscribe({
      next: (res) => {
        this.statementActionBusy = false;
        if (res.result?.skipped) {
          this.statementActionError = `הפעולה לא ביצעה גבייה: ${res.result.reason}`;
        }
        this.refreshSelectedStatement();
      },
      error: (err) => {
        this.statementActionBusy = false;
        this.statementActionError = err?.error?.code === 'NOT_COLLECTION_READY'
          ? 'החשבון אינו מוכן לגבייה כרגע — רעננו את המסך ונסו שוב'
          : (err?.error?.error || 'הפעלת הגבייה נכשלה');
        this.refreshSelectedStatement();
      },
    });
  }

  statementStatusLabel(status: string): string {
    return STATEMENT_STATUS_LABELS[status] ?? status;
  }

  attemptStatusLabel(status: string | null): string {
    if (!status) return '—';
    return ATTEMPT_STATUS_LABELS[status] ?? status;
  }

  routedMethodLabel(method: string): string {
    if (method === 'card') return 'כרטיס אשראי';
    if (method === 'masav') return 'מס״ב';
    return 'חסום';
  }

  // ---- masav ------------------------------------------------------------

  loadMasav(): void {
    this.masavLoading = true;
    this.masavError = null;
    this.service.listBlockedMasavStatements().subscribe({
      next: (res) => { this.blockedStatements = res.statements; this.masavLoading = false; },
      error: () => { this.masavError = 'שגיאה בטעינת Statements חסומים'; this.masavLoading = false; },
    });
    this.service.listActionableMasavStatements().subscribe({
      next: (res) => { this.actionableStatements = res.statements; },
      error: () => {},
    });
  }

  blockedReasonLabel(reason: string): string {
    return BLOCKED_REASON_LABELS[reason] ?? reason;
  }

  openConfigureForm(entityId: string): void {
    this.configuringEntityId = entityId;
    this.masavBankCode = '';
    this.masavBranchCode = '';
    this.masavAccountNumber = '';
    this.masavAccountHolderName = '';
    this.masavFormError = null;
  }

  cancelConfigureForm(): void {
    this.configuringEntityId = null;
  }

  submitMasavConfig(): void {
    if (!this.configuringEntityId || this.masavFormBusy) return;
    if (!this.masavBankCode || !this.masavBranchCode || !this.masavAccountNumber) {
      this.masavFormError = 'יש למלא בנק, סניף ומספר חשבון';
      return;
    }
    this.masavFormBusy = true;
    this.masavFormError = null;
    this.service
      .upsertMasavConfig(this.configuringEntityId, {
        bankCode: this.masavBankCode,
        branchCode: this.masavBranchCode,
        accountNumber: this.masavAccountNumber,
        accountHolderName: this.masavAccountHolderName || undefined,
      })
      .subscribe({
        next: () => {
          this.masavFormBusy = false;
          this.configuringEntityId = null;
          this.loadMasav();
        },
        error: (err) => {
          this.masavFormBusy = false;
          this.masavFormError = err?.error?.error || 'שמירת פרטי הבנק נכשלה';
        },
      });
  }

  authorizeEntity(entityId: string): void {
    this.masavFormBusy = true;
    this.masavFormError = null;
    this.service.authorizeMasav(entityId).subscribe({
      next: () => { this.masavFormBusy = false; this.loadMasav(); },
      error: (err) => { this.masavFormBusy = false; this.masavError = err?.error?.error || 'אישור ההרשאה נכשל'; },
    });
  }

  revokeEntity(entityId: string): void {
    this.masavFormBusy = true;
    this.masavError = null;
    this.service.revokeMasav(entityId).subscribe({
      next: () => { this.masavFormBusy = false; this.loadMasav(); },
      error: (err) => { this.masavFormBusy = false; this.masavError = err?.error?.error || 'ביטול ההרשאה נכשל'; },
    });
  }

  openMasavAttempt(statementId: string): void {
    this.masavError = null;
    this.service.openMasavAttempt(statementId).subscribe({
      next: () => this.loadMasav(),
      error: (err) => { this.masavError = err?.error?.error || 'פתיחת ניסיון הגבייה נכשלה'; },
    });
  }

  toggleExportSelection(statementId: string): void {
    if (this.selectedExportStatementIds.has(statementId)) this.selectedExportStatementIds.delete(statementId);
    else this.selectedExportStatementIds.add(statementId);
  }

  isSelectedForExport(statementId: string): boolean {
    return this.selectedExportStatementIds.has(statementId);
  }

  exportSelected(): void {
    if (this.exporting || this.selectedExportStatementIds.size === 0) return;
    this.exporting = true;
    this.exportError = null;
    this.service.exportMasavExcel([...this.selectedExportStatementIds]).subscribe({
      next: (blob) => {
        this.exporting = false;
        this.downloadExcel(blob);
      },
      error: (err) => {
        this.exporting = false;
        this.exportError = err?.error?.error || 'הפקת קובץ הייצוא נכשלה';
      },
    });
  }

  // v1 stops here: once the operator downloads this file, submission to
  // MASAV, collection, and the result are all handled manually outside
  // Hamonym -- there is no further in-app action on this attempt.
  private downloadExcel(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `masav-export-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  fmtDateTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hh}:${mm}`;
  }
}
