import { DropdownComponent, DropdownOptionComponent } from '../../../../shared/ui/dropdown/dropdown.component';
import { ManagementPaginationComponent } from '../../../../shared/components/management-pagination/management-pagination.component';
import { Component, Input, OnInit, OnDestroy, inject, effect, untracked } from '@angular/core';
import { RewardResponsibilityNoticeComponent } from '../../../campaigns/shared/components/reward-responsibility-notice/reward-responsibility-notice.component';
import { DateRangePickerComponent, shiftCivilDate } from '../../../../shared/components/date-range-picker/date-range-picker.component';
import { AnalyticsRangeService } from '../../../../core/services/analytics-range.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { CampaignWorkspaceContextService } from '../../../campaigns/services/campaign-workspace-context.service';
import { CampaignDashboardFinanceComponent } from '../../../campaigns/pages/campaign-dashboard-page/sections/campaign-dashboard-finance/campaign-dashboard-finance.component';
import { CampaignApiService } from '../../../campaigns/services/campaign-api.service';

import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';
import { formatMoney } from '../../../campaigns/utils/donation-currency';
// Background auto-refresh (2026-09-27) — same interval-polling pattern
// already used by notification-bell.component.ts. Without this, a donation
// that transitions pending -> paid server-side (e.g. Checkout V2's OpenFields
// path, whose backend confirmation can lag a few seconds behind the charge)
// stayed visually "ממתין" here until a manager manually changed a filter/
// page/sort -- load() itself already has a silent-refresh mode (see its own
// `refreshing` flag, used whenever donations are already loaded), this just
// needed something to actually call it periodically.
const AUTO_REFRESH_MS = 20000;

interface Kpi {
  totalRaised:  number;
  unconvertedPaidCount?: number;
  paidCount:    number;
  failedCount:  number;
  pendingCount: number;
  avgAmount:    number;
  total:        number;
}

interface Campaign { id: string; title: string; }

interface Donation {
  rewards?: Array<{id?:string;title:string;minimumAmount?:number}>;
  id:             string;
  amount:         number;
  // Multi-currency (2026-11): amount is in `currency`; amount_ils is its ILS
  // equivalent at the Bank of Israel representative rate (null while the
  // rate is still pending). Not the amount actually settled to the account.
  source?: string | null;
  is_recurring?: boolean;
  receipt_id?: string | null;
  currency?:      'ILS' | 'USD' | 'EUR';
  amount_ils?:    number | null;
  fx_status?:     'not_required' | 'pending' | 'resolved';
  donor_name:     string;
  donor_email:    string;
  donor_phone:    string;
  status:         string;
  completed_at:   string | null;
  created_at:     string;
  is_anonymous:   boolean;
  failure_reason: string | null;
  is_mock:        boolean;
  campaign_title: string;
  campaign_slug:  string;
  campaign_id?: string;
  ambassador_id?: string | null;
  ambassador_name?: string | null;
  note?: string | null;
}

type Period = 'month' | 'last_month' | 'quarter' | 'all';
type SortField = 'donor' | 'campaign' | 'amount' | 'date' | 'status';
type SortDir = 'asc' | 'desc';
type ColumnKey = 'ambassador' | 'campaign' | 'date' | 'status';

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: 'campaign', label: 'קמפיין' },
  { key: 'date',     label: 'תאריך' },
  { key: 'status',   label: 'סטטוס' },
  { key: 'ambassador', label: 'שגריר' },
];
const COLUMNS_STORAGE_KEY = 'donations-hidden-columns';

