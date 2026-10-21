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
  FinancialReportRow,
} from '../../services/collection-ops.service';
import { EntityComboboxComponent, ComboboxEntity } from '../../components/entity-combobox/entity-combobox.component';
import { SimulationClockService, SimulationClockStatus } from '../../services/simulation-clock.service';

type Tab = 'overview' | 'history' | 'reports';
type ReportPeriodMode = 'period' | 'range' | 'all';

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
  imports: [CommonModule, FormsModule, RouterModule, EntityComboboxComponent],
  templateUrl: './platform-collection-ops-page.component.html',
  styleUrl: './platform-collection-ops-page.component.css',
})
export class PlatformCollectionOpsPageComponent implements OnInit {
  private billingOps = inject(BillingOpsService);
  private financeOps = inject(FinanceOpsService);
  private collectionOps = inject(CollectionOpsService);
  private billingProvisioning = inject(BillingProvisioningService);
  private simulationClock = inject(SimulationClockService);
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
    if (t === 'reports') this.runReportPreview();
  }

  // --- Period selector (shared by Overview + Reports) ------------------
  // 2026-10 (month-nav fix): navigation is now driven by selectedYear/
  // selectedMonth, NOT by which billing_periods rows happen to already
  // exist -- a month with no Statement yet must stay selectable (see
  // collection-ops.service.js#getFinancialOverview's own comment). The
  // Reports tab's own "period mode" dropdown is intentionally left as-is,
  // still sourced from `periods` (billingOps.listPeriods()) -- a report for
  // a month with nothing billed isn't a real use case there, out of scope
  // for this fix.
  periods: BillingPeriod[] = [];
  selectedPeriodId: string | null = null;
  selectedYear = 0;
  selectedMonth = 0;

  // Business-time status (reuses the EXISTING simulation-clock service/tab
  // verbatim -- no new clock) -- drives both the compact status line and
  // which month this page defaults to on load.
  clockStatus: SimulationClockStatus | null = null;

  ngOnInit(): void {
    this.billingOps.listPeriods().subscribe({ next: (res) => { this.periods = res.periods; } });

    this.simulationClock.getStatus().subscribe({
      next: (res) => {
        this.clockStatus = res;
        const businessNow = new Date(res.businessNow);
        this.selectedYear = businessNow.getFullYear();
        this.selectedMonth = businessNow.getMonth() + 1;
        this.loadOverviewAndStatements();
      },
      error: () => {
        // Clock status itself failing must not block the page -- fall back
        // to real wall-clock "now", same default the clock would report in
        // non-simulated mode anyway.
        const now = new Date();
        this.selectedYear = now.getFullYear();
        this.selectedMonth = now.getMonth() + 1;
        this.loadOverviewAndStatements();
      },
    });

    this.loadNeedsAttention();
    this.loadSystemActivity();
    // Loaded once, eagerly -- reused by "כל העמותות" below AND by the
    // searchable nonprofit dropdown on both the History and Reports tabs,
    // so there is exactly one entity list in this whole page, never one
    // per consumer.
    this.loadAllEntities();
  }

  onPeriodChange(): void {
    // Reports tab's own dropdown still drives Reports directly.
    if (this.tab === 'reports') this.runReportPreview();
  }

  prevMonth(): void {
    this.selectedMonth--;
    if (this.selectedMonth < 1) { this.selectedMonth = 12; this.selectedYear--; }
    this.loadOverviewAndStatements();
  }

  nextMonth(): void {
    this.selectedMonth++;
    if (this.selectedMonth > 12) { this.selectedMonth = 1; this.selectedYear++; }
    this.loadOverviewAndStatements();
  }

  // Bound to the optional native <input type="month"> picker the month
  // label opens -- value is "YYYY-MM".
  onMonthPicked(value: string): void {
    if (!value) return;
    const [y, m] = value.split('-').map(Number);
    if (!y || !m) return;
    this.selectedYear = y;
    this.selectedMonth = m;
    this.loadOverviewAndStatements();
  }

  get monthPickerValue(): string {
    return `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
  }

  private readonly HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  get selectedMonthLabel(): string {
    return `${this.HEBREW_MONTHS[this.selectedMonth - 1]} ${this.selectedYear}`;
  }

  // Compact business-time status line reused at the top of this page
  // (2026-10) -- same clockStatus the Simulation tab itself reads, never a
  // second source of truth for "what time does the system think it is".
  get businessTimeStatusLabel(): string {
    if (!this.clockStatus) return '';
    if (!this.clockStatus.overrideActive) return 'זמן עסקי: זמן אמת';
    const d = new Date(this.clockStatus.businessNow);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `זמן עסקי: ${dd}.${mm}.${d.getFullYear()} · ${hh}:${min} | סימולציה פעילה`;
  }

  // "ספטמבר 2026", not a raw date range -- a 28-cutoff period's month is
  // approximated by its period_start's calendar month, same as how the
  // admin already thinks of "last month's billing" elsewhere in the app.
  fmtPeriodLabel(p: BillingPeriod): string {
    const d = new Date(p.period_start);
    return `${this.HEBREW_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  // Hebrew labels for every real statements.status value (enum unchanged on
  // the backend) -- used by both the Statement table and the History tab.
  private readonly STATUS_LABELS: Record<string, string> = {
    draft: 'טיוטה',
    approved: 'מאושר',
    open: 'פתוח',
    paid: 'שולם',
    cancelled: 'בוטל',
    abandoned: 'בוטל',
    written_off: 'נמחק',
    collection_failed: 'גבייה נכשלה',
    pending_collection: 'מחכה לגבייה',
  };
  statusLabel(status: string | null | undefined): string {
    if (!status) return '—';
    return this.STATUS_LABELS[status] || status;
  }

  readinessReasonLabel(reason: string | null): string {
    switch (reason) {
      case 'no_active_payment_instrument': return 'אין אמצעי תשלום פעיל';
      case 'masav_not_configured': return 'פרטי מס״ב לא הוגדרו';
      case 'masav_incomplete': return 'פרטי מס״ב חסרים';
      case 'masav_not_authorized': return 'מס״ב לא מאושר';
      default: return '';
    }
  }

  // Plain-Hebrew "what happened / what happens automatically next" (2026-10
  // product-owner request) -- computed purely from fields the drawer
  // already has (status/routed_method/readiness/latest attempt status), no
  // new backend call. Deliberately HONEST about the real gap between the
  // approved FIN-11-automatic model and what the code actually runs today
  // (none of FIN-11's 3 jobs are registered -- see getSystemActivity) --
  // per explicit instruction, a conflict between the approved model and
  // actual behavior is surfaced here, never silently smoothed over.
  get statementExplanation(): { whatHappened: string; automaticNext: string } | null {
    const s = this.selectedStatement;
    if (!s) return null;

    if (s.status === 'draft') {
      return {
        whatHappened: 'החיוב חושב אך עדיין לא אושר — זהו חישוב, לא חוב לגביה.',
        automaticNext: 'ללא אישור ידני, שום גבייה לא תתבצע — לא אוטומטית ולא ידנית.',
      };
    }
    if (s.status === 'paid') {
      return {
        whatHappened: 'הסכום נגבה במלואו ואושר על ידי הספק.',
        automaticNext: 'אין פעולה נדרשת.',
      };
    }
    if (s.readiness.route === 'card') {
      if (!s.readiness.ready) {
        return {
          whatHappened: `החיוב מאושר לגבייה בכרטיס, אך ${this.readinessReasonLabel(s.readiness.reason)}.`,
          automaticNext: 'שום דבר לא יקרה אוטומטית עד שהעמותה תגדיר אמצעי תשלום.',
        };
      }
      if (s.latest_attempt_status === 'pending' || s.latest_attempt_status === 'ambiguous') {
        return {
          whatHappened: 'ניסיון גבייה בכרטיס פעיל כרגע — התוצאה עדיין לא ידועה.',
          automaticNext: 'בדיקה אוטומטית שעתית (collection-attempt-reconciliation) תברר את התוצאה מול הספק בשעה הקרובה.',
        };
      }
      if (s.latest_attempt_status === 'declined' || s.latest_attempt_status === 'technical_failure') {
        return {
          whatHappened: 'ניסיון גבייה בכרטיס נכשל.',
          automaticNext: 'אין מנגנון אוטומטי שינסה שוב כרגע — מנגנון הגבייה החוזרת של FIN-11 קיים בקוד אך לא הופעל.',
        };
      }
      return {
        whatHappened: 'החיוב מאושר ומוכן לגבייה בכרטיס.',
        automaticNext: 'לפי המודל המאושר, גבייה חודשית אמורה לקרות אוטומטית — אך מנגנון הגבייה האוטומטי של FIN-11 טרם הופעל במערכת. כרגע הדרך היחידה לגבות היא גבייה ידנית (למטה, פעולה מתקדמת).',
      };
    }
    // route === 'masav'
    if (!s.readiness.ready) {
      return {
        whatHappened: `החיוב מאושר ומנותב למס״ב, אך ${this.readinessReasonLabel(s.readiness.reason)}.`,
        automaticNext: 'שום דבר לא יקרה אוטומטית עד שהגדרות המס״ב יושלמו (״ניהול אמצעי תשלום לעמותות״).',
      };
    }
    return {
      whatHappened: 'החיוב מאושר ומנותב לגבייה במס״ב.',
      automaticNext: 'אין יצירה אוטומטית של הצעת מס״ב כיום — מנגנון ההכנה האוטומטית של FIN-11 קיים בקוד אך לא הופעל. פעולת ייצוא מס״ב ידנית אינה זמינה כרגע במסך המאוחד — פער ידוע, ראו דיווח.',
    };
  }

  // --- A. Financial overview --------------------------------------------
  overview: FinancialOverview | null = null;
  overviewLoading = false;
  overviewError: string | null = null;

  loadOverviewAndStatements(): void {
    if (!this.selectedYear || !this.selectedMonth) return;
    this.overviewLoading = true;
    this.overviewError = null;
    const requestedYear = this.selectedYear;
    const requestedMonth = this.selectedMonth;
    this.collectionOps.getOverview(requestedYear, requestedMonth).subscribe({
      next: (res) => {
        // A fast double-navigation (prev/next clicked twice before the
        // first response lands) must not let the stale response overwrite
        // the month the admin is actually looking at now.
        if (requestedYear !== this.selectedYear || requestedMonth !== this.selectedMonth) return;
        this.overview = res.overview;
        this.selectedPeriodId = res.overview.period.id;
        this.overviewLoading = false;
        this.loadStatements();
      },
      error: () => {
        if (requestedYear !== this.selectedYear || requestedMonth !== this.selectedMonth) return;
        // Never silently change the selected month on a failed call -- the
        // admin stays on the month they navigated to, with the error shown
        // and the previous month's data (if any) left visible underneath.
        this.overviewLoading = false;
        this.overviewError = 'שגיאה בטעינת תמונת המצב הכספית';
      },
    });
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

  // "הצעות מס״ב מאושרות — מוכנות לייצוא" (2026-10 FIN-11 closure gap fix):
  // reuses FinanceOpsService#exportMasavProposals verbatim -- the exact
  // same atomic build-file-then-flip-to-exported function already proven
  // in the earlier MASAV export round, just never reachable from this page
  // for an already-approved proposal until now.
  exportSingleProposal(item: NeedsAttentionItem): void {
    if (!item.proposalId || this.attentionActionBusy) return;
    if (!window.confirm(`לייצא הצעת מס״ב בסך ₪${item.amount} עבור ${item.entityName}? הקובץ יוריד למחשב; שידור בפועל לבנק הוא עדיין פעולה ידנית.`)) return;

    this.attentionActionBusy = true;
    this.attentionActionError = null;
    this.financeOps.exportMasavProposals([item.proposalId]).subscribe({
      next: (blob) => {
        this.attentionActionBusy = false;
        this.openItem = null;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `masav-proposal-export-${Date.now()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.loadNeedsAttention();
      },
      error: () => { this.attentionActionBusy = false; this.attentionActionError = 'הייצוא נכשל — ייתכן שהיתרה השתנתה מאז האישור'; },
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
  // correction, 2026-10), reusing BillingProvisioningService#getReadiness
  // verbatim -- the exact same read the old "הגדרות עמותות" tab already
  // used. Loaded eagerly (see ngOnInit) -- also the one source for the
  // searchable nonprofit dropdowns below.
  allEntities: BillingReadinessEntity[] = [];
  allEntitiesLoading = false;

  loadAllEntities(): void {
    this.allEntitiesLoading = true;
    this.billingProvisioning.getReadiness().subscribe({
      next: (res) => { this.allEntities = res.entities; this.allEntitiesLoading = false; },
      error: () => { this.allEntitiesLoading = false; },
    });
  }

  // Searchable nonprofit combobox (Overview + History + Reports, 2026-10
  // product-owner request) -- one list, reused via <app-entity-combobox>,
  // which emits a real entity id directly (never a typed name to resolve).
  get entityOptions(): ComboboxEntity[] {
    return this.allEntities
      .map((e) => ({ id: e.id, name: e.display_name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }

  // Readiness per the entity's OWN collection method (2026-10 review fix):
  // a card-routed nonprofit was shown with a MASAV-authorization warning
  // it has no reason to ever resolve. preferred_collection_method is the
  // same existing field the old "הגדרות עמותות" tab already read for this
  // exact purpose -- no new backend logic.
  entityReadinessLabel(e: BillingReadinessEntity): string {
    if (!e.billing_account_id) return 'חיוב לא הוגדר';
    if (e.preferred_collection_method === 'card') return 'מוכן (כרטיס אשראי)';
    if (e.masav_authorized) return 'מוכן (מס״ב)';
    if (e.masav_configured) return 'מס״ב הוגדר, ממתין לאישור';
    return 'מס״ב לא הוגדר';
  }
  entityReadinessOk(e: BillingReadinessEntity): boolean {
    return !!e.billing_account_id && (e.preferred_collection_method === 'card' || !!e.masav_authorized);
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

  // One compact line for the collapsed default view ("עדכון אחרון: ... |
  // מצב המערכת: ..."); the full job list only shows once expanded. Both
  // numbers are read directly from job_runs via getSystemActivity -- never
  // invented when systemActivity hasn't loaded yet.
  get systemActivitySummary(): string {
    if (!this.systemActivity) return 'טוען...';
    const runTimes = this.systemActivity.automatic.map((j) => j.lastRunAt).filter((t): t is string => !!t);
    const latest = runTimes.length ? runTimes.reduce((a, b) => (a > b ? a : b)) : null;
    const anyFailed = this.systemActivity.automatic.some((j) => j.status === 'failed');
    return `עדכון אחרון: ${latest ? this.fmtDate(latest) : 'אין מידע'} | מצב המערכת: ${anyFailed ? 'יש לבדוק' : 'תקין'}`;
  }

  // --- D. מצב הגבייה מעמותות (period-scoped table, reuses BillingOpsService#listStatements) ---
  // Renamed from "חיובי העמותות" (2026-10, product-owner request) -- same
  // data/endpoint, clearer business name. Always fetched UNFILTERED by
  // status -- the one status dropdown and the nonprofit combobox are both
  // applied client-side below, so the Overview's "X בטיוטה" notice can
  // read from the same array without a second call.
  statements: StatementListItem[] = [];
  statementsLoading = false;
  overviewEntityId: string | undefined = undefined;
  statusFilter = '';

  loadStatements(): void {
    if (!this.selectedPeriodId) {
      // No billing_periods row for this month yet -- a real, normal state
      // (see overview.hasStatements), not an error. Clear any stale rows
      // left over from a previously-selected month.
      this.statements = [];
      return;
    }
    this.statementsLoading = true;
    this.billingOps.listStatements({ periodId: this.selectedPeriodId }).subscribe({
      next: (res) => { this.statements = res.statements; this.statementsLoading = false; },
      error: () => { this.statementsLoading = false; },
    });
  }

  get filteredStatements(): StatementListItem[] {
    return this.statements.filter((s) =>
      (!this.overviewEntityId || s.entity_id === this.overviewEntityId) &&
      (!this.statusFilter || s.status === this.statusFilter)
    );
  }

  statementOutstanding(s: StatementListItem): number {
    return Number(s.total_due) - Number(s.collected);
  }

  // "סך החיובים" vs "₪38.90" draft-table mismatch (2026-10 review): drafts
  // are intentionally excluded from the Overview's 4 metrics (not yet
  // approved -- could still change on recalculation), but a draft sitting
  // in the table with no corresponding number in the Overview above it
  // looks like a bug if left unexplained. This surfaces exactly that,
  // computed from the SAME unfiltered `statements` array the table uses --
  // never a second, possibly-inconsistent query.
  get draftNotice(): { count: number; total: number } | null {
    const drafts = this.statements.filter((s) => s.status === 'draft');
    if (drafts.length === 0) return null;
    return { count: drafts.length, total: drafts.reduce((sum, s) => sum + Number(s.total_due), 0) };
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
    this.loadOverviewAndStatements();
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
  // "כל העמותות" is simply entityId left undefined -- the combobox emits
  // the real id directly, no name-matching/resolution needed anymore.
  historyRows: StatementHistoryRow[] = [];
  historyLoading = false;
  historyFilters = { entityId: undefined as string | undefined, dateFrom: '', dateTo: '', status: '' };

  runHistorySearch(): void {
    this.historyLoading = true;
    this.collectionOps.searchHistory({
      entityId: this.historyFilters.entityId,
      dateFrom: this.historyFilters.dateFrom || undefined,
      dateTo: this.historyFilters.dateTo || undefined,
      status: this.historyFilters.status || undefined,
    }).subscribe({
      next: (res) => { this.historyRows = res.statements; this.historyLoading = false; },
      error: () => { this.historyLoading = false; },
    });
  }

  clearHistoryFilters(): void {
    this.historyFilters = { entityId: undefined, dateFrom: '', dateTo: '', status: '' };
    this.runHistorySearch();
  }

  // --- Tab 3: דוחות --------------------------------------------------------
  // Preview and the downloaded file both come from the SAME backend rows
  // (collection-ops.service.js#getFinancialReportRows) -- picking a
  // different period-mode/nonprofit re-runs the preview, and the download
  // button always sends the exact same scope the preview just showed, so
  // what the admin sees is guaranteed to be what they get.
  //
  // Three mutually-exclusive period modes (2026-10, product-owner request):
  // 'period' = one real billing period (month/year, the normal case),
  // 'range' = a custom date range (filters by billing-PERIOD overlap, not
  // by any transaction/payment date -- this report has no transaction-date
  // dimension to filter by), 'all' = every period, unscoped.
  reportPeriodMode: ReportPeriodMode = 'period';
  reportDateFrom = '';
  reportDateTo = '';
  reportEntityId: string | undefined = undefined;
  reportRows: FinancialReportRow[] = [];
  reportPreviewLoading = false;
  reportBusy = false;
  reportError: string | null = null;

  private reportScope(): { periodId?: string; dateFrom?: string; dateTo?: string; entityId?: string } {
    const entityId = this.reportEntityId;
    if (this.reportPeriodMode === 'period') return { periodId: this.selectedPeriodId || undefined, entityId };
    if (this.reportPeriodMode === 'range') return { dateFrom: this.reportDateFrom || undefined, dateTo: this.reportDateTo || undefined, entityId };
    return { entityId }; // 'all'
  }

  runReportPreview(): void {
    if (this.reportPeriodMode === 'period' && !this.selectedPeriodId) return;
    this.reportPreviewLoading = true;
    this.collectionOps.getReportPreview(this.reportScope()).subscribe({
      next: (res) => { this.reportRows = res.rows; this.reportPreviewLoading = false; },
      error: () => { this.reportPreviewLoading = false; this.reportRows = []; },
    });
  }

  downloadReport(): void {
    if (this.reportBusy) return;
    this.reportBusy = true;
    this.reportError = null;
    this.collectionOps.exportReport(this.reportScope()).subscribe({
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
