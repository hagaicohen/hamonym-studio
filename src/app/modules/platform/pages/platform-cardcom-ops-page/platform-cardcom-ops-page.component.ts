import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { AdminDetailsDrawerComponent } from '../../components/admin-details-drawer/admin-details-drawer.component';
import { israelDate, shekels } from '../../utils/admin-display';
import { firstValueFrom, Subscription } from 'rxjs';
import { FinanceOpsService, PaymentException, PaymentExceptionAction } from '../../services/finance-ops.service';
import { EntityComboboxComponent } from '../../components/entity-combobox/entity-combobox.component';
import { CollectionOpsService } from '../../services/collection-ops.service';

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

interface AdminExceptionRow {
  key: string; type: string; title: string; entityName: string; entityId: string | null;
  amount: number | null; date: string; severity: string; resolved: boolean;
  finding?: ReconciliationFinding; payment?: PaymentException;
  collectionActionable?: boolean;
}

const DONATION_STATUS_LABELS: Record<string, string> = {
  paid: 'שולם',
  pending: 'ממתין',
  failed: 'נכשל',
};

@Component({
  selector: 'app-platform-cardcom-ops-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ColumnPickerComponent, RouterLink, AdminDetailsDrawerComponent, EntityComboboxComponent],
  templateUrl: './platform-cardcom-ops-page.component.html',
  styleUrl: './platform-cardcom-ops-page.component.css',
})
export class PlatformCardcomOpsPageComponent implements OnInit, OnDestroy {
  private cardcomOps = inject(CardcomOpsService);
  private http = inject(HttpClient);
  private platformService = inject(PlatformService);
  private route = inject(ActivatedRoute);
  private financeOps = inject(FinanceOpsService);
  private collectionOps = inject(CollectionOpsService);
  private financialAttentionReady = false;
  private financialAttentionIds = new Set<string>();
  centerStatus: 'open' | 'resolved' = 'open';
  centerSearch = '';
  centerSeverity = '';
  centerType = '';
  centerDateFrom = '';
  centerDateTo = '';
  centerLoading = false;
  centerError: string | null = null;
  centerFindings: ReconciliationFinding[] = [];
  centerPayments: PaymentException[] = [];
  centerSelected: AdminExceptionRow | null = null;
  centerActions: PaymentExceptionAction[] = [];
  centerActionsError: string | null = null;
  private centerRequestId = 0;
  loadExceptionCenter(): void {
    const requestId = ++this.centerRequestId;
    this.centerLoading = true; this.centerError = null; this.financialAttentionReady = false;
    let remaining = 3;
    const done = () => { if (requestId === this.centerRequestId && --remaining === 0) this.centerLoading = false; };
    const fail = () => { if (requestId !== this.centerRequestId) return; this.centerError = 'חלק מנתוני מרכז הטיפול לא נטענו. יש לנסות שוב.'; done(); };
    this.cardcomOps.getFindings(this.centerStatus === 'resolved', 200).subscribe({ next: res => { if (requestId !== this.centerRequestId) return; this.centerFindings = res.findings; done(); }, error: fail });
    this.financeOps.listExceptions().subscribe({ next: res => { if (requestId !== this.centerRequestId) return; this.centerPayments = res.exceptions; done(); }, error: fail });
    this.collectionOps.getNeedsAttention().subscribe({ next: res => {
      if (requestId !== this.centerRequestId) return;
      if (!Array.isArray(res.categories)) { fail(); return; }
      this.financialAttentionIds = new Set(res.categories.filter(group => group.category === 'card_attempts_exhausted').flatMap(group => group.items.map(item => item.statementId)));
      this.financialAttentionReady = true; done();
    }, error: fail });
  }
  get centerRows(): AdminExceptionRow[] {
    const rows: AdminExceptionRow[] = this.centerFindings.map(finding => ({
      key: `finding:${finding.id}`, type: finding.finding_type, title: this.findingTypeLabel(finding.finding_type),
      entityName: typeof finding.details?.['entityName'] === 'string' ? finding.details['entityName'] : typeof finding.details?.['entity_name'] === 'string' ? finding.details['entity_name'] : 'פרטי הישות זמינים בפירוט',
      entityId: typeof finding.details?.['entityId'] === 'string' ? finding.details['entityId'] : null,
      amount: typeof finding.details?.['amount'] === 'number' ? finding.details['amount'] : null,
      date: finding.found_at, severity: finding.severity, resolved: !!finding.resolved_at, finding,
      collectionActionable: finding.finding_type === 'fin11_card_attempts_exhausted' && this.financialAttentionReady && finding.subject_type === 'statement' ? this.financialAttentionIds.has(finding.subject_id) : undefined,
    }));
    for (const payment of this.centerPayments) rows.push({ key: `payment:${payment.id}`, type: 'payment_exception', title: 'חריגה בגביית עמלת פלטפורמה', entityName: payment.entity_name, entityId: payment.entity_id, amount: Number(payment.overpayment_amount), date: payment.detected_at, severity: payment.hold_new_collection ? 'critical' : 'warning', resolved: payment.status === 'resolved', payment });
    const seen = new Set<string>();
    return rows.filter(row => { if (seen.has(row.key)) return false; seen.add(row.key); return true; });
  }
  get centerTypes(): { key: string; label: string }[] { return Array.from(new Map(this.centerRows.map(row => [row.type, { key: row.type, label: row.title }])).values()); }
  get filteredCenterRows(): AdminExceptionRow[] {
    const search = this.centerSearch.trim().toLocaleLowerCase('he');
    const weight: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return this.centerRows.filter(row => (row.resolved || row.collectionActionable === false) === (this.centerStatus === 'resolved') && (!this.centerSeverity || row.severity === this.centerSeverity) && (!this.centerType || row.type === this.centerType) && (!search || `${row.title} ${row.entityName}`.toLocaleLowerCase('he').includes(search)) && (!this.centerDateFrom || this.centerDateKey(row.date) >= this.centerDateFrom) && (!this.centerDateTo || this.centerDateKey(row.date) <= this.centerDateTo))
      .sort((a, b) => (weight[a.severity] ?? 3) - (weight[b.severity] ?? 3) || Date.parse(b.date) - Date.parse(a.date));
  }
  private centerDateKey(value: string): string { const date = israelDate(value); return date === '—' ? '' : date.slice(6, 10) + '-' + date.slice(3, 5) + '-' + date.slice(0, 2); }
  clearCenterFilters(): void { this.centerSearch = ''; this.centerSeverity = ''; this.centerType = ''; this.centerDateFrom = ''; this.centerDateTo = ''; }
  openCenterException(row: AdminExceptionRow): void {
    this.centerSelected = row; this.centerActions = []; this.centerActionsError = null;
    if (row.finding) this.loadSubjectContext(row.finding);
    if (row.payment) this.financeOps.getExceptionActions(row.payment.id).subscribe({
      next: res => { if (this.centerSelected?.key === row.key) this.centerActions = res.actions; },
      error: () => { if (this.centerSelected?.key === row.key) this.centerActionsError = 'לא ניתן לטעון את היסטוריית הטיפול.'; },
    });
  }
  centerStatementId(row: AdminExceptionRow): string | null {
    if (row.payment) return row.payment.statement_id;
    if (row.finding?.subject_type === 'statement') return row.finding.subject_id;
    const value = row.finding?.details?.['statementId']; return typeof value === 'string' ? value : null;
  }
  severityLabel(value: string): string { return ({ critical: 'דחוף', warning: 'דורש בדיקה', info: 'לידיעה' } as Record<string, string>)[value] || 'דורש בדיקה'; }
  selectedDonation: PlatformDonation | null = null;
  receiptId: string | null = null;
  donationDetailLoading = false;
  donationDetailError: string | null = null;
  exportBusy = false;
  donationsEntityId: string | undefined;
  advancedDonationDataAvailable = false;
  donationsDateFrom = '';
  donationsDateTo = '';
  donationsRecurring = '';
  donationsPaymentMethod = '';
  private serverDonationSummary: { paidAmount: number; paidCount: number; failedCount: number } | null = null;
  private donationExtraFilters() { return { dateFrom: this.donationsDateFrom || undefined, dateTo: this.donationsDateTo || undefined, recurring: this.donationsRecurring || undefined, paymentMethod: this.donationsPaymentMethod || undefined }; }
  donationPaymentLabel(donation: PlatformDonation): string {
    return ({ card: 'אשראי', bank_transfer: 'העברה בנקאית', cash: 'מזומן', check: 'המחאה', other: 'אחר' } as Record<string, string>)[donation.payment_method || ''] || 'לא זמין';
  }
  donationEntityOptions: { id: string; name: string }[] = [];
  donationCampaignOptions: { id: string; name: string }[] = [];
  donationOptionsError: string | null = null;
  private entityOptionsRequest?: Subscription;
  private campaignOptionsRequest?: Subscription;
  loadDonationFilterOptions(): void {
    this.donationOptionsError = null;
    this.entityOptionsRequest?.unsubscribe(); this.campaignOptionsRequest?.unsubscribe();
    this.entityOptionsRequest = this.platformService.getOrganizationFilterOptions().subscribe({ next: options => { this.donationEntityOptions = options; }, error: () => { this.donationOptionsError = 'לא ניתן לטעון חלק מרשימות הסינון.'; } });
    this.campaignOptionsRequest = this.platformService.getCampaignFilterOptions().subscribe({ next: options => { this.donationCampaignOptions = options; }, error: () => { this.donationOptionsError = 'לא ניתן לטעון חלק מרשימות הסינון.'; } });
  }
  private donationsRequest?: Subscription;
  private donationDetailRequest?: Subscription;
  private donationsRequestId = 0;
  money = shekels;
  get hasDonationFilters(): boolean { return !!(this.donationsSearch.trim() || this.donationsStatus || this.donationsPeriod || this.donationsCampaignId || this.donationsEntityId || this.donationsDateFrom || this.donationsDateTo || this.donationsRecurring || this.donationsPaymentMethod); }
  get donationSummary(): { paidAmount: number; paidCount: number; failedCount: number } | null {
    if (this.donationsError || this.donationsLoading || this.donationsRefreshing) return null;
    if (this.serverDonationSummary) return this.serverDonationSummary;
    if (this.donations.length !== this.donationsTotal) return null;
    return this.donations.reduce((summary, donation) => {
      if (donation.status === 'paid') { summary.paidAmount += Number(donation.amount); summary.paidCount++; }
      if (donation.status === 'failed') summary.failedCount++;
      return summary;
    }, { paidAmount: 0, paidCount: 0, failedCount: 0 });
  }
  clearDonationFilters(): void { this.donationsSearch = ''; this.donationsStatus = ''; this.donationsEntityId = undefined; this.donationsDateFrom = ''; this.donationsDateTo = ''; this.donationsRecurring = ''; this.donationsPaymentMethod = ''; this.clearDashboardScope(); }
  ngOnDestroy(): void { clearTimeout(this.donationsSearchTimer); this.donationsRequestId++; this.centerRequestId++; this.donationsRequest?.unsubscribe(); this.donationDetailRequest?.unsubscribe(); this.entityOptionsRequest?.unsubscribe(); this.campaignOptionsRequest?.unsubscribe(); }
  openDonation(donation: PlatformDonation): void {
    this.donationDetailRequest?.unsubscribe(); this.selectedDonation = donation; this.receiptId = null; this.donationDetailError = null; this.donationDetailLoading = true;
    if (donation.status === 'failed') {
      this.donationDetailRequest = this.http.get<{ status: string; receipt_id?: string | null; failure_diagnostic?: PlatformDonation['failure_diagnostic'] }>(`${environment.apiUrl}/api/platform/cardcom-ops/donations/${encodeURIComponent(donation.id)}`).subscribe({
        next: data => {
          if (this.selectedDonation?.id !== donation.id) return;
          this.selectedDonation = { ...donation, status: data.status, failure_reason: null, failure_diagnostic: data.failure_diagnostic ?? null };
          this.receiptId = data.receipt_id || null; this.donationDetailLoading = false;
        },
        error: () => { if (this.selectedDonation?.id !== donation.id) return; this.donationDetailError = 'לא ניתן לטעון את פרטי האבחון.'; this.donationDetailLoading = false; },
      });
      return;
    }
    if (Object.hasOwn(donation, 'receipt_id')) { this.receiptId = donation.receipt_id || null; this.donationDetailLoading = false; return; }
    this.donationDetailRequest = this.http.get<{ receipt_id?: string | null }>(`${environment.apiUrl}/api/donations/public/${encodeURIComponent(donation.id)}`).subscribe({
      next: data => { if (this.selectedDonation?.id !== donation.id) return; this.receiptId = data?.receipt_id || null; this.donationDetailLoading = false; },
      error: () => { if (this.selectedDonation?.id !== donation.id) return; this.donationDetailError = 'לא ניתן לטעון את פרטי הקבלה.'; this.donationDetailLoading = false; },
    });
  }
  closeDonation(): void { this.donationDetailRequest?.unsubscribe(); this.selectedDonation = null; }
  failureExplanation(donation: PlatformDonation): string {
    const diagnostic = donation.failure_diagnostic;
    if (diagnostic?.providerCode === 605) return 'ספק הסליקה דחה את הבקשה משום שמשתמש ה־API חסום (605).';
    if (diagnostic?.providerCode === 8500) return 'ספק הסליקה לא הצליח להכין הרשאת תשלום לתרומה המחזורית (8500).';
    if (diagnostic?.reason === 'provider_connection_failed') return 'אירעה תקלה בתקשורת עם ספק הסליקה בעת הכנת התשלום.';
    return 'סיבת הכישלון אינה ידועה';
  }
  async exportDonationsCsv(): Promise<void> {
    if (this.exportBusy || this.donationsLoading || this.donationsRefreshing || !this.donationsTotal) return;
    this.exportBusy = true;
    const requestId = this.donationsRequestId;
    const query = { search: this.donationsSearch || undefined, status: this.donationsStatus || undefined, period: this.donationsPeriod || undefined, campaignId: this.donationsCampaignId, entityId: this.donationsEntityId, sortBy: this.donationsSortField, sortDir: this.donationsSortDir, ...this.donationExtraFilters() };
    try {
      const rows: PlatformDonation[] = []; const seen = new Set<string>(); let page = 0;
      while (rows.length < this.donationsTotal) {
        const res = await firstValueFrom(this.cardcomOps.listDonations({ ...query, page, limit: 25 }));
        if (requestId !== this.donationsRequestId || res.total !== this.donationsTotal || !res.donations.length) throw new Error('List changed');
        if ((query.dateFrom || query.dateTo || query.recurring || query.paymentMethod) && res.adminListVersion !== 1) throw new Error('Incompatible Backend');
        for (const row of res.donations) { if (seen.has(row.id)) throw new Error('List changed'); seen.add(row.id); rows.push(row); }
        page++;
      }
      if (rows.length !== this.donationsTotal) throw new Error('List changed');
      const escape = (value: unknown) => { let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
      const data = [['מועד', 'תורם', 'עמותה', 'קמפיין', 'סכום', 'סוג', 'סטטוס'], ...rows.map(d => [this.fmtDateTime(d.created_at), d.is_anonymous ? 'אנונימי' : d.donor_name, d.entity_name, d.campaign_title, d.amount, d.is_recurring ? 'חודשית' : 'חד־פעמית', this.donationStatusLabel(d.status)])];
      const url = URL.createObjectURL(new Blob(['\uFEFF' + data.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'תרומות.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { this.donationsError = 'ייצוא התרומות לא הושלם. רענן את הרשימה ונסה שוב.'; }
    finally { this.exportBusy = false; }
  }

  private donationContextCache = new Map<string, DonationContext | 'loading' | 'error'>();
  private campaignContextCache = new Map<string, CampaignContext | 'loading' | 'error'>();

  readonly areaOrder = VISIBLE_AREA_ORDER;
  readonly resolutionLabels = RESOLUTION_LABELS;

  loading = true;
  error: string | null = null;
  actionError: string | null = null;

  health: HealthResponse | null = null;
  findings: ReconciliationFinding[] = [];
  findingsError: string | null = null;
  reloadAlerts(): void { this.loadAll(); }

  // ---- Donations browser (2026-09-15s) -----------------------------------
  donations: PlatformDonation[] = [];
  donationsLoading = true;
  // Set instead of `loading` once rows are already on screen (2026-09-16
  // loading-state audit/fix) -- search/filter/sort/pagination must never
  // blank the table while a new page is in flight; same loading/refreshing
  // convention already proven on platform-organizations-page.
  donationsRefreshing = false;
  donationsError: string | null = null;
  donationsTotal = 0;
  donationsPage = 0;
  donationsLimit = 25;
  donationsSearch = '';
  donationsStatus = '';
  donationsPeriod = '';
  donationsCampaignId: string | undefined;
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
    this.loadDonationFilterOptions();
    const params = this.route.snapshot.queryParamMap;
    const status = params.get('status');
    if (status && ['paid', 'pending', 'failed'].includes(status)) this.donationsStatus = status;
    const period = params.get('period');
    if (period === 'this_month_israel') this.donationsPeriod = period;
    const campaignId = params.get('campaignId');
    if (campaignId && /^[0-9a-f-]{36}$/i.test(campaignId)) this.donationsCampaignId = campaignId;
    const entityId = params.get('entityId');
    if (entityId && /^[0-9a-f-]{36}$/i.test(entityId)) this.donationsEntityId = entityId;
    this.showAnomalies = this.route.snapshot.fragment === 'anomalies';
    if (this.showAnomalies) this.loadExceptionCenter();
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
    this.findingsError = null;
    this.cardcomOps.getFindings(false).subscribe({
      next: (res) => { this.findings = res.findings; },
      error: () => { this.findingsError = 'לא ניתן לטעון את התראות התרומות.'; },
    });
  }

  loadDonations(): void {
    clearTimeout(this.donationsSearchTimer); this.donationsRequest?.unsubscribe();
    const requestId = ++this.donationsRequestId;
    if (this.donationsDateFrom && this.donationsDateTo && this.donationsDateFrom > this.donationsDateTo) { this.donationsError = 'תאריך ההתחלה חייב להיות מוקדם מתאריך הסיום.'; this.donationsLoading = false; this.donationsRefreshing = false; return; }
    if (this.donations.length === 0) this.donationsLoading = true;
    else this.donationsRefreshing = true;
    this.donationsError = null;
    this.donationsRequest = this.cardcomOps
      .listDonations({
        search: this.donationsSearch || undefined,
        status: this.donationsStatus || undefined,
        period: this.donationsPeriod || undefined,
        campaignId: this.donationsCampaignId,
        entityId: this.donationsEntityId,
        ...this.donationExtraFilters(),
        sortBy: this.donationsSortField,
        sortDir: this.donationsSortDir,
        page: this.donationsPage,
        limit: this.donationsLimit,
      })
      .subscribe({
        next: (res) => {
          if (requestId !== this.donationsRequestId) return;
          if ((this.donationsDateFrom || this.donationsDateTo || this.donationsRecurring || this.donationsPaymentMethod) && res.adminListVersion !== 1) { this.donationsError = 'נדרשת גרסת שרת תואמת לסינון שנבחר.'; this.donationsLoading = false; this.donationsRefreshing = false; return; }
          this.advancedDonationDataAvailable = res.adminListVersion === 1;
          const summary = res.summary;
          this.serverDonationSummary = summary && [summary.paidAmount, summary.paidCount, summary.failedCount].every(Number.isFinite) && summary.paidCount >= 0 && summary.failedCount >= 0 && summary.paidCount + summary.failedCount <= res.total ? summary : null;
          this.donations = res.donations;
          this.donationsTotal = res.total;
          this.donationsLoading = false;
          this.donationsRefreshing = false;
        },
        error: () => {
          if (requestId !== this.donationsRequestId) return;
          this.donationsError = 'שגיאה בטעינת התרומות';
          this.donationsLoading = false;
          this.donationsRefreshing = false;
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

  clearDashboardScope(): void {
    this.donationsPeriod = '';
    this.donationsCampaignId = undefined;
    this.onDonationsSearch();
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
    const labels: Record<string, string> = { fin11_card_attempts_exhausted: 'ניסיונות הגבייה האוטומטיים מוצו', missing_masav_mandate: 'חסר אישור לחיוב במס״ב' };
    const label = labels[type] || sharedFindingTypeLabel(type);
    return label === type ? 'ממצא המחייב בדיקה' : label;
  }

  jobArea(jobName: string): 'donations' | 'commission' {
    if (jobName === 'fin11-card-collection' || jobName === 'fin11-card-retry-sweep') return 'commission';
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
    if (this.showAnomalies) this.loadExceptionCenter();
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
        next: (c) => this.campaignContextCache.set(finding.subject_id, { title: c.campaign?.title, entity_name: c.campaign?.entity_name }),
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

  fmtDateTime(iso: string | null): string { return israelDate(iso, true); }
  fmtDate(iso: string | null): string { return israelDate(iso); }

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
