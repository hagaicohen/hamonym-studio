import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import {
  CardcomOpsService,
  HealthResponse,
  ReconciliationFinding,
  PlatformDonation,
} from '../../services/cardcom-ops.service';
import { PlatformService } from '../../services/platform.service';
import {
  jobLabel as sharedJobLabel,
  findingTypeLabel as sharedFindingTypeLabel,
  jobArea as sharedJobArea,
  PROVIDER_FINDING_TYPES,
} from '../../utils/ops-labels';
import { environment } from '../../../../../environments/environment';
import { ColumnPickerComponent, ColumnDef } from '../../components/column-picker/column-picker.component';

// תאריך is the anchor column (always shown, not in this list) -- same
// convention as platform-organizations-page's own COLUMNS (שם העמותה is
// the one always-visible identifying column there too).
const DONATIONS_COLUMNS: ColumnDef[] = [
  { key: 'donor',    label: 'תורם' },
  { key: 'entity',   label: 'עמותה' },
  { key: 'campaign', label: 'קמפיין' },
  { key: 'amount',   label: 'סכום' },
  { key: 'type',     label: 'סוג' },
  { key: 'status',   label: 'סטטוס' },
];

type DonationsSortField = 'date' | 'donor' | 'entity' | 'campaign' | 'amount' | 'type' | 'status';

// "תרومות" (2026-09-15 product decision, built from two same-day read-only
// audits): the normal operator screen is now primarily a cross-entity
// donations browser -- an operator finds/identifies a real donation here,
// the way they browse עמותות/קמפיינים/משתמשים. System anomalies (jobs/
// findings) are demoted to one compact, honestly-labeled secondary
// indicator: the audit established that NONE of the four known finding
// types currently has an operator-executable resolution step through
// Hamonym (no manual mark-paid workflow exists anywhere in the product --
// see donations.service.js, markDonationPaid is never routed to a human).
// "דורש טיפול"/"סמן כנבדק" implied an operator workflow that doesn't
// exist; removed from the normal view for that reason, not because the
// underlying detection/resolve capability was judged unnecessary -- see
// this file's own header history for the fuller "כלים טכניים" version
// this replaces (git blame), and cardcom-ops.controller.js/routes.js for
// the unchanged backend endpoints those controls used to call.
const CARDCOM_FINDING_TYPES = PROVIDER_FINDING_TYPES;

export type AreaKey = 'cardcom' | 'donations' | 'commission' | 'jobs';
export type AreaStatus = 'ok' | 'warning' | 'critical';

// Honest classification replacing "דורש טיפול" (2026-09-15s) -- each value
// is a factual claim about what happens next, established directly by the
// read-only workflow audit, never implying a resolution the operator can
// actually perform today:
//   auto-retry   -- the underlying job itself retries on its own schedule;
//                    normally nothing for a human to do.
//   engineering  -- resolving requires DB/code-level investigation with no
//                    UI path today (recompute, manual CardCom lookup by an
//                    engineer, etc.).
//   needs-review -- financially meaningful and a human SHOULD look at it,
//                    but Hamonym has no safe resolution workflow yet either
//                    -- still honestly labeled, not hidden.
export type ResolutionKind = 'auto-retry' | 'engineering' | 'needs-review';

export const RESOLUTION_LABELS: Record<ResolutionKind, string> = {
  'auto-retry': 'המערכת מנסה שוב אוטומטית',
  engineering: 'דורש בדיקה טכנית',
  'needs-review': 'אי-התאמה הדורשת בדיקה',
};

// Findings are grouped by finding_type for DISPLAY only -- recordFinding's
// own dedup key is (job_name, finding_type, subject_type, subject_id), so
// every open finding genuinely IS a distinct donation/campaign; grouping
// must never hide that a group of "4" really is 4 separate subjects, each
// still individually shown (read-only) in the group's drawer.
export interface FindingGroupMeta {
  title: string;
  explanation: string;
  // Singular, shown under each individual item in the drawer -- distinct
  // from `explanation` (plural, shown once at the drawer header) because
  // Hebrew grammar doesn't let one string serve both without sounding
  // wrong. Wording deliberately never implies the donation itself failed --
  // lookup_failed only means Hamonym could not verify its state with the
  // provider, not that the charge failed.
  itemExplanation: string;
  pluralSubjectLabel: string;
  resolutionKind: ResolutionKind;
}

export interface FindingGroup {
  findingType: string;
  meta: FindingGroupMeta;
  items: ReconciliationFinding[];
}

