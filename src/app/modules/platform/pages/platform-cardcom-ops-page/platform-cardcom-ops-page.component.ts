import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CardcomOpsService,
  HealthResponse,
  JobRun,
  ReconciliationFinding,
} from '../../services/cardcom-ops.service';

// Human names for every job that has ever written to `job_runs` or
// `reconciliation_findings` -- both the 8 registered in src/jobs/index.js
// (shown in the "Jobs" technical list) and the 3 live-request-path sources
// that only ever write findings (masav-collection, collection-router,
// payment_verification_gate -- see collection.service.js/masav-collection.
// service.js/payment.handler.js) and therefore never appear as a job card.
// Mapping given verbatim where the redesign brief specified an exact
// phrase; the rest follow the same "בדיקת X" / plain-description style.
const JOB_LABELS: Record<string, string> = {
  'webhook-recovery': 'שחזור Webhooks',
  'stale-pending-donations': 'תרומות שממתינות זמן רב',
  'aggregate-consistency': 'בדיקת עקביות תרומות',
  'stuck-recurring-signups': 'הרשמות לחיוב קבוע שנתקעו',
  'billing-approval-consistency': 'בדיקת אישורי חיוב',
  'billing-provisioning-gap': 'בדיקת הגדרת גבייה לעמותות',
  'collection-attempt-reconciliation': 'בדיקת ניסיונות גבייה',
  'recurring-payment-reconciliation': 'התאמת חיובי הוראות קבע',
  'masav-collection': 'גביית מס"ב',
  'collection-router': 'ניתוב גבייה',
  'payment_verification_gate': 'שער אימות תשלום',
};

// Approved production schedule (docs/CARDCOM_OPERATIONAL_PROCESSES.md Part
// י') — display-only, not read from the API (health/jobs endpoints don't
// expose the cron expression). Purely informational context next to each
// job's status; the scheduler itself stays off until ENABLE_JOB_SCHEDULER
// is flipped in a real deploy, unrelated to this page.
//
// recurring-payment-reconciliation deliberately has NO entry here: it has
// no `schedule` field in its own job definition (removed 2026-09-01,
// "Keep recurring-payment-reconciliation dormant pending correlation
// validation") -- there is no approved cadence to display, and inventing
// one would misrepresent it as automatically monitored when it is not.
const JOB_FREQUENCY_LABELS: Record<string, string> = {
  'webhook-recovery': 'כל 15 דקות',
  'stale-pending-donations': 'כל שעה',
  'stuck-recurring-signups': 'כל שעה',
  'aggregate-consistency': 'פעם ביום',
  'billing-approval-consistency': 'כל שעה',
  'billing-provisioning-gap': 'כל שעה',
  'collection-attempt-reconciliation': 'כל שעה',
};

const DORMANT_JOB_NOTE: Record<string, string> = {
  'recurring-payment-reconciliation': 'לא מתוזמן אוטומטית — הרצה ידנית בלבד',
};

// One label per finding_type actually produced anywhere in the backend
// (grepped across src/jobs/*.job.js, collection.service.js, masav-
// collection.service.js, payment.handler.js — 2026-09-07 audit). Kept in
// sync manually since these are recorded as free-text strings, not an enum.
const FINDING_TYPE_LABELS: Record<string, string> = {
  lost_webhook_recovered: 'תרומה שהושלמה אוטומטית אחרי איחור ב-Webhook',
  lookup_failed: 'בדיקה מול CardCom נכשלה',
  pending_donation_missing_low_profile_id: 'תרומה ממתינה בלי מזהה לבדיקה מול CardCom',
  campaign_aggregate_mismatch: 'אי-התאמה בנתוני קמפיין',
  stuck_recurring_signup: 'הרשמה לחיוב קבוע שנתקעה',
  collection_attempt_stuck: 'ניסיון גבייה תקוע',
  statement_payments_exceed_total_due: 'תשלומים שחרגו מסכום החיוב בדוח',
  active_entity_missing_billing_account: 'עמותה פעילה ללא חשבון גבייה מוגדר',
  statement_components_not_fully_claimed: 'רכיבי דוח שלא שויכו במלואם',
  donation_claimed_by_ineffective_statement: 'תרומה משויכת לדוח לא תקף',
  claimed_donation_missing_from_components: 'תרומה משויכת חסרה ברכיבי הדוח',
  statement_gross_raised_mismatch: 'אי-התאמה בסכום שגויס בדוח',
  history_lookup_failed: 'בדיקת היסטוריית חיובים מול CardCom נכשלה',
  recurring_charge_recovered_from_history: 'חיוב הוראת קבע שהושלם מהיסטוריית CardCom',
  masav_blocked_pending_authorization: 'גבייה חסומה — ממתינה לאישור מס"ב',
  collection_method_not_implemented: 'אמצעי גבייה שאינו נתמך עדיין',
  no_active_payment_instrument: 'אין אמצעי תשלום פעיל לגבייה',
  gate_v1_mismatch: 'תרומה עוכבה לבדיקה (אי-התאמה באימות תשלום)',
};