@Component({
  selector: 'app-donations-page',
  standalone: true,
  imports: [DropdownComponent, DropdownOptionComponent, RouterLink, ManagementPaginationComponent, DateRangePickerComponent, CampaignDashboardFinanceComponent, RewardResponsibilityNoticeComponent, HmIconComponent, CommonModule, FormsModule],
  templateUrl: './donations-page.component.html',
  styleUrl: './donations-page.component.css',
})
export class DonationsPageComponent implements OnInit, OnDestroy {
  purchasedRewards(donation:Donation): Array<{id:string;title:string;quantity:number}> {
    const grouped=new Map<string,{id:string;title:string;quantity:number}>();
    for(const reward of donation.rewards || []){
      const id=reward.id || reward.title;
      const row=grouped.get(id);
      if(row)row.quantity++;else grouped.set(id,{id,title:reward.title,quantity:1});
    }
    return [...grouped.values()];
  }
  private http          = inject(HttpClient);
  private destroy$ = new Subject<void>();
  private currentEntity = inject(CurrentEntityService);
  private loader        = inject(AppLoaderService);
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);
  private campaignApi   = inject(CampaignApiService);

  // Two entry points: /campaigns/:id/donations (campaign-scoped — Workspace
  // sidebar's own route) and /donations?campaignId= (entity-wide, optionally
  // pre-filtered). See registrations-page.component.ts for the identical
  // pattern this was copied from.
  ambassadorName = '';
  unassignedAmbassador = false;
  ambassadorOptionsLoading = false;
  ambassadorOptionsError = false;
  ambassadorOptions: string[] = [];
  ambassadorOptionQuery = '';
  ambassadorOptionPage = 0;
  ambassadorMoreOptions = false;
  private ambassadorEntityId?: string;
  private ambassadorOptionsRequest?: Subscription;
  private ambassadorOptionsTimer?: ReturnType<typeof setTimeout>;
  onAmbassadorDropdown(open: boolean): void {
    if (open) {
      this.ambassadorOptionQuery = '';
      this.loadAmbassadorOptions(0);
    } else {
      this.closeAmbassadorOptions();
    }
  }

  private closeAmbassadorOptions(): void {
    clearTimeout(this.ambassadorOptionsTimer);
    this.ambassadorOptionsRequest?.unsubscribe();
  }

  searchAmbassadorOptions(query: string): void {
    this.ambassadorOptionQuery = query;
    clearTimeout(this.ambassadorOptionsTimer);
    this.ambassadorOptionsRequest?.unsubscribe();
    this.ambassadorOptions = [];
    this.ambassadorMoreOptions = false;
    this.ambassadorOptionsLoading = true;
    this.ambassadorOptionsTimer = setTimeout(() => this.loadAmbassadorOptions(0), 250);
  }

  loadAmbassadorOptions(page: number): void {
    const entityId = this.currentEntity.currentEntity()?.id;
    if (!entityId) return;
    const limit = 25;
    let params = new HttpParams().set('page', page).set('limit', limit).set('sortBy', 'name').set('sortDir', 'asc');
    if (this.campaignFilter) params = params.set('campaignId', this.campaignFilter);
    if (this.ambassadorOptionQuery.trim()) params = params.set('search', this.ambassadorOptionQuery.trim());
    this.ambassadorOptionsRequest?.unsubscribe();
    if (page === 0) this.ambassadorOptions = [];
    this.ambassadorOptionsLoading = true;
    this.ambassadorOptionsError = false;
    this.ambassadorMoreOptions = false;
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    this.ambassadorOptionsRequest = this.http.get<{ ambassadors: { full_name: string }[]; kpi: { totalAmbassadors: number } }>(
      `${environment.apiUrl}/api/entities/${entityId}/ambassadors`, { headers, params },
    ).subscribe({
      next: result => {
        this.ambassadorOptions = [...new Set([...this.ambassadorOptions, ...result.ambassadors.map(row => row.full_name).filter(Boolean)])];
        this.ambassadorOptionPage = page;
        this.ambassadorMoreOptions = (page + 1) * limit < result.kpi.totalAmbassadors;
        this.ambassadorOptionsLoading = false;
      },
      error: () => { this.ambassadorOptionsLoading = false; this.ambassadorOptionsError = true; },
    });
  }

  selectAmbassador(name: string | null): void {
    this.ambassadorName = name ?? '';
    this.unassignedAmbassador = name === null;
    this.closeAmbassadorOptions();
    this.onFilterChange();
  }
  receiptFilter: 'all' | 'issued' | 'missing' = 'all';
  currencyFilter: 'all' | 'ILS' | 'USD' | 'EUR' = 'all';
  @Input() purchasesOnly = false;
  campaignScoped = !!this.route.snapshot.paramMap.get('id');
  isOngoing = false;
  readonly workspaceDraft = inject(CampaignWorkspaceContextService).draft;
  readonly openManualOnEntry = this.campaignScoped && this.route.snapshot.queryParamMap.get('action') === 'manual';
  rewardPurchases = this.campaignScoped && this.route.snapshot.queryParamMap.get('purchases') === '1';
  private readonly dateRange = inject(AnalyticsRangeService);
  receiptLoading = false;
  receiptError = '';

  openReceipt(row: Donation): void {
    if (!row.receipt_id || this.receiptLoading) return;
    this.receiptLoading = true;
    this.receiptError = '';
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    this.http.get(`${environment.apiUrl}/api/donations/receipt/${row.receipt_id}/pdf`, {
      headers,
      responseType: 'blob',
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: blob => {
        this.receiptLoading = false;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'receipt.pdf';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => {
        this.receiptLoading = false;
        this.receiptError = 'הקבלה אינה זמינה להורדה';
      },
    });
  }


  get allPaidAmountsUnconverted(): boolean {
    return !!this.kpi.paidCount && this.kpi.unconvertedPaidCount === this.kpi.paidCount;
  }

  donations:  Donation[]  = [];
  campaigns:  Campaign[]  = [];
  kpi: Kpi = { totalRaised: 0, paidCount: 0, failedCount: 0, pendingCount: 0, avgAmount: 0, total: 0 };
  selected:   Donation | null = null;

  period:         Period = 'month';
  // Defaults to confirmed donations only (2026-09-27) — an audit of all
  // pending rows found 64/73 were abandoned/incomplete Checkout sessions
  // (CardCom itself never recorded a completed transaction for them), which
  // dominated this list and made it look like nearly every donation was
  // stuck. The KPI bar above still reflects every status regardless of this
  // filter (see getEntityDonations's own summaryWhereStr, unchanged) — a
  // manager can still switch to "כל הסטטוסים"/"ממתין" to see everything.
  statusFilter    = 'paid';
  campaignFilter  = '';
  searchQuery     = '';

  sortField: SortField = 'date';
  sortDir:   SortDir   = 'desc';

  page  = 0;
  limit = 25;
  loading    = false;
  refreshing = false;
  error: string | null = null;

  private searchTimer: any;

  get totalPages(): number { return Math.max(1, Math.ceil(this.kpi.total / this.limit)); }

  readonly columnDefs = COLUMN_DEFS;
  hiddenColumns = new Set<ColumnKey>();
  columnsMenuOpen = false;
  private lastLoadKey: string | null = null;

  campaignTitle: string | null = null;

  constructor() {
    // Deep-linked from a campaign's Workspace sidebar — show that campaign's
    // full history, not just "this month", since the point of the link is
    // "this campaign's donations", not a fresh default view.
    const campaignId = this.route.snapshot.paramMap.get('id') || this.route.snapshot.queryParamMap.get('campaignId');
    if (campaignId) {
      this.campaignFilter = campaignId;
      this.period = 'all';
      this.campaignApi.getById(campaignId).subscribe({
        next: (draft) => { this.campaignTitle = draft.title; this.isOngoing = draft.campaignLifecycle === 'ongoing'; },
        error: () => { this.campaignTitle = 'קמפיין זה'; },
      });
    }

    // Same "two spinners" fix as campaign-ambassadors-page/registrations-page
    // — forceHide() clears the global self-hiding loader immediately instead
    // of waiting out hide()'s 600ms minimum-visible window.
    if (this.campaignScoped) this.loader.forceHide();

    effect(() => {
      const id = this.currentEntity.currentEntity()?.id;
      const range = this.dateRange.activeRange();
      const key = id ? JSON.stringify([id, range.from, range.to]) : null;
      if (key === this.lastLoadKey) return;
      this.lastLoadKey = key;
      if (id !== this.ambassadorEntityId) {
        this.ambassadorEntityId = id;
        this.closeAmbassadorOptions();
        if (!this.campaignScoped) { this.ambassadorName = ''; this.unassignedAmbassador = false; }
      }
      if (id) untracked(() => this.onFilterChange());
    });
  }

  ngOnInit(): void {
    this.rewardPurchases ||= this.purchasesOnly;
    try {
      const saved = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (saved) this.hiddenColumns = new Set(JSON.parse(saved));
    } catch { /* ignore malformed storage */ }

    interval(AUTO_REFRESH_MS).pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.currentEntity.currentEntity()?.id) this.load();
    });
  }

  ngOnDestroy(): void {
    this.closeAmbassadorOptions();
    this.destroy$.next();
    this.destroy$.complete();
  }

  back(): void { this.router.navigate(['/campaigns', this.campaignFilter, 'dashboard']); }

  isColVisible(key: ColumnKey): boolean {
    return !this.hiddenColumns.has(key);
  }

  toggleColumn(key: ColumnKey): void {
    if (this.hiddenColumns.has(key)) this.hiddenColumns.delete(key);
    else this.hiddenColumns.add(key);
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...this.hiddenColumns]));
  }

  toggleColumnsMenu(): void { this.columnsMenuOpen = !this.columnsMenuOpen; }
  closeColumnsMenu(): void  { this.columnsMenuOpen = false; }

  setPeriod(p: Period): void {
    this.period = p;
    this.page   = 0;
    this.load();
  }

  onFilterChange(): void {
    this.page = 0;
    this.load();
  }

  sortBy(field: SortField): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir   = 'asc';
    }
    this.page = 0;
    this.load();
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page = 0; this.load(); }, 400);
  }

  prevPage(): void { if (this.page > 0) { this.page--; this.load(); } }
  nextPage(): void { if (this.page < this.totalPages - 1) { this.page++; this.load(); } }


  openDrawer(d: Donation): void  { this.selected = d; this.receiptError = ''; }
  closeDrawer(): void            { this.selected = null; }

  load(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) { this.error = 'לא נמצאה ישות'; return; }

    this.error = null;
    if (this.donations.length === 0) this.loading = true;
    else this.refreshing = true;
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });

    let params = new HttpParams()
      .set('page',    String(this.page))
      .set('limit',   String(this.limit))
      .set('period', 'all')
      .set('sortBy',  this.sortField)
      .set('sortDir', this.sortDir);

    {
      const { from, to } = this.dateRange.activeRange();
      if (from && to) params = params.set('fromDate', from).set('toDate', shiftCivilDate(to, -1));
    }
    if (this.rewardPurchases) params = params.set('rewardPurchases', '1');
    if (this.unassignedAmbassador) params = params.set('unassignedAmbassador', '1');
    else if (this.ambassadorName.trim()) params = params.set('ambassadorName', this.ambassadorName.trim());
    if ((!this.purchasesOnly || this.campaignScoped) && this.receiptFilter !== 'all') params = params.set('receipt', this.receiptFilter);
    if ((!this.purchasesOnly || this.campaignScoped) && this.currencyFilter !== 'all') params = params.set('currency', this.currencyFilter);
    if (this.statusFilter !== 'all') params = params.set('status', this.statusFilter);
    if (this.campaignFilter)         params = params.set('campaignId', this.campaignFilter);
    if (this.searchQuery.trim())     params = params.set('search', this.searchQuery.trim());

    this.http.get<any>(`${environment.apiUrl}/api/donations/entity/${entity.id}`, { headers, params })
      .subscribe({
        next: (res) => {
          this.donations  = res.donations ?? [];
          if(this.selected)this.selected=this.donations.find(d=>d.id===this.selected!.id) || this.selected;
          this.kpi        = res.kpi;
          this.campaigns  = res.campaigns ?? [];
          this.loading    = false;
          this.refreshing = false;
          this.loader.hide();
        },
        error: (err) => {
          console.error('donations load error', err.status, err.error);
          this.error      = err.error?.error || err.error?.message || `שגיאה בטעינה (${err.status})`;
          this.loading    = false;
          this.refreshing = false;
          this.loader.hide();
        },
      });
  }

  exporting = false;

  exportCsv(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) return;

    this.exporting = true;
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });

    let params = new HttpParams()
      .set('page',    '0')
      .set('limit',   '10000')
      .set('period', 'all')
      .set('sortBy',  this.sortField)
      .set('sortDir', this.sortDir);

    {
      const { from, to } = this.dateRange.activeRange();
      if (from && to) params = params.set('fromDate', from).set('toDate', shiftCivilDate(to, -1));
    }
    if (this.rewardPurchases) params = params.set('rewardPurchases', '1');
    if (this.unassignedAmbassador) params = params.set('unassignedAmbassador', '1');
    else if (this.ambassadorName.trim()) params = params.set('ambassadorName', this.ambassadorName.trim());
    if ((!this.purchasesOnly || this.campaignScoped) && this.receiptFilter !== 'all') params = params.set('receipt', this.receiptFilter);
    if ((!this.purchasesOnly || this.campaignScoped) && this.currencyFilter !== 'all') params = params.set('currency', this.currencyFilter);
    if (this.statusFilter !== 'all') params = params.set('status', this.statusFilter);
    if (this.campaignFilter)         params = params.set('campaignId', this.campaignFilter);
    if (this.searchQuery.trim())     params = params.set('search', this.searchQuery.trim());

    this.http.get<any>(`${environment.apiUrl}/api/donations/entity/${entity.id}`, { headers, params })
      .subscribe({
        next: (res) => {
          this.downloadCsv(res.donations ?? []);
          this.exporting = false;
        },
        error: (err) => {
          console.error('donations export error', err.status, err.error);
          this.exporting = false;
        },
      });
  }

  private downloadCsv(rows: Donation[]): void {
    // Original amount and currency, and separately the ILS equivalent at the
    // representative rate -- never presented as the settled amount.
    const headerRow = ['תורם', 'קמפיין', 'שגריר', 'סכום', 'מטבע', 'שווה ערך בש״ח (שער יציג)', 'תאריך', 'סטטוס'];
    const csvRows = rows.map(d => [
      this.donorDisplay(d),
      d.campaign_title,
      d.ambassador_name ?? '',
      d.amount,
      d.currency || 'ILS',
      this.campaignScoped
        ? (d.currency && d.currency !== 'ILS' ? (d.amount_ils ?? 'שער המרה חסר') : d.amount)
        : (d.fx_status === 'pending' ? 'ממתין לשער' : (d.amount_ils ?? d.amount)),
      this.fmtDate(d.completed_at ?? d.created_at),
      this.statusLabel(d.status),
    ]);

    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headerRow, ...csvRows].map(row => row.map(escape).join(',')).join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `תרומות-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  fmtMoney(n: number): string {
    return '₪' + Math.round(n).toLocaleString('he-IL');
  }

  // A donation's own amount: in its currency, with the ILS equivalent next to
  // a USD/EUR amount.
  donationKind(row: Donation): string {
    if (row.is_recurring) return 'חודשית';
    if (row.source && ['bank_transfer', 'check', 'cash', 'other'].includes(row.source)) return 'ידנית';
    return 'חד־פעמית';
  }

  fmtDonationAmount(d: Donation): string {
    if (!d.currency || d.currency === 'ILS') return this.fmtMoney(d.amount);
    const original = formatMoney(d.amount, d.currency);
    return d.amount_ils != null ? `${original} (≈ ${this.fmtMoney(d.amount_ils)})` : `${original} (שער בהמתנה)`;
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  fmtDateTime(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    const t = new Date(iso);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y} ${hh}:${mm}`;
  }

  statusLabel(s: string): string {
    return s === 'paid' ? 'שולם' : s === 'failed' ? 'נכשל' : 'ממתין';
  }

  donorDisplay(d: Donation): string {
    return d.is_anonymous ? 'אנונימי' : (d.donor_name || '—');
  }
}
