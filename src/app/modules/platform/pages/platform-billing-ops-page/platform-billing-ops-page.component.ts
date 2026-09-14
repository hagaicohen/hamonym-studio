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
  MasavConfig,
  CollectionAttempt,
  ReconcileAttemptResult,
} from '../../services/billing-ops.service';

import {
  MASAV_INSTITUTION_CODE,
  MASAV_BENEFICIARY_NAME,
  MASAV_ACK_TEXT,
  MASAV_WHY_UNLIMITED_TITLE,
  MASAV_WHY_UNLIMITED_TEXT,
  MASAV_UPLOAD_HELPER_TEXT,
  MASAV_PENDING_STATUS_LABEL,
  MASAV_PENDING_STATUS_SUBLABEL,
} from '../../../../shared/constants/masav.constants';

import { ISRAELI_BANKS, IsraeliBank } from '../../../../shared/constants/israeli-banks.constants';
import { BillingProvisioningService, BillingReadinessEntity } from '../../services/billing-provisioning.service';
import { CardcomOpsService, ReconciliationFinding, HealthResponse, JobRun, JobHealth } from '../../services/cardcom-ops.service';
import {
  jobLabel as sharedJobLabel,
  jobFrequency as sharedJobFrequency,
  findingTypeLabel as sharedFindingTypeLabel,
  jobArea as sharedJobArea,
  PROVIDER_FINDING_TYPES,
} from '../../utils/ops-labels';

// Internal tab keys unchanged from before this pass ('entities' is the only
// new one, for "הגדרות עמותות") -- only the operator-facing LABELS change
// (see the template): "periods" reads "החודש", "statements" reads "כל
// החיובים". Kept as-is internally so existing tests/deep-links (?tab=...)
// stay valid.
type Tab = 'periods' | 'statements' | 'entities' | 'masav';

// One line in the "דורש טיפול" section of the "החודש" tab -- reuses
// CardcomOpsService (same data "תרומות" reads) filtered to the commission
// area only, per the 2026-09-14 UX simplification's explicit instruction
// not to build a new cross-page aggregation architecture: this page just
// asks the same existing endpoint for the same existing data and keeps the
// slice relevant to billing/collection.
interface CommissionIssue {
  id: string;
  title: string;
  subtitle: string;
  severity: 'critical' | 'warning';
}

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
  // Distinct from 'ambiguous' on purpose (backend fix 2026-09-07): CardCom
  // gave a documented, authoritative "no successful transaction" answer
  // (ResponseCode 9998) for this attempt, not genuine uncertainty -- must
  // never read "לא ודאי" again.
  not_found_confirmed: 'לא נמצאה עסקה מוצלחת',
};