const WEBHOOK_TYPE_LABELS: Record<string, string> = {
  LowProfile: 'תרומה חד-פעמית',
  // Seen directly via this page's real data: one row from 2026-08-10 with
  // RecordType='Payment' — Cardcom's own "Test Webhook" button in the
  // terminal admin panel, not a real donation event. Labeled so it doesn't
  // show as a raw unlabeled string, not because it's expected traffic.
  Payment: 'בדיקת Webhook (CardCom)',
  MasterRecurring: 'הוראת קבע (סטטוס)',
  DetailRecurring: 'הוראת קבע (חיוב)',
  Document: 'מסמך',
};

// Which of the 4 operator-facing health areas a job/finding-source belongs
// to. Not a job/schedule property — a purely presentational grouping for
// this page, decided from what each job actually does (see each job's own
// header comment): donation delivery/consistency vs. commission billing &
// collection. Jobs/sources not listed here fall back to 'donations' in
// jobArea() below (there are none today; kept as a safe default).
const JOB_AREA: Record<string, 'donations' | 'commission'> = {
  'webhook-recovery': 'donations',
  'stale-pending-donations': 'donations',
  'aggregate-consistency': 'donations',
  'stuck-recurring-signups': 'donations',
  'recurring-payment-reconciliation': 'donations',
  'payment_verification_gate': 'donations',
  'billing-approval-consistency': 'commission',
  'billing-provisioning-gap': 'commission',
  'collection-attempt-reconciliation': 'commission',
  'masav-collection': 'commission',
  'collection-router': 'commission',
};

// Finding types that specifically mean "a call to CardCom itself failed or
// couldn't be completed" (as opposed to a data-consistency problem on
// Hamonym's own side). This is the CardCom health tile's signal -- see the
// component doc comment above for why this is a derived proxy, not an
// existing dedicated CardCom-connectivity check.
const CARDCOM_FINDING_TYPES = new Set(['lookup_failed', 'history_lookup_failed']);

export type AreaKey = 'cardcom' | 'donations' | 'commission' | 'jobs';
export type AreaStatus = 'ok' | 'warning' | 'critical';

interface AreaMeta {
  title: string;
  ok: string;
  warning: string;
  critical: string;
}

const AREA_META: Record<AreaKey, AreaMeta> = {
  cardcom: { title: 'CardCom', ok: 'תקין', warning: 'אזהרה', critical: 'תקלה' },
  donations: { title: 'תרומות', ok: 'תקין', warning: 'אזהרה', critical: 'דורש טיפול' },
  commission: { title: 'גביית עמלות', ok: 'תקין', warning: 'אזהרה', critical: 'דורש טיפול' },
  jobs: { title: 'משימות רקע', ok: 'תקינות', warning: 'אזהרה', critical: 'דורשות טיפול' },
};

const AREA_ORDER: AreaKey[] = ['cardcom', 'donations', 'commission', 'jobs'];

export interface ActionableItem {
  id: string;
  area: AreaKey;
  severity: 'critical' | 'warning';
  title: string;
  subtitle: string;
  jobName?: string;
  findingId?: number;
}

@Component({
  selector: 'app-platform-cardcom-ops-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './platform-cardcom-ops-page.component.html',
  styleUrl: './platform-cardcom-ops-page.component.css',
})
export class PlatformCardcomOpsPageComponent implements OnInit {
  private cardcomOps = inject(CardcomOpsService);

  readonly areaOrder = AREA_ORDER;

  loading = true;
  error: string | null = null;

  health: HealthResponse | null = null;
  findings: ReconciliationFinding[] = [];
  showResolved = false;
  showTechnical = false;

  runsByJob: Record<string, JobRun[]> = {};
  expandedJob: string | null = null;
  runningJob: string | null = null;
  resolvingFindingId: number | null = null;
  actionError: string | null = null;

  ngOnInit(): void {
    this.loadAll();
  }

  private loadAll(): void {
    this.loading = true;
    this.error = null;

    this.cardcomOps.getHealth().subscribe({
      next: (health) => {
        this.health = health;
        this.loading = false;
      },
      error: () => {
        this.error = 'שגיאה בטעינת מצב המערכת';
        this.loading = false;
      },
    });

    this.loadFindings();
  }

