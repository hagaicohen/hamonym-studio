import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CardcomOpsService,
  HealthResponse,
  JobRun,
  ReconciliationFinding,
} from '../../services/cardcom-ops.service';
import {
  jobLabel as sharedJobLabel,
  jobFrequency as sharedJobFrequency,
  findingTypeLabel as sharedFindingTypeLabel,
  webhookTypeLabel as sharedWebhookTypeLabel,
  jobArea as sharedJobArea,
  PROVIDER_FINDING_TYPES,
} from '../../utils/ops-labels';

// This page is the operator-facing "תרומות" (donations) health view (UX
// simplification pass, 2026-09-14) -- it used to be "תפעול CardCom", a
// single page covering both donation delivery AND commission-billing
// health. The label/area-classification tables now live in
// ../../utils/ops-labels.ts (shared with platform-billing-ops-page's own
// "דורש טיפול" section, which surfaces the SAME underlying data filtered
// to the 'commission' area instead) -- this component still fetches and
// classifies all 4 areas internally (cardcom/donations/commission/jobs),
// unchanged from before, but the TEMPLATE only ever renders the areas
// relevant to donations (see areaOrder below); commission-area items are
// still computed here (and covered by this file's own spec) but are
// surfaced to the operator on the Billing Ops page instead.
const CARDCOM_FINDING_TYPES = PROVIDER_FINDING_TYPES;

export type AreaKey = 'cardcom' | 'donations' | 'commission' | 'jobs';
export type AreaStatus = 'ok' | 'warning' | 'critical';

// Operator-facing grouping for "דורש טיפול" (2026-09-14q simplification,
// built directly from the read-only audit this same day). Findings are
// grouped by finding_type for DISPLAY only -- recordFinding's own dedup key
// is (job_name, finding_type, subject_type, subject_id), so every open
// finding genuinely IS a distinct donation/campaign; grouping must never
// hide that a group of "4" really is 4 separate subjects, each still
// reachable individually in the group's drawer.
//
// `tone: 'neutral'` exists for exactly one documented case so far
// (campaign_aggregate_mismatch): its underlying `severity` is 'critical' in
// the data (a genuine data-integrity bug worth fixing) but the job's own
// comment establishes it as "display-only drift, not money at risk" --
// tone only softens the VISUAL treatment (dot color), it never touches
// finding.severity itself or which findings count as open/actionable.
export interface FindingGroupMeta {
  title: string;
  explanation: string;
  actionLabel: string;
  pluralSubjectLabel: string;
  tone: 'urgent' | 'neutral';
}

export interface FindingGroup {
  findingType: string;
  meta: FindingGroupMeta;
  items: ReconciliationFinding[];
}

// Only the finding types actually confirmed by the audit to belong to the
// "תרומות" world (cardcom + donations areas) get bespoke copy. Anything
// else falls back to defaultGroupMeta() below -- never silently dropped,
// just less polished until it's actually seen in production and given its
// own entry here.
const FINDING_GROUP_META: Record<string, FindingGroupMeta> = {
  lookup_failed: {
    title: 'בדיקה מול חברת הסליקה',
    explanation: 'לא ניתן היה לוודא עדיין את מצב התשלום של תרומות אלה.',
    actionLabel: 'הצג תרומות',
    pluralSubjectLabel: 'תרומות',
    tone: 'urgent',
  },
  pending_donation_missing_low_profile_id: {
    title: 'נדרשת בדיקה ידנית',
    explanation: 'לא ניתן לבדוק אוטומטית את מצב התשלום של תרומות אלה.',
    actionLabel: 'הצג תרומות',
    pluralSubjectLabel: 'תרומות',
    tone: 'urgent',
  },
  campaign_aggregate_mismatch: {
    title: 'נתוני קמפיינים אינם מעודכנים',
    explanation: 'התרומות עצמן תקינות; נתוני התצוגה בקמפיין אינם תואמים לנתוני התרומות.',
    actionLabel: 'הצג קמפיינים',
    pluralSubjectLabel: 'קמפיינים',
    tone: 'neutral',
  },
  gate_v1_mismatch: {
    title: 'תרומות שעוכבו לבדיקת אימות',
    explanation: 'התשלום נעצר לבדיקה ידנית בעקבות אי-התאמה מול תשובת חברת הסליקה.',
    actionLabel: 'הצג תרומות',
    pluralSubjectLabel: 'תרומות',
    tone: 'urgent',
  },
};

