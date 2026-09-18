import { Component, OnInit, inject, HostListener } from '@angular/core';
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
  CollectionAttempt,
  ReconcileAttemptResult,
} from '../../services/billing-ops.service';

import { BillingProvisioningService, BillingReadinessEntity } from '../../services/billing-provisioning.service';
import { BillingSettingsService } from '../../services/billing-settings.service';
import { CardcomOpsService, ReconciliationFinding, HealthResponse, JobRun, JobHealth } from '../../services/cardcom-ops.service';
import { BillingEntitySetupComponent } from '../../components/billing-entity-setup/billing-entity-setup.component';
import { ColumnPickerComponent, ColumnDef } from '../../components/column-picker/column-picker.component';
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

// Column sorting + visibility (2026-09-16) -- added only to the 3
// substantial, one-row-per-entity/statement operational tables (החודש, כל
// החיובים, הגדרות עמותות); the smaller/nested tables on this page (MASAV
// blocked list, bulk-approval sub-table, per-attempt/per-payment history)
// were deliberately left alone per explicit product guidance: don't add
// controls to small tables just because they're <table>s. All 3 tables
// here are rendered from an already-fully-loaded local array (no backend
// pagination), so sorting is plain client-side Array.sort -- no API change
// needed, unlike the donations browser's server-driven sort. עמותה is the
// anchor column everywhere (always visible), same role as שם העמותה on
// platform-organizations-page and תאריך on the donations table.
type MonthSortField = 'donations' | 'gross' | 'fee' | 'vat' | 'due' | 'route' | 'state';
type AllStatementsSortField = 'period' | 'gross' | 'due' | 'route' | 'state';
type ReadinessSortField = 'fee' | 'vat' | 'card' | 'masav' | 'ready';

const MONTH_TABLE_COLUMNS: ColumnDef[] = [
  { key: 'donations', label: 'תרומות' },
  { key: 'gross',      label: 'מחזור' },
  { key: 'fee',        label: 'עמלה' },
  { key: 'vat',        label: 'מע״מ' },
  { key: 'due',        label: 'לחיוב' },
  { key: 'route',      label: 'אמצעי גבייה' },
  { key: 'state',      label: 'מצב' },
];

const ALL_STATEMENTS_COLUMNS: ColumnDef[] = [
  { key: 'period', label: 'חודש חיוב' },
  { key: 'gross',  label: 'מחזור תרומות' },
  { key: 'due',    label: 'סכום לחיוב' },
  { key: 'route',  label: 'אמצעי גבייה' },
  { key: 'state',  label: 'מצב' },
];

const READINESS_COLUMNS: ColumnDef[] = [
  { key: 'fee',   label: 'עמלה' },
  { key: 'vat',   label: 'מע״מ' },
  { key: 'card',  label: 'כרטיס אשראי' },
  { key: 'masav', label: 'מס״ב' },
  { key: 'ready', label: 'מוכנות לחיוב' },
];

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
  // Task-list fields (2026-09-16) -- only set for finding types that have a
  // known, existing fix (billing setup); every other finding stays a plain
  // informational row (no button, no entity/amount line).
  entityId?: string;
  entityName?: string;
  amount?: string;
  actionLabel?: string;
}

// Specific, operator-facing wording for the two MASAV blocking reasons the
// data actually distinguishes (routing.js only ever returns these two for
// "not yet routable" -- masav_incomplete and masav_not_configured both mean
// "bank details aren't on file/complete"). There is no third, separate
// "document missing" reason at this level -- masav_not_authorized covers
// both "document missing" and "just needs the click," and inventing a
// three-way split here would mean guessing at data this card doesn't have.
const MASAV_BLOCK_REASON_LABELS: Record<string, string> = {
  masav_not_configured: 'חסרים פרטי חשבון בנק',
  masav_incomplete: 'חסרים פרטי חשבון בנק',
  masav_not_authorized: 'נדרש אישור מס״ב',
};

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

// Extends the same labels for ensureMasavAttempts()'s skip reasons
// (2026-09-16 export-time auto-attempt) -- 'attempt_already_active' is
// deliberately absent, since that outcome means the Statement IS included
// (an existing attempt was reused), never excluded.
const MASAV_EXPORT_SKIP_REASON_LABELS: Record<string, string> = {
  ...BLOCKED_REASON_LABELS,
  not_actionable: 'הסטטוס של החיוב השתנה',
  not_masav_routed: 'החיוב אינו מנותב יותר למס״ב',
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
  imports: [CommonModule, FormsModule, RouterModule, BillingEntitySetupComponent, ColumnPickerComponent],
  templateUrl: './platform-billing-ops-page.component.html',
  styleUrl: './platform-billing-ops-page.component.css',
})
export class PlatformBillingOpsPageComponent implements OnInit {
  private service = inject(BillingOpsService);
  private route = inject(ActivatedRoute);
  private provisioningService = inject(BillingProvisioningService);
  private cardcomOps = inject(CardcomOpsService);
  private billingSettingsService = inject(BillingSettingsService);