// Only the finding types actually confirmed by the two audits to belong to
// the "תרומות" world (cardcom + donations areas) get bespoke copy. Anything
// else falls back to defaultGroupMeta() below -- never silently dropped,
// just less polished until it's actually seen in production.
const FINDING_GROUP_META: Record<string, FindingGroupMeta> = {
  lookup_failed: {
    title: 'בדיקה מול חברת הסליקה',
    explanation: 'לא ניתן היה לוודא עדיין את מצב התשלום של תרומות אלה.',
    itemExplanation: 'לא הצלחנו לוודא את מצב התשלום מול חברת הסליקה.',
    pluralSubjectLabel: 'תרומות',
    resolutionKind: 'auto-retry',
  },
  pending_donation_missing_low_profile_id: {
    title: 'תרומות ללא מזהה לבדיקה',
    explanation: 'לא ניתן לבדוק אוטומטית את מצב התשלום של תרומות אלה.',
    itemExplanation: 'לא ניתן לבדוק אוטומטית את מצב התשלום של התרומה הזו.',
    pluralSubjectLabel: 'תרומות',
    resolutionKind: 'engineering',
  },
  campaign_aggregate_mismatch: {
    title: 'נתוני קמפיינים אינם מעודכנים',
    explanation: 'התרומות עצמן תקינות; נתוני התצוגה בקמפיין אינם תואמים לנתוני התרומות.',
    itemExplanation: 'התרומות בקמפיין הזה תקינות; נתוני התצוגה (סכום/תומכים) אינם מעודכנים.',
    pluralSubjectLabel: 'קמפיינים',
    resolutionKind: 'engineering',
  },
  gate_v1_mismatch: {
    title: 'תרומות שעוכבו לבדיקת אימות',
    explanation: 'התשלום נעצר לבדיקה בעקבות אי-התאמה מול תשובת חברת הסליקה.',
    itemExplanation: 'התשלום נעצר לבדיקה בעקבות אי-התאמה מול תשובת חברת הסליקה.',
    pluralSubjectLabel: 'תרומות',
    resolutionKind: 'needs-review',
  },
};

function defaultGroupMeta(findingType: string, subjectType: string): FindingGroupMeta {
  return {
    title: sharedFindingTypeLabel(findingType),
    explanation: 'ממצא מערכתי הדורש בדיקה.',
    itemExplanation: 'ממצא מערכתי הדורש בדיקה.',
    pluralSubjectLabel: subjectType === 'donation' ? 'תרומות' : subjectType === 'campaign' ? 'קמפיינים' : subjectType,
    resolutionKind: 'engineering',
  };
}

// Human context for a donation-subject finding, fetched from the existing
// public donation-confirmation endpoint -- no new backend code for this.
// Deliberately excludes donor_name even though the endpoint returns it:
// it's a public, unauthenticated route, not part of Platform Admin's own
// authenticated flow, so this stays out of scope here. Separate from (and
// unrelated to) the new donations-browser endpoint below, which DOES show
// donor_name because it's a genuinely authenticated, requireSuperAdmin flow.
interface DonationContext {
  amount: number | string;
  created_at: string;
  campaign_title: string;
  entity_name: string;
}

interface CampaignContext {
  title: string;
  entity_name: string;
}

const AREA_ORDER: AreaKey[] = ['cardcom', 'donations', 'commission', 'jobs'];
const VISIBLE_AREA_ORDER: AreaKey[] = ['cardcom', 'donations'];
const RESOLUTION_ORDER: ResolutionKind[] = ['needs-review', 'engineering', 'auto-retry'];

export interface ActionableItem {
  id: string;
  area: AreaKey;
  severity: 'critical' | 'warning';
  title: string;
  subtitle: string;
  jobName?: string;
  findingId?: number;
}

const DONATION_STATUS_LABELS: Record<string, string> = {
  paid: 'שולם',
  pending: 'ממתין',
  failed: 'נכשל',
};

@Component({
  selector: 'app-platform-cardcom-ops-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ColumnPickerComponent],
  templateUrl: './platform-cardcom-ops-page.component.html',
  styleUrl: './platform-cardcom-ops-page.component.css',
})
export class PlatformCardcomOpsPageComponent implements OnInit {
  private cardcomOps = inject(CardcomOpsService);
  private http = inject(HttpClient);
  private platformService = inject(PlatformService);

  private donationContextCache = new Map<string, DonationContext | 'loading' | 'error'>();
  private campaignContextCache = new Map<string, CampaignContext | 'loading' | 'error'>();

  readonly areaOrder = VISIBLE_AREA_ORDER;
  readonly resolutionLabels = RESOLUTION_LABELS;

  loading = true;
  error: string | null = null;
  actionError: string | null = null;

  health: HealthResponse | null = null;
  findings: ReconciliationFinding[] = [];