function defaultGroupMeta(findingType: string, subjectType: string): FindingGroupMeta {
  return {
    title: sharedFindingTypeLabel(findingType),
    explanation: 'ממצא הדורש בדיקה.',
    actionLabel: 'הצג פרטים',
    pluralSubjectLabel: subjectType === 'donation' ? 'תרומות' : subjectType === 'campaign' ? 'קמפיינים' : subjectType,
    tone: 'urgent',
  };
}

// Full classification order (used internally for sorting actionableItems --
// commission/jobs items are still computed here, just surfaced on the
// Billing Ops page's own "דורש טיפול" section instead of this page's UI).
const AREA_ORDER: AreaKey[] = ['cardcom', 'donations', 'commission', 'jobs'];

// What THIS page actually renders as tiles/actionable groups -- donations
// world only, per the 2026-09-14 IA simplification (commission-area health
// moved to the "חיובי עמותות" page, see platform-billing-ops-page.component.ts).
const VISIBLE_AREA_ORDER: AreaKey[] = ['cardcom', 'donations'];

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

  // Template-facing tile/list order (donations world only). Internal
  // classification (actionableItems' sort, itemsForArea for any area
  // including 'commission'/'jobs') is untouched -- see AREA_ORDER above.
  readonly areaOrder = VISIBLE_AREA_ORDER;

  loading = true;
  error: string | null = null;

  health: HealthResponse | null = null;
  findings: ReconciliationFinding[] = [];
  showResolved = false;
  // Renamed from showTechnical (2026-09-14q) -- scope narrowed to jobs +
  // webhooks + the raw findings log only. Findings that need operator
  // action no longer live in this shared toggle at all; they're grouped
  // in "דורש טיפול" and drilled into via a focused per-group drawer instead.
  showTechnicalTools = false;

  // Which finding-group's drawer is open, keyed by finding_type -- at most
  // one at a time, same pattern as the billing-setup drawer elsewhere in
  // Platform Admin.
  groupDrawerFindingType: string | null = null;
  // Per-finding "פרטים טכניים" disclosure inside the open drawer (raw
  // ids/JSON/provider error) -- collapsed by default, one at a time.
  expandedFindingTechnicalId: number | null = null;

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

  toggleTechnicalTools(): void {
    this.showTechnicalTools = !this.showTechnicalTools;
  }

  jobLabel(name: string): string {
    return sharedJobLabel(name);
  }

  jobFrequency(name: string): string {
    return sharedJobFrequency(name);
  }

  findingTypeLabel(type: string): string {
    return sharedFindingTypeLabel(type);
  }

  webhookTypeLabel(type: string): string {
    return sharedWebhookTypeLabel(type);
  }

  jobArea(jobName: string): 'donations' | 'commission' {
    return sharedJobArea(jobName);
  }

  // Same area rule actionableItems already applies inline -- exposed as a
  // method so the "מידע טכני" Findings list can filter to this page's
  // world (cardcom + donations) without duplicating the rule.
  findingArea(finding: ReconciliationFinding): AreaKey {
    return CARDCOM_FINDING_TYPES.has(finding.finding_type) ? 'cardcom' : this.jobArea(finding.job_name);
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
      } else if (alert.type === 'scheduler_not_running') {
        items.push({
          id: 'alert-scheduler-not-running',
          area: 'jobs',
          severity: 'critical',
          title: 'לוח ההרצה האוטומטי (Render Cron) לא פעיל',
          subtitle: this.fmtStaleness(alert.minutesSinceLastHeartbeat ?? null),
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

  get overallOk(): boolean {
    return this.areaOrder.every((a) => this.areaStatus(a) === 'ok');
  }

  // Scoped to the areas this page actually renders (areaOrder) -- a
  // commission-area problem must not turn the donations hero red when it
  // isn't even listed below; it surfaces on the Billing Ops page instead.
  private get visibleActionableItems(): ActionableItem[] {
    return this.actionableItems.filter((i) => (this.areaOrder as AreaKey[]).includes(i.area));
  }

  get overallCriticalCount(): number {
    return this.visibleActionableItems.filter((i) => i.severity === 'critical').length;
  }

  get overallWarningCount(): number {
    return this.visibleActionableItems.filter((i) => i.severity === 'warning').length;
  }

  // ---- "דורש טיפול" grouping (2026-09-14q) -------------------------------
  //
  // Splits visibleActionableItems (unchanged) into the two shapes the new
  // template actually renders: finding-backed items become grouped cards
  // (one card per finding_type, opening a drawer with every individual
  // subject); everything else (today: only webhook_recovery_unresolved --
  // job_failed/job_stale/scheduler_not_running were never in areaOrder to
  // begin with, unchanged from before this pass) stays a single small card
  // pointing at כלים טכניים, exactly like revealTechnical already did.
  get findingGroups(): FindingGroup[] {
    const byType = new Map<string, ReconciliationFinding[]>();
    for (const item of this.visibleActionableItems) {
      if (item.findingId == null) continue;
      const finding = this.findings.find((f) => f.id === item.findingId);
      if (!finding) continue;
      const list = byType.get(finding.finding_type) ?? [];
      list.push(finding);
      byType.set(finding.finding_type, list);
    }
    const groups: FindingGroup[] = [];
    for (const [findingType, items] of byType) {
      const meta = FINDING_GROUP_META[findingType] ?? defaultGroupMeta(findingType, items[0].subject_type);
      groups.push({ findingType, meta, items });
    }
    return groups.sort((a, b) => {
      if (a.meta.tone !== b.meta.tone) return a.meta.tone === 'urgent' ? -1 : 1;
      return b.items.length - a.items.length;
    });
  }

  get alertActionableItems(): ActionableItem[] {
    return this.visibleActionableItems.filter((i) => i.findingId == null);
  }

  get openGroup(): FindingGroup | null {
    if (!this.groupDrawerFindingType) return null;
    return this.findingGroups.find((g) => g.findingType === this.groupDrawerFindingType) ?? null;
  }

  openGroupDrawer(findingType: string): void {
    this.groupDrawerFindingType = findingType;
    this.expandedFindingTechnicalId = null;
  }

  closeGroupDrawer(): void {
    this.groupDrawerFindingType = null;
    this.expandedFindingTechnicalId = null;
  }

  toggleFindingTechnical(findingId: number): void {
    this.expandedFindingTechnicalId = this.expandedFindingTechnicalId === findingId ? null : findingId;
  }

  groupDotClass(group: FindingGroup): string {
    if (group.meta.tone === 'neutral') return 'ops-severity-info';
    return group.items.some((f) => f.severity === 'critical') ? 'ops-severity-critical' : 'ops-severity-warning';
  }

  // Best-effort human context from details already returned by the
  // existing API -- never invents a value; returns null (rendered as
  // nothing) when the underlying job never recorded that field. Today only
  // campaign_aggregate_mismatch's own details (currentAmount/actualAmount)
  // carry anything usable here -- lookup_failed/pending_donation_missing_
  // low_profile_id/gate_v1_mismatch only ever record an error string/notes/
  // reasons, no donor or campaign name (checked directly against every
  // recordFinding() call in src/jobs/ during the audit).
  findingContextLine(finding: ReconciliationFinding): string | null {
    if (finding.finding_type === 'campaign_aggregate_mismatch') {
      const details = finding.details as Record<string, unknown>;
      const current = details['currentAmount'];
      const actual = details['actualAmount'];
      if (current != null && actual != null) return `מוצג: ₪${current} · בפועל: ₪${actual}`;
    }
    return null;
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

  // Jumps from an alert-backed "דורש טיפול" card into כלים טכניים and
  // expands the relevant job's run history (2026-09-14q: narrowed to jobs
  // only -- finding-backed items now open their own group drawer instead
  // of scrolling into a shared technical section; the finding-jump branch
  // this method used to have has no caller left, since findings no longer
  // render inside כלים טכניים at all).
  revealTechnical(item: ActionableItem): void {
    this.showTechnicalTools = true;
    if (!item.jobName || !this.health?.knownJobs.includes(item.jobName)) return;
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
    const elId = `tech-job-${item.jobName}`;
    if (typeof document === 'undefined') return;
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