  private loadFindings(): void {
    this.cardcomOps.getFindings(this.showResolved).subscribe({
      next: (res) => { this.findings = res.findings; },
      error: () => { /* health already surfaces the main error state; findings failing quietly is acceptable here */ },
    });
  }

  toggleResolved(): void {
    this.showResolved = !this.showResolved;
    this.loadFindings();
  }

  toggleTechnical(): void {
    this.showTechnical = !this.showTechnical;
  }

  jobLabel(name: string): string {
    return JOB_LABELS[name] ?? name;
  }

  jobFrequency(name: string): string {
    return JOB_FREQUENCY_LABELS[name] ?? DORMANT_JOB_NOTE[name] ?? '';
  }

  findingTypeLabel(type: string): string {
    return FINDING_TYPE_LABELS[type] ?? type;
  }

  webhookTypeLabel(type: string): string {
    return WEBHOOK_TYPE_LABELS[type] ?? type;
  }

  jobArea(jobName: string): 'donations' | 'commission' {
    return JOB_AREA[jobName] ?? 'donations';
  }

  lastRunFor(jobName: string) {
    return this.health?.jobs.find((j) => j.job_name === jobName) ?? null;
  }

  // ---- Operator-facing health summary -----------------------------------
  //
  // Built entirely from data the backend already returns (health.alerts +
  // findings) -- no backend classification change. computeStaleAlerts on
  // the server already only evaluates jobs that declare a `schedule`
  // (src/jobs/schedule-window.js), so a dormant/manual-only job like
  // recurring-payment-reconciliation can never produce a job_stale alert in
  // the first place; this page does not need to (and must not) re-decide
  // that here. This layer's only job is to translate what the server
  // already correctly decided into human language and 4 simple buckets.
  get actionableItems(): ActionableItem[] {
    if (!this.health) return [];
    const items: ActionableItem[] = [];

    for (const alert of this.health.alerts) {
      if (alert.type === 'job_failed' && alert.jobName) {
        const run = this.lastRunFor(alert.jobName);
        items.push({
          id: `alert-failed-${alert.jobName}`,
          area: 'jobs',
          severity: 'critical',
          title: `${this.jobLabel(alert.jobName)} — נכשל בריצה האחרונה`,
          subtitle: run ? `ריצה אחרונה: ${this.fmtDate(run.started_at)}` : 'ריצה אחרונה: —',
          jobName: alert.jobName,
        });
      } else if (alert.type === 'job_stale' && alert.jobName) {
        items.push({
          id: `alert-stale-${alert.jobName}`,
          area: 'jobs',
          severity: 'critical',
          title: `${this.jobLabel(alert.jobName)} — לא רץ בהצלחה בזמן הצפוי`,
          subtitle: this.fmtStaleness(alert.minutesSinceLastSuccess ?? null),
          jobName: alert.jobName,
        });
      } else if (alert.type === 'webhook_recovery_unresolved') {
        items.push({
          id: 'alert-webhook-unresolved',
          area: 'cardcom',
          severity: 'warning',
          title: 'שחזור Webhooks הסתיים עם אירועים שלא טופלו',
          subtitle: `${alert.failed ?? 0} נכשלו, ${alert.notRouted ?? 0} לא נותבו לטיפול`,
          jobName: 'webhook-recovery',
        });
      }
      // 'critical_findings_open' (a raw count) is deliberately not rendered
      // here -- the itemized findings below already describe exactly which
      // entities/donations are affected, which is what an operator can
      // actually act on; a bare count adds nothing.
    }

    for (const finding of this.findings) {
      if (finding.resolved_at || finding.severity === 'info') continue;
      const area: AreaKey = CARDCOM_FINDING_TYPES.has(finding.finding_type)
        ? 'cardcom'
        : this.jobArea(finding.job_name);
      items.push({
        id: `finding-${finding.id}`,
        area,
        severity: finding.severity === 'critical' ? 'critical' : 'warning',
        title: this.findingTypeLabel(finding.finding_type),
        subtitle: this.findingSubtitle(finding),
        jobName: finding.job_name,
        findingId: finding.id,
      });
    }

    return items.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area);
    });
  }

  itemsForArea(area: AreaKey): ActionableItem[] {
    return this.actionableItems.filter((i) => i.area === area);
  }

  areaStatus(area: AreaKey): AreaStatus {
    const items = this.itemsForArea(area);
    if (items.some((i) => i.severity === 'critical')) return 'critical';
    if (items.length > 0) return 'warning';
    return 'ok';
  }

  areaTitle(area: AreaKey): string {
    return AREA_META[area].title;
  }

  areaStatusLabel(area: AreaKey): string {
    return AREA_META[area][this.areaStatus(area)];
  }

  get overallOk(): boolean {
    return this.areaOrder.every((a) => this.areaStatus(a) === 'ok');
  }

  get overallCriticalCount(): number {
    return this.actionableItems.filter((i) => i.severity === 'critical').length;
  }

  get overallWarningCount(): number {
    return this.actionableItems.filter((i) => i.severity === 'warning').length;
  }

  private findingSubtitle(finding: ReconciliationFinding): string {
    const details = finding.details as Record<string, unknown> | null;
    const displayName = details && typeof details['displayName'] === 'string' ? (details['displayName'] as string) : null;
    const lastSeen = this.fmtDate(finding.last_seen_at);
    return displayName ? `${displayName} — נראה לאחרונה: ${lastSeen}` : `נראה לאחרונה: ${lastSeen}`;
  }

  // ---- Actions (unchanged capabilities, now reachable from both the
  // actionable list and the technical/advanced section) -------------------

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

  runNow(jobName: string): void {
    this.runningJob = jobName;
    this.actionError = null;
    this.cardcomOps.runJob(jobName).subscribe({
      next: () => {
        this.runningJob = null;
        delete this.runsByJob[jobName]; // force a fresh fetch next expand
        this.loadAll(); // re-fetch from the server — never guess the new status locally
      },
      error: (err) => {
        this.runningJob = null;
        this.actionError = err?.error?.error || 'הרצת ה-job נכשלה';
      },
    });
  }

  resolveFinding(finding: ReconciliationFinding): void {
    this.resolvingFindingId = finding.id;
    this.actionError = null;
    this.cardcomOps.resolveFinding(finding.id).subscribe({
      next: () => {
        this.resolvingFindingId = null;
        this.loadFindings();
      },
      error: (err) => {
        this.resolvingFindingId = null;
        this.actionError = err?.error?.error || 'סימון ה-finding ככשלון נכשל';
      },
    });
  }

  // Jumps from a "דורש טיפול" item into the technical/advanced section
  // instead of repeating its full detail up here — avoids showing the same
  // failure twice (a compact summary above, the full job card/finding row
  // below), per the redesign's single most important rule.
  revealTechnical(item: ActionableItem): void {
    this.showTechnical = true;
    if (item.jobName && this.health?.knownJobs.includes(item.jobName)) {
      this.expandedJob = item.jobName;
      if (!this.runsByJob[item.jobName]) {
        // Fetch directly rather than via toggleRuns() -- expandedJob is
        // already set to this job above, so calling toggleRuns() here would
        // see expandedJob === jobName and collapse it instead of expanding.
        this.cardcomOps.getJobRuns(item.jobName).subscribe({
          next: (res) => { this.runsByJob[item.jobName!] = res.runs; },
          error: () => { this.runsByJob[item.jobName!] = []; },
        });
      }
    }
    const elId = item.findingId != null ? `tech-finding-${item.findingId}` : item.jobName ? `tech-job-${item.jobName}` : null;
    if (!elId || typeof document === 'undefined') return;
    setTimeout(() => document.getElementById(elId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  // These fields (started_at/finished_at/found_at/last_seen_at) are all
  // TIMESTAMPTZ, a real instant — not the DATE-column ambiguity found and
  // fixed elsewhere this session (docs/CARDCOM_OPERATIONAL_PROCESSES.md).
  // Local getters throughout (date AND time) so the two halves come from
  // the same clock — mixing a UTC-sliced date with local-time hours would
  // reintroduce exactly that class of bug.
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

  // Date-only half of fmtDateTime above, same clock/derivation — the app's
  // established DD/MM/YYYY convention, not a new format.
  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  fmtDuration(ms: number | null): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // Human elapsed-time phrasing for a job_stale alert, replacing the raw
  // "28344 דקות" the backend's own alert.message used to be read verbatim
  // in this component before the redesign — same underlying number
  // (alert.minutesSinceLastSuccess), just converted to the coarsest unit
  // that stays meaningful to a non-technical operator.
  fmtStaleness(minutes: number | null): string {
    if (minutes == null) return 'מעולם לא רץ בהצלחה';
    const days = Math.floor(minutes / (60 * 24));
    if (days >= 1) return `לא רץ בהצלחה כבר ${days} ${days === 1 ? 'יום' : 'ימים'}`;
    const hours = Math.floor(minutes / 60);
    if (hours >= 1) return `לא רץ בהצלחה כבר ${hours} ${hours === 1 ? 'שעה' : 'שעות'}`;
    return `לא רץ בהצלחה כבר ${minutes} דקות`;
  }
}