  readonly heMonthNames = HE_MONTH_NAMES;

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
  // Set instead of periodsLoading once periods are already on screen
  // (2026-09-16 loading-state fix) -- stepMonth()/pickMonth() must never
  // blank the "החודש" tab while the newly-selected month loads; same
  // loading/refreshing convention already proven on
  // platform-organizations-page.
  periodsRefreshing = false;
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
  // Collapsed by default (2026-09-16 "החודש" simplification) -- this list
  // used to render open, dominating the page above the billing table it
  // duplicates ("מה עושים עכשיו" already covers each affected row). Same
  // information, just progressive disclosure instead of always-on.
  showBlockedEntities = false;

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
  // Set instead of statementsLoading once statements are already on screen
  // (2026-09-16 loading-state fix) -- filter changes, calculate, and
  // bulk-approve refetches must never blank "כל החיובים"/"החודש"'s table.
  statementsRefreshing = false;
  statementsError: string | null = null;
  // "YYYY-MM", or '' for "כל החודשים" -- 2026-09-17 month-picker redesign.
  // No longer a billing_period.id: the operator picks any calendar month,
  // past or future, whether or not a billing_periods row exists for it yet
  // (see loadStatements()/listStatements()'s own `month` param). Defaults
  // to last calendar month on load (defaultFilterMonth()) -- this tab is
  // primarily historical, and the previous month is normally the latest
  // one with a complete, settled billing picture; "החודש" tab's own
  // "latest existing period" default is a different, DB-driven concept
  // for a different (administration) purpose and doesn't apply here.
  filterMonth = '';
  filterStatus = '';

  // ---- "כל החיובים" month/year filter control (2026-09-17) --------------
  // A second, independent instance of the same compact Hebrew "‹ חודש שנה
  // ›" stepper + popover pattern as the "החודש" tab's own month control
  // below (same CSS classes, same heMonthNames) -- deliberately NOT
  // shared state or shared methods: this one only ever calls
  // loadStatements() (a read filter), never createPeriodForMonth()/
  // calculatePeriod() (a business action). Two small parallel widgets,
  // not one widget serving two different meanings.
  filterMonthPickerOpen = false;
  filterMonthPickerYear = new Date().getFullYear();