  // ---- Donations browser (2026-09-15s) -----------------------------------
  donations: PlatformDonation[] = [];
  donationsLoading = true;
  donationsError: string | null = null;
  donationsTotal = 0;
  donationsPage = 0;
  donationsLimit = 25;
  donationsSearch = '';
  donationsStatus = '';
  private donationsSearchTimer: ReturnType<typeof setTimeout> | undefined;

  readonly donationsColumns = DONATIONS_COLUMNS;
  visibleDonationsColumns = new Set(DONATIONS_COLUMNS.map((c) => c.key));
  donationsSortField: DonationsSortField = 'date';
  donationsSortDir: 'asc' | 'desc' = 'desc';

  get donationsTotalPages(): number {
    return Math.max(1, Math.ceil(this.donationsTotal / this.donationsLimit));
  }

  // System anomalies -- collapsed by default, revealed only on request.
  showAnomalies = false;
  groupDrawerFindingType: string | null = null;

  ngOnInit(): void {
    this.loadAll();
    this.loadDonations();
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
    this.cardcomOps.getFindings(false).subscribe({
      next: (res) => { this.findings = res.findings; },
      error: () => { /* the compact anomaly indicator failing quietly is acceptable -- the donations browser is the primary content */ },
    });
  }

  loadDonations(): void {
    this.donationsLoading = true;
    this.donationsError = null;
    this.cardcomOps
      .listDonations({
        search: this.donationsSearch || undefined,
        status: this.donationsStatus || undefined,
        sortBy: this.donationsSortField,
        sortDir: this.donationsSortDir,
        page: this.donationsPage,
        limit: this.donationsLimit,
      })
      .subscribe({
        next: (res) => {
          this.donations = res.donations;
          this.donationsTotal = res.total;
          this.donationsLoading = false;
        },
        error: () => {
          this.donationsError = 'שגיאה בטעינת התרומות';
          this.donationsLoading = false;
        },
      });
  }

  // Live, debounced search -- the same interaction language as every other
  // Platform Admin list (platform-organizations-page's own onSearch()):
  // an input with no separate "search" button. A standalone button here
  // read as an orphaned control (2026-09-16 report) since it wasn't
  // adjacent to anything and every sibling screen already searches as you
  // type -- removing it, rather than repositioning it, is what actually
  // makes the page match the rest of Platform Admin.
  onDonationsSearchInput(): void {
    clearTimeout(this.donationsSearchTimer);
    this.donationsSearchTimer = setTimeout(() => this.onDonationsSearch(), 400);
  }

  onDonationsSearch(): void {
    clearTimeout(this.donationsSearchTimer);
    this.donationsPage = 0;
    this.loadDonations();
  }

  onDonationsStatusChange(): void {
    this.donationsPage = 0;
    this.loadDonations();
  }

  onVisibleDonationsColumnsChange(visible: Set<string>): void {
    this.visibleDonationsColumns = visible;
  }

  // Same toggle-direction-on-repeat-click convention as
  // platform-organizations-page's own sortBy().
  sortDonationsBy(field: DonationsSortField): void {
    if (this.donationsSortField === field) {
      this.donationsSortDir = this.donationsSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.donationsSortField = field;
      this.donationsSortDir = 'asc';
    }
    this.donationsPage = 0;
    this.loadDonations();
  }

  prevDonationsPage(): void {
    if (this.donationsPage > 0) { this.donationsPage--; this.loadDonations(); }
  }

  nextDonationsPage(): void {
    if (this.donationsPage < this.donationsTotalPages - 1) { this.donationsPage++; this.loadDonations(); }
  }

  donationStatusLabel(status: string): string {
    return DONATION_STATUS_LABELS[status] ?? status;
  }

  donationsSortIndicator(field: DonationsSortField): string {
    if (this.donationsSortField !== field) return '';
    return this.donationsSortDir === 'asc' ? ' ▲' : ' ▼';
  }

  jobLabel(name: string): string {
    return sharedJobLabel(name);
  }

  findingTypeLabel(type: string): string {
    return sharedFindingTypeLabel(type);
  }

  jobArea(jobName: string): 'donations' | 'commission' {
    return sharedJobArea(jobName);
  }

  findingArea(finding: ReconciliationFinding): AreaKey {
    return CARDCOM_FINDING_TYPES.has(finding.finding_type) ? 'cardcom' : this.jobArea(finding.job_name);
  }

  lastRunFor(jobName: string) {
    return this.health?.jobs.find((j) => j.job_name === jobName) ?? null;
  }

  // ---- Underlying classification engine (unchanged logic, 2026-09-07/14) --
  // Kept exactly as-is: still the single source of truth for "what's open
  // and how severe", still covers all 4 areas (commission/jobs items are
  // computed but never rendered by THIS page's template -- commission
  // surfaces on the Billing Ops page instead, jobs never had a template
  // presence even before this pass). Only the TEMPLATE built on top of this
  // changed in the 2026-09-15s pass; every getter below is still directly
  // covered by this file's own original IA-redesign spec.
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