// Copy for the "בדוק מול הספק" (reconcile) button's result -- one line per
// possible ReconcileAttemptResult.outcome. failureReason (when present) is
// appended by reconcileOutcomeMessage() below, never baked in here.
const RECONCILE_OUTCOME_MESSAGES: Record<string, string> = {
  succeeded: 'הספק מצא עסקה מוצלחת — נרשם תשלום',
  not_found: 'הספק מאשר: העסקה לא נמצאה',
  not_found_confirmed: 'הספק מאשר: לא נמצאה עסקה מוצלחת עבור ניסיון זה',
  declined: 'הספק מדווח: העסקה נדחתה',
  technical_failure: 'הספק מדווח: תקלה טכנית בעסקה',
  ambiguous: 'הבדיקה מול הספק נכשלה',
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
  private provisioningService = inject(BillingProvisioningService);
  private cardcomOps = inject(CardcomOpsService);

  // "החודש" is the default entry point (UX simplification pass,
  // 2026-09-14) -- the month-by-month workflow (חשב חיובים -> בדוק ואשר ->
  // בצע גבייה) is now the operator's primary mental model; "כל החיובים"
  // stays available as the cross-period history/search tab.
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
  // "בחר חודש" -- bound to a native <input type="month">, giving "YYYY-MM"
  // directly; Hamonym derives the exact calendar boundaries itself
  // (billing-period.util.js#computeCalendarMonthUtcBoundary, the same
  // function the automatic monthly job uses) -- the operator never types a
  // raw start/end timestamp. 2026-09-13, Billing Ops operator-control
  // hardening.
  selectedMonth = '';
  creatingPeriod = false;
  periodActionError: string | null = null;
  showAdvanced = false;

  runs: BillingRun[] = [];
  runsLoading = false;
  calculatingPeriodId: string | null = null;
  // Not settable from the UI anymore (2026-09-13, kept out of the normal
  // operator workflow per that decision) -- calculatePeriod() below still
  // accepts it, so the backend capability (diagnostics/tests) is untouched.
  calcAsOf = '';

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

  // ---- collection attempt reconcile ("בדוק מול הספק") -------------------
  reconcilingAttemptId: string | null = null;
  reconcileMessage: string | null = null;
  reconcileError: string | null = null;

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
  configuringEntityName = '';
  masavBankCode = '';
  masavBranchCode = '';
  masavAccountNumber = '';
  masavAccountHolderName = '';
  masavFormBusy = false;
  masavFormError: string | null = null;
  masavInstitutionCode = MASAV_INSTITUTION_CODE;
  masavCodeCopied = false;
  masavBeneficiaryName = MASAV_BENEFICIARY_NAME;
  masavAckText = MASAV_ACK_TEXT;
  masavWhyUnlimitedTitle = MASAV_WHY_UNLIMITED_TITLE;
  masavWhyUnlimitedText = MASAV_WHY_UNLIMITED_TEXT;
  masavUploadHelperText = MASAV_UPLOAD_HELPER_TEXT;
  masavPendingStatusLabel = MASAV_PENDING_STATUS_LABEL;
  masavPendingStatusSublabel = MASAV_PENDING_STATUS_SUBLABEL;
  readonly israeliBanks: IsraeliBank[] = ISRAELI_BANKS;
  masavAckChecked = false;

  // Setup-screen additions (MASAV setup UX, 2026-09-03) -- the collapsible
  // "how do I get this document" explanation, the loaded config (to show
  // current authorized/document state read-only in the drawer), and the
  // signed-document upload, which is deliberately separate from the bank
  // fields above: uploading evidence never flips `authorized` on its own,
  // see billing-ops.service.ts#MasavConfig / masav-config.service.js.
  masavShowHelp = false;
  masavConfig: MasavConfig | null = null;
  masavConfigLoading = false;
  masavDocFile: File | null = null;
  masavDocUploading = false;
  masavDocUploadError: string | null = null;
  masavDocDownloading = false;

  // Replaces the raw "type an entity UUID" input for MASAV authorization
  // revocation (UX simplification pass, 2026-09-14) -- reuses the same
  // readiness list "הגדרות עמותות" loads, filtered to entities that
  // actually have MASAV configured (only those can meaningfully be
  // revoked). Never touches MASAV business logic -- still calls the exact
  // same revokeMasav(entityId) the old free-text field called.
  revokeEntityId = '';

  // ---- הגדרות עמותות (billing-account provisioning, merged in 2026-09-14
  // from the old standalone /platform/billing-accounts page) --------------
  readinessEntities: BillingReadinessEntity[] = [];
  readinessLoading = true;
  readinessError: string | null = null;

  provisionEntityId: string | null = null;
  provisionFeeRatePercent = 3;
  provisionVatRatePercent = 18;
  provisionCollectionMethod: 'card' | 'masav' = 'card';
  provisionNotes = '';
  provisionBusy = false;
  provisionError: string | null = null;

  // ---- "דורש טיפול" (commission-area issues, reused from the same data
  // "תרומות" shows, filtered here to billing/collection concerns only --
  // see this class's header note and ../../utils/ops-labels.ts) ----------
  commissionIssues: CommissionIssue[] = [];

  selectedExportStatementIds = new Set<string>();
  exporting = false;
  exportError: string | null = null;

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const requestedTab = qp.get('tab') as Tab | null;
    if (requestedTab === 'periods' || requestedTab === 'statements' || requestedTab === 'entities' || requestedTab === 'masav') {
      this.tab = requestedTab;
    }
    this.justSetupEntityName = qp.get('justSetupName') || (qp.get('justSetupEntity') ? 'העמותה' : null);

    this.loadPeriods();
    this.loadStatements();
    this.loadMasav();
    this.loadReadiness();
    this.loadCommissionIssues();
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
        this.syncSelectedMonthToDisplayedPeriod();
      },
      error: () => {
        this.periodsError = 'שגיאה בטעינת תקופות חיוב';
        this.periodsLoading = false;
      },
    });
    this.loadRuns();
  }

  // Keeps the compact month control showing "what you're looking at" by
  // default (2026-09-14 "החודש" refinement) -- a one-time sync on load/
  // navigation, not a live two-way binding to the getter, so the operator
  // can still freely type a different month without fighting it.
  private syncSelectedMonthToDisplayedPeriod(): void {
    if (this.selectedMonth) return; // operator is mid-typing a different month -- never overwrite
    const period = this.displayedPeriod;
    if (period) this.selectedMonth = this.monthInputValue(period);
  }

  monthInputValue(period: BillingPeriod): string {
    const d = new Date(period.period_start);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private loadRuns(): void {
    this.runsLoading = true;
    this.service.listRuns().subscribe({
      next: (res) => { this.runs = res.runs; this.runsLoading = false; },
      error: () => { this.runsLoading = false; },
    });
  }

  // "החודש" always displays a specific period -- the one the operator
  // navigated to via the compact month control, or (by default, on first
  // load) the latest one. Kept as its own concept (2026-09-14 "החודש"
  // refinement) specifically so removing the old "חודשים קודמים" table
  // never loses the ability to open/calculate a NON-latest month: typing
  // any month here still reaches it, exactly as that table used to.
  focusedPeriodId: string | null = null;

  // "בחר חודש" -> "חשב חיובים". selectedMonth is the native <input
  // type="month"> value, "YYYY-MM" -- parsed here, boundaries derived
  // server-side (createPeriodForMonth) via the exact same function the
  // automatic job uses, so picking "2026-08" always resolves to the one
  // real August 2026 billing_period, never a duplicate.
  createPeriodForMonth(): void {
    if (this.creatingPeriod || !this.selectedMonth) return;
    const [yearStr, monthStr] = this.selectedMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return;

    this.creatingPeriod = true;
    this.periodActionError = null;
    this.service.createPeriodForMonth(year, month).subscribe({
      next: (res) => {
        this.creatingPeriod = false;
        this.focusedPeriodId = res.period.id;
        this.loadPeriods();
      },
      error: (err) => {
        this.creatingPeriod = false;
        this.periodActionError = err?.error?.error || 'בחירת חודש החיוב נכשלה';
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

  // The period "החודש" actually shows -- the operator's explicit selection
  // (focusedPeriodId, set by the compact month control) when it still
  // resolves to a real period, otherwise the latest one. This is what lets
  // the compact selector alone reach any month, including a non-latest one
  // to calculate -- the exact capability the old "חודשים קודמים" table
  // used to be the only way to reach (removed 2026-09-14; see that
  // decision's note in the template).
  get displayedPeriod(): BillingPeriod | null {
    if (this.focusedPeriodId) {
      const focused = this.periods.find((p) => p.id === this.focusedPeriodId && !p.retired);
      if (focused) return focused;
    }
    return this.currentPeriod;
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

  // ---- "החודש" 3-stage operator flow (① חשב חיובים -> ② בדוק ואשר -> ③
  // בצע גבייה), 2026-09-14 UX simplification -- purely derived from data
  // that already exists (runsForPeriod / periodStatements), never a new
  // status field. Stage 3 deliberately never collapses card and MASAV into
  // one "גבה" action: they are two different real-world processes (a
  // per-Statement CardCom charge vs. a batch MASAV Excel export), and the
  // operator needs to know which of the two applies to which of this
  // month's billings.
  // Counts statements still needing MASAV export -- "how many are left to
  // do", not "how many were ever routed here", so this reflects remaining
  // work. Card no longer gets an equivalent count (polish pass,
  // 2026-09-14b): the table's own "אמצעי גבייה"/"מה עושים עכשיו" columns
  // already say everything a card breakdown line here would repeat.
  periodMasavCount(periodId: string): number {
    return this.periodStatements(periodId).filter((s) => s.routed_method === 'masav' && (s.status === 'approved' || s.status === 'open')).length;
  }

  // 1 = not yet calculated, 2 = calculated but at least one Statement still
  // awaiting approval, 3 = every Statement approved or beyond (open/paid/
  // etc.) -- ready for collection. A period with zero Statements (no real
  // activity found) never reaches stage 2/3; periodResultDetail() already
  // explains that case separately.
  periodStage(period: BillingPeriod): 1 | 2 | 3 {
    if (this.runsForPeriod(period.id).length === 0) return 1;
    const statements = this.periodStatements(period.id);
    if (statements.length > 0 && statements.some((s) => s.status === 'draft')) return 2;
    return 3;
  }

  // Stage 3 is "done" (✓ הגבייה הושלמה) once nothing is left in an
  // active collection state (approved/open) -- paid/abandoned/cancelled/
  // written_off are all real, final outcomes, not "still in progress".
  periodCollectionComplete(periodId: string): boolean {
    const statements = this.periodStatements(periodId);
    return statements.length > 0 && statements.every((s) => s.status !== 'approved' && s.status !== 'open' && s.status !== 'draft');
  }

  // Monthly summary secondary line ("2 עמותות | 1 שולמה | 1 ממתינה לגבייה")
  // -- pure counts over already-loaded Statement data, same source
  // periodStatementTotals/periodBlockedEntities already read.
  periodStatusBreakdown(periodId: string): { paid: number; pendingCollection: number; awaitingApproval: number } {
    const statements = this.periodStatements(periodId);
    return {
      paid: statements.filter((s) => s.status === 'paid').length,
      pendingCollection: statements.filter((s) => s.status === 'approved' || s.status === 'open').length,
      awaitingApproval: statements.filter((s) => s.status === 'draft').length,
    };
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
    if (n.reason === 'attempted_not_delivered') return 'ניסיון שליחת ההתראה נכשל';
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

  // 2026-09-13: recalculating a period that already has draft (unapproved)
  // Statements can double-cover the same donations -- eligibility is
  // effective_statement_id IS NULL, cleared only on approval, not on
  // calculation (see calculation.service.js's own header comment). Rather
  // than let the operator click through a warning to do that anyway (the
  // old "חשב מחדש" confirm-dialog), the template now simply never renders a
  // calculate action once period.run_count > 0 -- see "החיובים לחודש זה כבר
  // חושבו" in the template -- and the backend (billing-ops.service.js
  // #calculatePeriod) refuses a second run structurally either way.
  onCalculateClick(period: BillingPeriod): void {
    this.calculatePeriod(period);
  }

  // Only claims a calendar-month label when period_start genuinely falls
  // on the 1st -- never mislabels a custom/partial range as "אוגוסט 2026".
  periodMonthLabel(period: BillingPeriod): string | null {
    const d = new Date(period.period_start);
    if (d.getDate() !== 1) return null;
    return `${HE_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  // "חודש" column for the Statements list -- pure lookup + reuse of the
  // existing periodMonthLabel formatter (Billing v1 simplicity decision,
  // 2026-09-10), no new data fetch: `periods` is already loaded for the
  // period filter dropdown above this table.
  statementPeriodLabel(statement: StatementListItem): string {
    const period = this.periods.find((p) => p.id === statement.billing_period_id);
    if (!period) return '—';
    return this.periodMonthLabel(period) || `${this.fmtDate(period.period_start)}–${this.fmtInclusiveEndDate(period.period_end)}`;
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
    this.reconcileMessage = null;
    this.reconcileError = null;
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

  // Only technical_failure/ambiguous attempts get the button: 'pending' is
  // actively in flight (the scheduled reconciliation job's intended scope,
  // not this manual action), 'succeeded'/'declined' are already definitive.
  // resolveAttempt being idempotent means reconciling those wouldn't be
  // unsafe, just pointless -- gated out here to keep the UI honest about
  // when this action means something. masav attempts never show it either
  // (no reconcile capability at all -- see billing-ops.service.js).
  canReconcileAttempt(attempt: CollectionAttempt): boolean {
    return attempt.collection_method === 'card' && (attempt.status === 'technical_failure' || attempt.status === 'ambiguous');
  }

  reconcileAttempt(attempt: CollectionAttempt): void {
    if (this.reconcilingAttemptId) return;
    this.reconcilingAttemptId = attempt.id;
    this.reconcileMessage = null;
    this.reconcileError = null;
    this.service.reconcileCollectionAttempt(attempt.id).subscribe({
      next: (res) => {
        this.reconcilingAttemptId = null;
        this.reconcileMessage = this.reconcileOutcomeMessage(res.result);
        this.refreshSelectedStatement();
      },
      error: (err) => {
        this.reconcilingAttemptId = null;
        this.reconcileError = err?.error?.error || 'הבדיקה מול הספק נכשלה';
      },
    });
  }

  private reconcileOutcomeMessage(result: ReconcileAttemptResult): string {
    const base = RECONCILE_OUTCOME_MESSAGES[result.outcome] ?? `תוצאה מהספק: ${result.outcome}`;
    return result.failureReason ? `${base}: ${result.failureReason}` : base;
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

  // ---- הגדרות עמותות (billing-account provisioning + readiness) --------

  loadReadiness(): void {
    this.readinessLoading = true;
    this.readinessError = null;
    this.provisioningService.getReadiness().subscribe({
      next: (res) => { this.readinessEntities = res.entities; this.readinessLoading = false; },
      error: () => { this.readinessError = 'שגיאה בטעינת מוכנות החיוב של העמותות'; this.readinessLoading = false; },
    });
  }

  // Entities with MASAV configured are the only meaningful candidates for
  // the "ביטול הרשאת מס״ב" picker below -- an entity with no MASAV details
  // at all has nothing to revoke.
  get masavConfiguredEntities(): BillingReadinessEntity[] {
    return this.readinessEntities.filter((e) => e.masav_configured);
  }

  // "מוכנה לחיוב" needs a billing_account AND (card is always available, so
  // only MASAV can actually block readiness) either no MASAV activity yet
  // OR an authorized MASAV instrument. An entity routed entirely through
  // card collection is ready the moment its billing_account exists.
  entityReadiness(entity: BillingReadinessEntity): { ready: boolean; label: string } {
    if (!entity.billing_account_id) return { ready: false, label: 'טרם הוגדר חיוב' };
    if (entity.enforcement_status === 'suspended') return { ready: false, label: 'חשבון החיוב מושהה' };
    if (entity.masav_configured && !entity.masav_authorized) return { ready: false, label: 'ממתין לאישור מס״ב' };
    return { ready: true, label: 'מוכנה לחיוב' };
  }

  feePercentOf(entity: BillingReadinessEntity): number {
    return entity.fee_rate ? Number(entity.fee_rate) * 100 : 0;
  }

  vatPercentOf(entity: BillingReadinessEntity): number {
    return entity.vat_rate ? Number(entity.vat_rate) * 100 : 0;
  }

  openProvisionForm(entity: BillingReadinessEntity): void {
    this.provisionEntityId = entity.id;
    this.provisionFeeRatePercent = 3;
    this.provisionVatRatePercent = 18;
    this.provisionCollectionMethod = 'card';
    this.provisionNotes = '';
    this.provisionError = null;
  }

  cancelProvisionForm(): void {
    this.provisionEntityId = null;
  }

  confirmProvision(entity: BillingReadinessEntity): void {
    if (this.provisionBusy) return;
    this.provisionBusy = true;
    this.provisionError = null;
    this.provisioningService
      .create({
        entityId: entity.id,
        feeRate: this.provisionFeeRatePercent / 100,
        vatRate: this.provisionVatRatePercent / 100,
        preferredCollectionMethod: this.provisionCollectionMethod,
        notes: this.provisionNotes || undefined,
      })
      .subscribe({
        next: () => {
          this.provisionBusy = false;
          this.provisionEntityId = null;
          this.loadReadiness();
        },
        error: (err) => {
          this.provisionBusy = false;
          this.provisionError = err?.error?.error || 'יצירת הגדרות החיוב נכשלה';
        },
      });
  }

  // ---- טכני / מתקדם: commission-area background jobs ---------------------
  // The old unified "תפעול CardCom" page let the operator manually
  // "Run Now" any job, including the commission/billing ones (billing-
  // monthly-cycle, masav-collection, collection-router, billing-approval-
  // consistency, billing-provisioning-gap, collection-attempt-
  // reconciliation). Splitting that page by area (2026-09-14) must not
  // silently drop that capability for the commission half -- it moves here,
  // collapsed under "מידע טכני" same as the donations page, reusing the
  // exact same CardcomOpsService endpoints (getJobRuns/runJob), never a new
  // backend surface.
  showTechnicalJobs = false;
  health: HealthResponse | null = null;
  runsByJob: Record<string, JobRun[]> = {};
  expandedJob: string | null = null;
  runningJob: string | null = null;
  jobActionError: string | null = null;

  toggleTechnicalJobs(): void {
    this.showTechnicalJobs = !this.showTechnicalJobs;
  }

  get commissionJobs(): string[] {
    return (this.health?.knownJobs ?? []).filter((name) => sharedJobArea(name) === 'commission');
  }

  jobLabel(name: string): string {
    return sharedJobLabel(name);
  }

  jobFrequency(name: string): string {
    return sharedJobFrequency(name);
  }

  lastRunFor(jobName: string): JobHealth | null {
    return this.health?.jobs.find((j) => j.job_name === jobName) ?? null;
  }

  toggleRuns(jobName: string): void {
    if (this.expandedJob === jobName) {
      this.expandedJob = null;
      return;
    }
    this.expandedJob = jobName;
    if (this.runsByJob[jobName]) return;
    this.cardcomOps.getJobRuns(jobName).subscribe({
      next: (res) => { this.runsByJob[jobName] = res.runs; },
      error: () => { this.runsByJob[jobName] = []; },
    });
  }

  runJobNow(jobName: string): void {
    this.runningJob = jobName;
    this.jobActionError = null;
    this.cardcomOps.runJob(jobName).subscribe({
      next: () => {
        this.runningJob = null;
        delete this.runsByJob[jobName];
        this.loadCommissionIssues(); // re-fetch health -- never guess the new status locally
      },
      error: (err) => {
        this.runningJob = null;
        this.jobActionError = err?.error?.error || 'הרצת המשימה נכשלה';
      },
    });
  }

  fmtDuration(ms: number | null): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // ---- "דורש טיפול" (commission-area issues) -----------------------------
  // Reuses CardcomOpsService (the exact same data "תרומות" reads) filtered
  // to the commission area via the shared ops-labels classification -- see
  // this file's CommissionIssue comment. No new endpoint, no new
  // aggregation layer, per the 2026-09-14 UX simplification's explicit
  // instruction.

  loadCommissionIssues(): void {
    this.cardcomOps.getHealth().subscribe({
      next: (health) => {
        this.health = health;
        const items: CommissionIssue[] = [];
        for (const alert of health.alerts) {
          if ((alert.type === 'job_failed' || alert.type === 'job_stale') && alert.jobName && sharedJobArea(alert.jobName) === 'commission') {
            items.push({
              id: `alert-${alert.type}-${alert.jobName}`,
              title: `${sharedJobLabel(alert.jobName)} — ${alert.type === 'job_failed' ? 'נכשל בריצה האחרונה' : 'לא רץ בהצלחה בזמן הצפוי'}`,
              subtitle: '',
              severity: 'critical',
            });
          }
        }
        this.commissionIssues = items;
        this.loadCommissionFindings();
      },
      error: () => { /* the periods/statements/masav loads already surface the main error states */ },
    });
  }

  private loadCommissionFindings(): void {
    this.cardcomOps.getFindings(false).subscribe({
      next: (res) => {
        const commissionFindings = res.findings.filter(
          (f: ReconciliationFinding) => !PROVIDER_FINDING_TYPES.has(f.finding_type) && sharedJobArea(f.job_name) === 'commission',
        );
        this.commissionIssues = [
          ...this.commissionIssues,
          ...commissionFindings.map((f) => ({
            id: `finding-${f.id}`,
            title: sharedFindingTypeLabel(f.finding_type),
            subtitle: (f.details as Record<string, unknown> | null)?.['displayName'] as string || '',
            severity: (f.severity === 'critical' ? 'critical' : 'warning') as 'critical' | 'warning',
          })),
        ];
      },
      error: () => {},
    });
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

  // Opens the setup drawer and loads whatever is already configured for
  // this entity (if the operator is revisiting a partially-completed
  // setup) so the bank fields and document/authorization status are never
  // shown blank when real data already exists.
  openConfigureForm(entityId: string, entityName: string): void {
    this.configuringEntityId = entityId;
    this.configuringEntityName = entityName;
    this.masavBankCode = '';
    this.masavBranchCode = '';
    this.masavAccountNumber = '';
    this.masavAccountHolderName = '';
    this.masavFormError = null;
    this.masavShowHelp = false;
    this.masavDocFile = null;
    this.masavDocUploadError = null;
    this.masavAckChecked = false;
    this.masavConfig = null;
    this.masavConfigLoading = true;
    this.service.getMasavConfig(entityId).subscribe({
      next: (res) => {
        this.masavConfigLoading = false;
        this.masavConfig = res.config;
        if (res.config) {
          this.masavBankCode = res.config.bank_code;
          this.masavBranchCode = res.config.branch_code;
          this.masavAccountNumber = res.config.account_number;
          this.masavAccountHolderName = res.config.account_holder_name || '';
        }
      },
      error: () => { this.masavConfigLoading = false; },
    });
  }

  cancelConfigureForm(): void {
    this.configuringEntityId = null;
    this.loadMasav();
    this.loadReadiness();
  }

  toggleMasavHelp(): void {
    this.masavShowHelp = !this.masavShowHelp;
  }

  // Clipboard write is inherently best-effort (permissions, insecure
  // context, older browsers) -- falls back to silently doing nothing rather
  // than throwing, since the code is already displayed in plain text right
  // next to the button either way.
  copyMasavInstitutionCode(): void {
    navigator.clipboard?.writeText(this.masavInstitutionCode).then(() => {
      this.masavCodeCopied = true;
      setTimeout(() => { this.masavCodeCopied = false; }, 2000);
    }).catch(() => {});
  }

  // Saves bank details only -- deliberately does not close the drawer or
  // touch `authorized` (upsertBankDetails always clears it server-side on
  // any change, per masav-config.service.js). Stays open so the operator
  // can continue straight to uploading the signed document.
  submitMasavConfig(): void {
    if (!this.configuringEntityId || this.masavFormBusy) return;
    if (!this.masavAccountHolderName || !this.masavBankCode || !this.masavBranchCode || !this.masavAccountNumber) {
      this.masavFormError = 'יש למלא שם בעל חשבון, בנק, סניף ומספר חשבון';
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
        next: (res) => {
          this.masavFormBusy = false;
          this.masavConfig = res.config;
        },
        error: (err) => {
          this.masavFormBusy = false;
          this.masavFormError = err?.error?.error || 'שמירת פרטי הבנק נכשלה';
        },
      });
  }

  onMasavDocSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.masavDocFile = input.files?.[0] || null;
    this.masavDocUploadError = null;
  }

  // Uploads the signed bank authorization as evidence only -- never sets
  // `authorized`. Requires bank details to already be saved (same order the
  // drawer enforces visually: fields first, then the document).
  uploadMasavDoc(): void {
    if (!this.configuringEntityId || !this.masavDocFile || this.masavDocUploading) return;
    this.masavDocUploading = true;
    this.masavDocUploadError = null;
    this.service.uploadMasavAuthorizationDocument(this.configuringEntityId, this.masavDocFile).subscribe({
      next: (res) => {
        this.masavDocUploading = false;
        this.masavConfig = res.config;
        this.masavDocFile = null;
      },
      error: (err) => {
        this.masavDocUploading = false;
        this.masavDocUploadError = err?.error?.error || 'העלאת האישור נכשלה — ודאו שפרטי הבנק נשמרו קודם';
      },
    });
  }

  downloadMasavDoc(): void {
    if (!this.configuringEntityId || this.masavDocDownloading || !this.masavConfig?.has_authorization_document) return;
    this.masavDocDownloading = true;
    this.service.downloadMasavAuthorizationDocument(this.configuringEntityId).subscribe({
      next: (blob) => {
        this.masavDocDownloading = false;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.masavConfig?.authorization_document_name || 'masav-authorization';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => { this.masavDocDownloading = false; },
    });
  }

  authorizeEntity(entityId: string): void {
    this.masavFormBusy = true;
    this.masavFormError = null;
    this.service.authorizeMasav(entityId).subscribe({
      next: () => { this.masavFormBusy = false; this.loadMasav(); this.loadReadiness(); },
      error: (err) => { this.masavFormBusy = false; this.masavError = err?.error?.error || 'אישור ההרשאה נכשל'; },
    });
  }

  revokeEntity(entityId: string): void {
    this.masavFormBusy = true;
    this.masavError = null;
    this.service.revokeMasav(entityId).subscribe({
      next: () => { this.masavFormBusy = false; this.loadMasav(); this.loadReadiness(); },
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