  private defaultFilterMonth(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  get filterMonthLabel(): string {
    if (!this.filterMonth) return 'כל החודשים';
    const [yearStr, monthStr] = this.filterMonth.split('-');
    const monthIdx = Number(monthStr) - 1;
    if (monthIdx < 0 || monthIdx > 11) return this.filterMonth;
    return `${HE_MONTH_NAMES[monthIdx]} ${yearStr}`;
  }

  toggleFilterMonthPicker(event: Event): void {
    event.stopPropagation();
    this.filterMonthPickerOpen = !this.filterMonthPickerOpen;
    if (this.filterMonthPickerOpen) {
      const [yearStr] = (this.filterMonth || '').split('-');
      this.filterMonthPickerYear = Number(yearStr) || new Date().getFullYear();
    }
  }

  @HostListener('document:click')
  closeFilterMonthPicker(): void {
    this.filterMonthPickerOpen = false;
  }

  filterPickerPrevYear(): void {
    this.filterMonthPickerYear--;
  }

  filterPickerNextYear(): void {
    this.filterMonthPickerYear++;
  }

  isSelectedFilterMonth(monthIndex: number): boolean {
    if (!this.filterMonth) return false;
    const [yearStr, monthStr] = this.filterMonth.split('-');
    return Number(yearStr) === this.filterMonthPickerYear && Number(monthStr) === monthIndex + 1;
  }

  pickFilterMonth(monthIndex: number): void {
    this.filterMonth = `${this.filterMonthPickerYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    this.filterMonthPickerOpen = false;
    this.loadStatements();
  }

  stepFilterMonth(delta: -1 | 1): void {
    if (!this.filterMonth) return;
    const [yearStr, monthStr] = this.filterMonth.split('-');
    const d = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1);
    this.filterMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.loadStatements();
  }

  // ---- column sorting + visibility (2026-09-16, החודש / כל החיובים) ----
  readonly monthTableColumns = MONTH_TABLE_COLUMNS;
  visibleMonthColumns = new Set(MONTH_TABLE_COLUMNS.map((c) => c.key));
  monthSortField: MonthSortField | null = null;
  monthSortDir: 'asc' | 'desc' = 'asc';

  readonly allStatementsColumns = ALL_STATEMENTS_COLUMNS;
  visibleAllStatementsColumns = new Set(ALL_STATEMENTS_COLUMNS.map((c) => c.key));
  allStatementsSortField: AllStatementsSortField | null = null;
  allStatementsSortDir: 'asc' | 'desc' = 'asc';

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

  // ---- מס״ב (monthly MASAV collection only -- association-level setup
  // moved to platform-billing-setup-page, 2026-09-14e UX separation) -----
  blockedStatements: BlockedMasavStatement[] = [];
  actionableStatements: ActionableMasavStatement[] = [];
  masavLoading = true;
  // Set instead of masavLoading once blockedStatements are already on
  // screen (2026-09-16 loading-state fix) -- refetching after a
  // billing-setup drawer save must never blank the מס״ב tab.
  masavRefreshing = false;
  masavError: string | null = null;

  // ---- הגדרות עמותות (billing-account provisioning, merged in 2026-09-14
  // from the old standalone /platform/billing-accounts page) --------------
  readinessEntities: BillingReadinessEntity[] = [];
  readinessLoading = true;
  // Set instead of readinessLoading once entities are already on screen
  // (2026-09-16 loading-state fix) -- refetching after a billing-setup
  // drawer save (billingAccountCreated/masavChanged) must never blank
  // "הגדרות עמותות".
  readinessRefreshing = false;
  readinessError: string | null = null;

  readonly readinessColumns = READINESS_COLUMNS;
  visibleReadinessColumns = new Set(READINESS_COLUMNS.map((c) => c.key));
  readinessSortField: ReadinessSortField | null = null;
  readinessSortDir: 'asc' | 'desc' = 'asc';

  // System-wide VAT rate -- display-only here (2026-09-14j: the editor
  // moved to Platform Admin -> הגדרות כלליות -> חיוב ומיסוי, since VAT is a
  // Hamonym setting, not an association-billing one). Still loaded so the
  // readiness table's מע״מ column shows the real current rate instead of a
  // stale per-account value. Also replaces the old per-account VAT input on
  // the (now-removed) inline quick-provision form below and the VAT input
  // that used to be on billing-entity-setup's creation form -- "הגדרת
  // חיוב"/"הגדרות חיוב" both now open the same drawer (openBillingSetup),
  // see its own note there for why that separate inline form was removed
  // rather than patched.
  systemVatRatePercent: number | null = null;

  // "הגדרות חיוב" now opens as a drawer instead of navigating to
  // /platform/billing-setup/:entityId (2026-09-14h drawer redesign) -- the
  // operator stays on whichever list they clicked from (הגדרות עמותות /
  // החודש's blocked-entities list / מס״ב's blocked-statements list all
  // open the same drawer). Hosts BillingEntitySetupComponent, the exact
  // same component the standalone page (kept for deep-link compatibility)
  // hosts -- no business logic duplicated between the two.
  billingSetupEntityId: string | null = null;
  billingSetupEntityName = '';
  billingSetupDonationCount: number | null = null;
  billingSetupGrossAmount: string | null = null;

  openBillingSetup(entityId: string, entityName: string, donationCount?: number | null, grossAmount?: string | null): void {
    this.billingSetupEntityId = entityId;
    this.billingSetupEntityName = entityName;
    this.billingSetupDonationCount = donationCount ?? null;
    this.billingSetupGrossAmount = grossAmount ?? null;
  }

  // Closing the drawer returns naturally to whichever list/tab was already
  // showing behind it -- refresh readiness (and the MASAV/period lists, in
  // case a MASAV authorization changed what's blocked/actionable there) so
  // the row the operator just edited reflects the new state immediately.
  closeBillingSetup(): void {
    this.billingSetupEntityId = null;
    this.loadReadiness();
    this.loadMasav();
    this.loadPeriods();
  }

  // ---- "דורש טיפול" (commission-area issues, reused from the same data
  // "תרומות" shows, filtered here to billing/collection concerns only --
  // see this class's header note and ../../utils/ops-labels.ts) ----------
  commissionIssues: CommissionIssue[] = [];

  selectedExportStatementIds = new Set<string>();
  exporting = false;
  exportError: string | null = null;
  // Only set when the export actually excluded something (2026-09-16 --
  // see exportSelected()). null on a clean export, matching today's silent-
  // success behavior; never silently drops a Statement without surfacing
  // this.
  masavExportResult: { successText: string; excludedText: string } | null = null;

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const requestedTab = qp.get('tab') as Tab | null;
    if (requestedTab === 'periods' || requestedTab === 'statements' || requestedTab === 'entities' || requestedTab === 'masav') {
      this.tab = requestedTab;
    }
    this.justSetupEntityName = qp.get('justSetupName') || (qp.get('justSetupEntity') ? 'העמותה' : null);

    this.filterMonth = this.defaultFilterMonth();
    this.loadPeriods();
    this.loadStatements();
    this.loadMasav();
    this.loadReadiness();
    this.loadCommissionIssues();
    this.loadVatSetting();
  }

  setTab(tab: Tab): void {
    this.tab = tab;
  }

  dismissJustSetupBanner(): void {
    this.justSetupEntityName = null;
  }

  // ---- periods & calculation -------------------------------------------

  private loadPeriods(): void {
    if (this.periods.length === 0) this.periodsLoading = true;
    else this.periodsRefreshing = true;
    this.periodsError = null;
    this.service.listPeriods().subscribe({
      next: (res) => {
        this.periods = res.periods;
        this.periodsLoading = false;
        this.periodsRefreshing = false;
        this.syncSelectedMonthToDisplayedPeriod();
      },
      error: () => {
        this.periodsError = 'שגיאה בטעינת תקופות חיוב';
        this.periodsLoading = false;
        this.periodsRefreshing = false;
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

  // ---- custom month picker (replaces the raw native <input type="month">,
  // 2026-09-14g "friendlier date control" request) -- a plain Hebrew
  // "‹ חודש שנה ›" stepper plus a small popover for jumping to any month/
  // year directly. Still just produces the same "YYYY-MM" selectedMonth
  // value createPeriodForMonth() already consumed -- no new navigation
  // concept, only a nicer control for the exact same one.
  monthPickerOpen = false;
  monthPickerYear = new Date().getFullYear();

  get selectedMonthLabel(): string {
    if (!this.selectedMonth) return 'בחרו חודש';
    const [yearStr, monthStr] = this.selectedMonth.split('-');
    const monthIdx = Number(monthStr) - 1;
    if (monthIdx < 0 || monthIdx > 11) return this.selectedMonth;
    return `${HE_MONTH_NAMES[monthIdx]} ${yearStr}`;
  }

  toggleMonthPicker(event: Event): void {
    event.stopPropagation();
    this.monthPickerOpen = !this.monthPickerOpen;
    if (this.monthPickerOpen) {
      const [yearStr] = (this.selectedMonth || '').split('-');
      this.monthPickerYear = Number(yearStr) || new Date().getFullYear();
    }
  }

  // Closes on any click outside the popover -- the popover itself stops
  // propagation on its own click handler (see template), so this only ever
  // fires for a genuine outside click. Same pattern as the users-page "⋮"
  // menu.
  @HostListener('document:click')
  closeMonthPicker(): void {
    this.monthPickerOpen = false;
  }

  pickerPrevYear(): void {
    this.monthPickerYear--;
  }

  pickerNextYear(): void {
    this.monthPickerYear++;
  }

  isSelectedMonth(monthIndex: number): boolean {
    if (!this.selectedMonth) return false;
    const [yearStr, monthStr] = this.selectedMonth.split('-');
    return Number(yearStr) === this.monthPickerYear && Number(monthStr) === monthIndex + 1;
  }

  pickMonth(monthIndex: number): void {
    this.selectedMonth = `${this.monthPickerYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    this.monthPickerOpen = false;
    this.createPeriodForMonth();
  }

  // "‹ / ›" step exactly one calendar month from whatever is currently
  // selected -- the most common real action (checking last month, jumping
  // ahead to prep next month) shouldn't require opening the picker at all.
  stepMonth(delta: -1 | 1): void {
    if (!this.selectedMonth) return;
    const [yearStr, monthStr] = this.selectedMonth.split('-');
    const d = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1);
    this.selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.createPeriodForMonth();
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
  // "Current period" = the latest non-retired period that has actually
  // started -- NOT simply MAX(period_start) (2026-09-17 fix). listPeriods()
  // itself has no time-horizon bound (removed the same day -- real Billing
  // history must stay queryable indefinitely), so `periods` can legitimately
  // contain a period far in the future (e.g. the permanent 2099-08
  // Donation->Billing E2E fixture, ZZZ_TEST_DONATION_BILLING_E2E_2026-09-17)
  // alongside real ones. Without this bound, "החודש" -- whose whole job is
  // showing "the operator's current billing context" -- would default to
  // whichever row happens to sort first by period_start, including that
  // one. A period that hasn't started yet in reality is definitionally not
  // "the current" one, regardless of whether an admin has manually pre-
  // created it -- those remain fully reachable via the compact month
  // control's own explicit navigation (focusedPeriodId below), completely
  // unaffected; only the unset-focus DEFAULT changes. Retired periods
  // (test/harness residue) stay invisible here too, unchanged.
  //
  // 2026-09-18 28->28 restoration: bound changed from "not later than the
  // start of the current UTC calendar month" to plain "not later than
  // NOW" -- the calendar-month version was only ever a proxy for "has this
  // period actually started", coincidentally correct while every period
  // started on the 1st. A 28->28 cycle's period_start sits on a 28th, not
  // the 1st, so comparing against month-start would wrongly keep excluding
  // the current cycle for the first ~27 days after its own start. "now" is
  // the actually-correct, shape-agnostic version of the exact same rule --
  // still permanently excludes 2099-08 (decades in the future, always
  // after "now"), unchanged.
  get currentPeriod(): BillingPeriod | null {
    const now = Date.now();
    const active = this.periods.filter((p) => !p.retired && new Date(p.period_start).getTime() <= now);
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

  // Sorted view for the table only -- periodStatements() itself stays
  // unsorted since it also backs totals/counts/eligibility logic elsewhere
  // on this page, where row order must never matter.
  sortedPeriodStatements(periodId: string): StatementListItem[] {
    const rows = this.periodStatements(periodId);
    if (!this.monthSortField) return rows;
    const field = this.monthSortField;
    return this.sortRows(rows, this.monthSortDir, (s) => {
      switch (field) {
        case 'donations': return s.component_count ?? 0;
        case 'gross':      return Number(s.gross_raised);
        case 'fee':        return Number(s.fee_amount);
        case 'vat':        return Number(s.vat_amount);
        case 'due':        return Number(s.total_due);
        case 'route':      return this.routedMethodLabel(s.routed_method);
        case 'state':      return this.operationalStateLabel(s);
      }
    });
  }

  sortMonthBy(field: MonthSortField): void {
    if (this.monthSortField === field) {
      this.monthSortDir = this.monthSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.monthSortField = field;
      this.monthSortDir = 'asc';
    }
  }

  onVisibleMonthColumnsChange(visible: Set<string>): void {
    this.visibleMonthColumns = visible;
  }

  // Shared by all 3 sortable tables on this page -- plain client-side sort
  // (every row is already loaded locally, no backend pagination for any of
  // these lists), numeric compare when both values are numbers, otherwise
  // Hebrew-aware string compare.
  // Shared by all 3 sortable tables' templates.
  sortIndicator(activeField: string | null, field: string, dir: 'asc' | 'desc'): string {
    if (activeField !== field) return '';
    return dir === 'asc' ? ' ▲' : ' ▼';
  }

  private sortRows<T>(rows: T[], dir: 'asc' | 'desc', valueOf: (row: T) => number | string): T[] {
    const sorted = [...rows].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv), 'he');
    });
    return dir === 'asc' ? sorted : sorted.reverse();
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
    return this.monthLabelFromRange(period.period_start, period.period_end);
  }

  // Same calendar-month-label logic as periodMonthLabel, but over a raw
  // period_start/period_end pair instead of a full BillingPeriod -- used by
  // the MASAV "דורשים טיפול" list, which carries its Statement's period
  // dates directly rather than a billing_period_id to look up. Tries the
  // OLD calendar-month shape first (every real historical period through
  // September 2026, never touched, keeps displaying exactly as it always
  // has), then the restored 28->28 cycle shape (2026-09-18) as a sibling
  // fallback -- never replacing the old check, since a real old-model
  // period and a real new-model cycle are never confusable (one starts on
  // the 1st, the other's END sits on a 28th-20:00-Israel instant).
  private monthLabelFromRange(periodStart: string, periodEnd: string): string | null {
    const d = new Date(periodStart);
    if (d.getDate() === 1) {
      return `${HE_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    }
    return this.cycleLabelFromRange(periodEnd);
  }

  // Recognizes a 28->28 cycle (including the one-time October 2026
  // transition bridge, whose END is a genuine cutoff even though its START
  // isn't) by shape -- period_end sits exactly on "28th, 20:00:00" Israel-
  // local time -- via Intl's own timeZone support, native in every
  // evergreen browser, no library needed (the same reasoning the backend
  // uses Postgres's AT TIME ZONE for). Labeled by the month the CUTOFF
  // falls in (frozen decision: a cycle ending 28 Nov 2026 -> "נובמבר
  // 2026") -- this is also exactly why checking only period_end's shape,
  // never period_start's, transparently and correctly labels the
  // transition bridge as "אוקטובר 2026" too, with no special-casing here.
  private cycleLabelFromRange(periodEnd: string): string | null {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(periodEnd));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const day = get('day');
    const hour = get('hour');
    const minute = get('minute');
    const second = get('second');
    if (day !== 28 || hour !== 20 || minute !== 0 || second !== 0) return null;
    return `${HE_MONTH_NAMES[get('month') - 1]} ${get('year')}`;
  }

  blockedStatementPeriodLabel(item: BlockedMasavStatement): string {
    return this.monthLabelFromRange(item.period_start, item.period_end)
      || `${this.fmtDate(item.period_start)}–${this.fmtInclusiveEndDate(item.period_end)}`;
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

  clearMonthFilter(): void {
    this.filterMonth = '';
    this.filterMonthPickerOpen = false;
    this.loadStatements();
  }

  loadStatements(): void {
    if (this.statements.length === 0) this.statementsLoading = true;
    else this.statementsRefreshing = true;
    this.statementsError = null;
    this.service.listStatements({ month: this.filterMonth || undefined, status: this.filterStatus || undefined }).subscribe({
      next: (res) => {
        this.statements = res.statements;
        this.statementsLoading = false;
        this.statementsRefreshing = false;
        this.pruneApprovalSelection();
      },
      error: () => {
        this.statementsError = 'שגיאה בטעינת חשבונות לחיוב';
        this.statementsLoading = false;
        this.statementsRefreshing = false;
      },
    });
  }

  get sortedStatements(): StatementListItem[] {
    if (!this.allStatementsSortField) return this.statements;
    const field = this.allStatementsSortField;
    return this.sortRows(this.statements, this.allStatementsSortDir, (s) => {
      switch (field) {
        // Real chronological order (period_start), not the display string.
        case 'period': return this.periods.find((p) => p.id === s.billing_period_id)?.period_start ?? '';
        case 'gross':   return Number(s.gross_raised);
        case 'due':     return Number(s.total_due);
        case 'route':   return this.routedMethodLabel(s.routed_method);
        case 'state':   return this.operationalStateLabel(s);
      }
    });
  }

  sortAllStatementsBy(field: AllStatementsSortField): void {
    if (this.allStatementsSortField === field) {
      this.allStatementsSortDir = this.allStatementsSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.allStatementsSortField = field;
      this.allStatementsSortDir = 'asc';
    }
  }

  onVisibleAllStatementsColumnsChange(visible: Set<string>): void {
    this.visibleAllStatementsColumns = visible;
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

  // Statement-detail drawer "מה עושים עכשיו" navigation (2026-09-16
  // drawer simplification) -- both destinations already exist and are
  // reached from elsewhere on this page (openBillingSetup from the table's
  // own next-action click and the blocked-entities list; setTab('masav')
  // from "החודש"'s stage-3 breakdown link). This only wires the drawer to
  // the same two existing destinations, closing itself first since its
  // Statement-specific context no longer applies once the operator has
  // navigated away from it.
  goToBillingSetupFromDrawer(): void {
    if (!this.selectedStatement) return;
    this.openBillingSetup(this.selectedStatement.entity_id, this.selectedStatement.entity_name);
    this.closeStatement();
  }

  goToMasavTab(): void {
    this.setTab('masav');
    this.closeStatement();
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

  // "מצב" as an operational collection state, not the raw Statement
  // lifecycle status (2026-09-14n, "החודש" only). 'מאושר' is technically
  // correct but reads as "done" to an operator -- an approved Statement
  // hasn't actually been collected yet. Derived entirely from fields
  // already on StatementListItem (status/routed_method/latest_attempt_
  // status), the exact same fields billing-ops.service.js#nextActionLabel
  // itself reads -- no new backend state, no invented data.
  //
  // isCollectionFailed mirrors nextActionLabel's own card-only gating
  // exactly: latest_attempt_status only means "failed" for the CARD route
  // there (masav's branch never looks at it at all) -- a MASAV Statement
  // still legitimately waiting for its export/processing must never show
  // as "הגבייה נכשלה" just because some unrelated card-route attempt
  // history happens to exist on the row.
  isCollectionFailed(statement: StatementListItem): boolean {
    return statement.routed_method === 'card' && (
      statement.latest_attempt_status === 'declined'
      || statement.latest_attempt_status === 'technical_failure'
      || statement.latest_attempt_status === 'not_found_confirmed'
    );
  }

  operationalStateLabel(statement: StatementListItem): string {
    if (statement.status === 'paid') return 'שולם';
    if (statement.status === 'draft') return 'ממתין לאישור';
    if (statement.status === 'approved' || statement.status === 'open') {
      return this.isCollectionFailed(statement) ? 'הגבייה נכשלה' : 'ממתין לגבייה';
    }
    return this.statementStatusLabel(statement.status); // abandoned/cancelled/written_off -- unchanged, rare terminal states outside the 4 requested here
  }

  operationalStateBadgeClass(statement: StatementListItem): string {
    if (statement.status === 'paid') return 'bo-badge-paid';
    if (statement.status === 'draft') return 'bo-badge-draft';
    if (statement.status === 'approved' || statement.status === 'open') {
      return this.isCollectionFailed(statement) ? 'bo-badge-collection-failed' : 'bo-badge-open';
    }
    return 'bo-badge-' + statement.status;
  }

  // "כל החיובים" UX refinement, 2026-09-14c: the server's own next_action
  // (billing-ops.service.js#nextActionLabel) returns 'שולם' for a paid
  // Statement -- correct as a fact, but redundant next to the "מצב" column
  // which already says the same word. This is presentation-only
  // deduplication for one already-known case, not a new rule: a paid
  // Statement genuinely has no further operator action, which next_action
  // already establishes -- this just avoids repeating it verbatim.
  nextActionDisplay(statement: StatementListItem): string {
    return statement.status === 'paid' ? '—' : statement.next_action;
  }

  // "מה עושים עכשיו" -> actually doing it, for "החודש" (2026-09-14m). The
  // backend's nextActionLabel (billing-ops.service.js) exposes only the
  // rendered Hebrew text, not a separate machine-readable status/action
  // code -- checked before writing this, per this file's own next_action
  // interface comment ("never re-derive this from raw readiness data
  // here"), there's also no readiness.ready boolean exposed per-row to
  // recompute the condition any other way. Both strings below are drawn
  // from that function's own small, closed set of literal return values
  // (never interpolated/dynamic), so this is an exact-equality check
  // against one authoritative constant, not fuzzy parsing of free text --
  // but it IS a real coupling to that literal string, flagged here and in
  // the commit/report rather than silently treated as more robust than it
  // is. Both target the exact same destination (this entity's billing-setup
  // drawer) because CARD readiness and MASAV authorization are both shown
  // and actioned there (2026-09-14e/h) -- no new destination invented.
  private static readonly ACTIONABLE_NEXT_ACTIONS = new Set([
    'חסר כרטיס אשראי',
    'ממתין לאישור מס״ב',
  ]);

  isActionableNextAction(statement: StatementListItem): boolean {
    return PlatformBillingOpsPageComponent.ACTIONABLE_NEXT_ACTIONS.has(statement.next_action);
  }

  onNextActionClick(statement: StatementListItem): void {
    if (!this.isActionableNextAction(statement)) return;
    this.openBillingSetup(statement.entity_id, statement.entity_name);
  }

  // ---- הגדרות עמותות (billing-account provisioning + readiness) --------

  loadReadiness(): void {
    if (this.readinessEntities.length === 0) this.readinessLoading = true;
    else this.readinessRefreshing = true;
    this.readinessError = null;
    this.provisioningService.getReadiness().subscribe({
      next: (res) => { this.readinessEntities = res.entities; this.readinessLoading = false; this.readinessRefreshing = false; },
      error: () => { this.readinessError = 'שגיאה בטעינת מוכנות החיוב של העמותות'; this.readinessLoading = false; this.readinessRefreshing = false; },
    });
  }

  // "מוכנה לחיוב" reflects whether THIS entity's actual current billing can
  // proceed -- not "is MASAV fully set up" in the abstract (2026-09-14e fix:
  // an entity with a valid card instrument and no current statement that
  // actually needs MASAV is genuinely ready, even if its optional MASAV
  // authorization happens to still be pending; see hasEntityMasavBlocker
  // below for why this is a display fix, not a new financial rule -- it
  // reuses the same server-computed routed_method every other MASAV/CARD
  // decision on this page already reads).
  entityReadiness(entity: BillingReadinessEntity): { ready: boolean; label: string } {
    if (!entity.billing_account_id) return { ready: false, label: 'טרם הוגדר חיוב' };
    if (entity.enforcement_status === 'suspended') return { ready: false, label: 'חשבון החיוב מושהה' };
    if (this.hasEntityMasavBlocker(entity)) return { ready: false, label: 'ממתין לאישור מס״ב' };
    return { ready: true, label: 'מוכנה לחיוב' };
  }

  // True only when this entity actually has a live Statement (approved/
  // open) that the server itself already routed to masav or blocked it
  // pending masav authorization -- i.e. MASAV is genuinely in the way of
  // billing THIS entity right now, not merely "not yet authorized" as an
  // abstract fact. `this.statements` is already loaded for the other tabs
  // (loadStatements(), called from the same ngOnInit) -- no new fetch.
  private hasEntityMasavBlocker(entity: BillingReadinessEntity): boolean {
    if (!entity.masav_configured || entity.masav_authorized) return false;
    return this.statements.some(
      (s) => s.entity_id === entity.id
        && (s.status === 'approved' || s.status === 'open')
        && (s.routed_method === 'masav' || s.routed_method === 'blocked'),
    );
  }

  feePercentOf(entity: BillingReadinessEntity): number {
    return entity.fee_rate ? Number(entity.fee_rate) * 100 : 0;
  }

  // Separates "MASAV configured but not yet authorized" (a neutral
  // configuration fact) from "MASAV authorization is an active blocker
  // right now" (2026-09-14p) -- entityReadiness() already makes this exact
  // distinction correctly for the "מוכנות לחיוב" column via
  // hasEntityMasavBlocker(); this reuses the identical check so the same
  // entity can't read as ready in one column while its מס״ב cell still
  // shows a warning icon implying an unresolved problem. גדולים מהחיים is
  // the real case this fixes: configured + not authorized + its one live
  // Statement (₪7.33) already routes to card, so MASAV isn't blocking
  // anything today -- "הוגדר · טרם אושר", no ⚠.
  masavDisplayState(entity: BillingReadinessEntity): { icon: string; label: string } {
    if (!entity.masav_configured) return { icon: '', label: '—' };
    if (entity.masav_authorized) return { icon: '✓', label: 'מאושר' };
    if (this.hasEntityMasavBlocker(entity)) return { icon: '⚠', label: 'ממתין לאישור' };
    return { icon: '', label: 'הוגדר · טרם אושר' };
  }

  get sortedReadinessEntities(): BillingReadinessEntity[] {
    if (!this.readinessSortField) return this.readinessEntities;
    const field = this.readinessSortField;
    return this.sortRows(this.readinessEntities, this.readinessSortDir, (e) => {
      switch (field) {
        case 'fee':   return this.feePercentOf(e);
        case 'vat':   return this.systemVatRatePercent ?? 0;
        case 'card':  return 1; // every row currently shows "✓ זמין" -- no real per-row value to sort by yet
        case 'masav': return this.masavDisplayState(e).label;
        case 'ready': return this.entityReadiness(e).label;
      }
    });
  }

  sortReadinessBy(field: ReadinessSortField): void {
    if (this.readinessSortField === field) {
      this.readinessSortDir = this.readinessSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.readinessSortField = field;
      this.readinessSortDir = 'asc';
    }
  }

  onVisibleReadinessColumnsChange(visible: Set<string>): void {
    this.visibleReadinessColumns = visible;
  }

  // ---- מע״מ מערכתי -- תצוגה בלבד (2026-09-14j: העריכה עברה ל-Platform
  // Admin -> הגדרות כלליות -> חיוב ומיסוי) ---------------------------------
  loadVatSetting(): void {
    this.billingSettingsService.get().subscribe({
      next: (res) => {
        if (res.setting) this.systemVatRatePercent = Number(res.setting.vat_rate) * 100;
      },
      error: () => { /* non-critical for this table -- readiness/fee still show */ },
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
          ...commissionFindings.map((f) => this.toCommissionIssue(f)),
        ];
      },
      error: () => {},
    });
  }

  // "דורש טיפול" as a task list, not an alert feed (2026-09-16): the two
  // finding types that have a known, existing operator fix get a specific
  // reason + entity/amount + a button that opens the exact same Billing
  // Setup drawer already used everywhere else on this page (openBillingSetup
  // -- no new destination, no new workflow). entityId/entityName are read
  // from data already on the page (readinessEntities, loaded unconditionally
  // in ngOnInit) or straight from the finding's own subject/details -- no
  // new backend call. Every other finding type keeps the previous generic
  // title/subtitle with no button, since no known fix exists for those here.
  private toCommissionIssue(f: ReconciliationFinding): CommissionIssue {
    const details = (f.details as Record<string, unknown> | null) || {};
    const severity = (f.severity === 'critical' ? 'critical' : 'warning') as 'critical' | 'warning';

    if (f.finding_type === 'active_entity_missing_billing_account') {
      const entityId = f.subject_id;
      const entityName = (details['displayName'] as string) || '';
      const amount = details['paidGrossTotal'] as string | undefined;
      return {
        id: `finding-${f.id}`, severity, entityId, entityName, amount,
        title: 'טרם הוגדר חשבון חיוב', actionLabel: 'להגדרת חיוב',
        subtitle: '',
      };
    }

    if (f.finding_type === 'masav_blocked_pending_authorization') {
      const entityId = details['entityId'] as string | undefined;
      const entityName = entityId ? this.readinessEntities.find((e) => e.id === entityId)?.display_name : undefined;
      const reason = details['reason'] as string | undefined;
      return {
        id: `finding-${f.id}`, severity, entityId, entityName,
        amount: details['totalDue'] as string | undefined,
        title: (reason && MASAV_BLOCK_REASON_LABELS[reason]) || sharedFindingTypeLabel(f.finding_type),
        actionLabel: 'להשלמת הגדרות מס״ב',
        subtitle: '',
      };
    }

    return {
      id: `finding-${f.id}`,
      title: sharedFindingTypeLabel(f.finding_type),
      subtitle: (details['displayName'] as string) || '',
      severity,
    };
  }

  // ---- masav ------------------------------------------------------------

  loadMasav(): void {
    if (this.blockedStatements.length === 0) this.masavLoading = true;
    else this.masavRefreshing = true;
    this.masavError = null;
    this.service.listBlockedMasavStatements().subscribe({
      next: (res) => { this.blockedStatements = res.statements; this.masavLoading = false; this.masavRefreshing = false; },
      error: () => { this.masavError = 'שגיאה בטעינת Statements חסומים'; this.masavLoading = false; this.masavRefreshing = false; },
    });
    this.service.listActionableMasavStatements().subscribe({
      next: (res) => { this.actionableStatements = res.statements; },
      error: () => {},
    });
  }

  blockedReasonLabel(reason: string): string {
    return BLOCKED_REASON_LABELS[reason] ?? reason;
  }

  toggleExportSelection(statementId: string): void {
    if (this.selectedExportStatementIds.has(statementId)) this.selectedExportStatementIds.delete(statementId);
    else this.selectedExportStatementIds.add(statementId);
  }

  isSelectedForExport(statementId: string): boolean {
    return this.selectedExportStatementIds.has(statementId);
  }

  // 2026-09-16 UX simplification: the operator no longer opens a
  // "collection attempt" as a separate step (see the workflow investigation
  // this closes -- the attempt has no financial meaning, it only exists so
  // generateExportExcel() has something to reference). This now does that
  // step itself, once per selected Statement, reusing ensureMasavAttempts()
  // -> openMasavAttempt() completely unchanged: an existing pending attempt
  // is reused, a missing one is created, and the same routing/readiness
  // checks decide -- never re-decided here. A Statement that can no longer
  // be included (e.g. its readiness changed after the page loaded) is never
  // silently dropped: it's excluded from the export and named, with its
  // reason, in masavExportResult.
  exportSelected(): void {
    if (this.exporting || this.selectedExportStatementIds.size === 0) return;
    const requestedIds = [...this.selectedExportStatementIds];
    this.exporting = true;
    this.exportError = null;
    this.masavExportResult = null;

    this.service.ensureMasavAttempts(requestedIds).subscribe({
      next: (res) => {
        const ready: string[] = [];
        const excluded: { statementId: string; reason: string }[] = [];
        for (const r of res.results) {
          if (!r.skipped || r.reason === 'attempt_already_active') ready.push(r.statementId);
          else excluded.push({ statementId: r.statementId, reason: r.reason || 'unknown' });
        }

        if (ready.length === 0) {
          this.exporting = false;
          this.exportError = `אף אחד מהחיובים שנבחרו כבר לא זמין לייצוא מס״ב — ${this.describeExcludedMasavStatements(excluded)}`;
          this.loadMasav();
          return;
        }

        this.service.exportMasavExcel(ready).subscribe({
          next: (blob) => {
            this.exporting = false;
            this.downloadExcel(blob);
            this.masavExportResult = excluded.length === 0 ? null : {
              successText: ready.length === 1 ? '1 חיוב נכלל בקובץ' : `${ready.length} חיובים נכללו בקובץ`,
              excludedText: `לא נכללו: ${this.describeExcludedMasavStatements(excluded)}`,
            };
            this.selectedExportStatementIds.clear();
            this.loadMasav();
          },
          error: (err) => {
            this.exporting = false;
            this.exportError = err?.error?.error || 'הפקת קובץ הייצוא נכשלה';
          },
        });
      },
      error: (err) => {
        this.exporting = false;
        this.exportError = err?.error?.error || 'הכנת החיובים לייצוא נכשלה';
      },
    });
  }

  private describeExcludedMasavStatements(excluded: { statementId: string; reason: string }[]): string {
    return excluded
      .map((e) => {
        const name = this.actionableStatements.find((s) => s.statement_id === e.statementId)?.entity_name || e.statementId;
        return `${name} (${MASAV_EXPORT_SKIP_REASON_LABELS[e.reason] ?? e.reason})`;
      })
      .join(', ');
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