  private get visibleActionableItems(): ActionableItem[] {
    return this.actionableItems.filter((i) => (this.areaOrder as AreaKey[]).includes(i.area));
  }

  get overallCriticalCount(): number {
    return this.visibleActionableItems.filter((i) => i.severity === 'critical').length;
  }

  get overallWarningCount(): number {
    return this.visibleActionableItems.filter((i) => i.severity === 'warning').length;
  }

  // ---- System anomalies (2026-09-15s: demoted to a secondary, honestly-
  // labeled indicator -- replaces the 2026-09-14q/r "דורש טיפול" grouping
  // presentation with the SAME grouping mechanism underneath) -------------
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
      const kindDiff = RESOLUTION_ORDER.indexOf(a.meta.resolutionKind) - RESOLUTION_ORDER.indexOf(b.meta.resolutionKind);
      if (kindDiff !== 0) return kindDiff;
      return b.items.length - a.items.length;
    });
  }

  get alertActionableItems(): ActionableItem[] {
    return this.visibleActionableItems.filter((i) => i.findingId == null);
  }

  get totalAnomalyCount(): number {
    return this.findingGroups.reduce((sum, g) => sum + g.items.length, 0) + this.alertActionableItems.length;
  }

  toggleAnomalies(): void {
    this.showAnomalies = !this.showAnomalies;
  }

  get openGroup(): FindingGroup | null {
    if (!this.groupDrawerFindingType) return null;
    return this.findingGroups.find((g) => g.findingType === this.groupDrawerFindingType) ?? null;
  }

  openGroupDrawer(findingType: string): void {
    this.groupDrawerFindingType = findingType;
    const group = this.findingGroups.find((g) => g.findingType === findingType);
    if (!group) return;
    for (const finding of group.items) this.loadSubjectContext(finding);
  }

  closeGroupDrawer(): void {
    this.groupDrawerFindingType = null;
  }

  private loadSubjectContext(finding: ReconciliationFinding): void {
    if (finding.subject_type === 'donation') {
      if (this.donationContextCache.has(finding.subject_id)) return;
      this.donationContextCache.set(finding.subject_id, 'loading');
      this.http.get<DonationContext>(`${environment.apiUrl}/api/donations/public/${finding.subject_id}`).subscribe({
        next: (d) => this.donationContextCache.set(finding.subject_id, d),
        error: () => this.donationContextCache.set(finding.subject_id, 'error'),
      });
    } else if (finding.subject_type === 'campaign') {
      if (this.campaignContextCache.has(finding.subject_id)) return;
      this.campaignContextCache.set(finding.subject_id, 'loading');
      this.platformService.getCampaign(finding.subject_id).subscribe({
        next: (c) => this.campaignContextCache.set(finding.subject_id, { title: c.title, entity_name: c.entity_name }),
        error: () => this.campaignContextCache.set(finding.subject_id, 'error'),
      });
    }
  }

  donationContextFor(finding: ReconciliationFinding): DonationContext | null {
    const v = this.donationContextCache.get(finding.subject_id);
    return v && v !== 'loading' && v !== 'error' ? v : null;
  }

  donationContextLoading(finding: ReconciliationFinding): boolean {
    return this.donationContextCache.get(finding.subject_id) === 'loading';
  }

  campaignContextFor(finding: ReconciliationFinding): CampaignContext | null {
    const v = this.campaignContextCache.get(finding.subject_id);
    return v && v !== 'loading' && v !== 'error' ? v : null;
  }

  campaignContextLoading(finding: ReconciliationFinding): boolean {
    return this.campaignContextCache.get(finding.subject_id) === 'loading';
  }

  // Best-effort human context from details already returned by the
  // existing API -- never invents a value. Today only campaign_aggregate_
  // mismatch's own details (currentAmount/actualAmount) carry anything
  // usable here.
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

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Human elapsed-time phrasing for a job_stale alert -- still used inside
  // actionableItems() even though job cards no longer render anywhere;
  // the alert item itself remains part of the underlying classification.
  fmtStaleness(minutes: number | null): string {
    if (minutes == null) return 'מעולם לא רץ בהצלחה';
    const days = Math.floor(minutes / (60 * 24));
    if (days >= 1) return `לא רץ בהצלחה כבר ${days} ${days === 1 ? 'יום' : 'ימים'}`;
    const hours = Math.floor(minutes / 60);
    if (hours >= 1) return `לא רץ בהצלחה כבר ${hours} ${hours === 1 ? 'שעה' : 'שעות'}`;
    return `לא רץ בהצלחה כבר ${minutes} דקות`;
  }
}
