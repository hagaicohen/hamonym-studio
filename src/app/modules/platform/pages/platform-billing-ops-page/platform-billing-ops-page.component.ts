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
} from '../../services/billing-ops.service';

type Tab = 'periods' | 'statements' | 'masav';

const STATEMENT_STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
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

  // "מה הפעולה הבאה?" -- the one thing the operator should do next for this
  // period, derived purely from already-loaded state (never a new call).
  // setup -> calculate/recalculate -> review drafts -> collection, in that
  // order, matching the real Statement lifecycle.
  periodNextActionLabel(period: BillingPeriod): string {
    const runs = this.runsForPeriod(period.id);
    if (runs.length === 0) return 'הרצת חישוב, כדי לראות מה מוכן לחיוב בתקופה זו';

    const blocked = this.periodBlockedEntities(period);
    if (blocked.length > 0) return 'השלמת הגדרות חיוב לעמותות המסומנות למטה';

    const draftCount = this.statements.filter(
      (s) => s.billing_period_id === period.id && s.status === 'draft',
    ).length;
    if (draftCount > 0) return `בדיקה ואישור ${draftCount} חשבונות לחיוב בלשונית Statements`;

    const approvedCount = this.statements.filter(
      (s) => s.billing_period_id === period.id && s.status === 'approved',
    ).length;
    if (approvedCount > 0) return 'הפעלת גבייה על החשבונות המאושרים בלשונית Statements';

    return 'אין פעולה נדרשת כרגע בתקופה זו';
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
      },
      error: () => {
        this.statementsError = 'שגיאה בטעינת Statements';
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
        this.statementActionError = 'שגיאה בטעינת פרטי ה-Statement';
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

  triggerCollection(): void {
    if (!this.selectedStatement || this.statementActionBusy) return;
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
      error: (err) => { this.statementActionBusy = false; this.statementActionError = err?.error?.error || 'הפעלת הגבייה נכשלה'; },
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
