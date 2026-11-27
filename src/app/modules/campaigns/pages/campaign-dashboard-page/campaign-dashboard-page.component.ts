import { Component, DestroyRef, OnInit, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { Subscription } from 'rxjs';
import { AnalyticsRangeService } from '../../../../core/services/analytics-range.service';
import { DateRangePickerComponent, shiftCivilDate } from '../../../../shared/components/date-range-picker/date-range-picker.component';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { CampaignWorkspaceContextService } from '../../services/campaign-workspace-context.service';
import { CampaignDraft } from '../../services/campaign-studio-state.service';
import { CampaignDashboardKpisComponent } from './sections/campaign-dashboard-kpis/campaign-dashboard-kpis.component';
import { CampaignDashboardAttentionComponent } from './sections/campaign-dashboard-attention/campaign-dashboard-attention.component';
import { CampaignDashboardManagementComponent } from './sections/campaign-dashboard-management/campaign-dashboard-management.component';

import { CampaignApiService } from '../../services/campaign-api.service';
import { AmbassadorService } from '../../services/ambassador.service';
import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';

interface RecentTransaction {
  id: string;
  donor_name: string | null;
  is_anonymous: boolean;
  status: string;
  created_at: string;
  amount: number;
  currency?: string;
}

@Component({
  selector: 'app-campaign-dashboard-page',
  standalone: true,
  imports: [
    DateRangePickerComponent,
    CommonModule,
    RouterLink,
    HmIconComponent,
    CampaignDashboardKpisComponent,
    CampaignDashboardAttentionComponent,
    CampaignDashboardManagementComponent,
  ],
  templateUrl: './campaign-dashboard-page.component.html',
  styleUrl: './campaign-dashboard-page.component.css',
})
export class CampaignDashboardPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private readonly range = inject(AnalyticsRangeService);
  private activity?: Subscription;
  activeAmbassadors: number | null = null;
  activeRewards: number | null = null;
  private readonly campaignApi = inject(CampaignApiService);
  hasSelectedRange = false;
  trendTotal = 0;
  readonly axisSteps = [1, 0.75, 0.5, 0.25, 0];
  private readonly ambassadors = inject(AmbassadorService);
  periodTotal: number | null = null;
  unconvertedPaidCount = 0;
  readonly monthLabels = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
  trendMaximum = 0;

  constructor() {
    effect(() => {
      const { from, to } = this.range.activeRange();
      const draft = this.ctx.draft();
      if (draft?.id === this.campaignId && draft) this.loadActivity(draft, from, to);
    });
  }
  private http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  recentTransactions: RecentTransaction[] = [];
  confirmedTransactions: number | null = null;
  identifiedDonors: number | null = null;
  recentError = false;
  recentLoading = true;
  trendLoading = true;
  trendError = false;
  trendYear: number | null = null;
  trend: { month: number; total: number; height: number }[] = [];
  readonly transactionStatuses: Record<string, string> = {
    paid: 'אושרה', pending: 'ממתינה', failed: 'נכשלה',
  };
  private loader = inject(AppLoaderService);
  private ctx = inject(CampaignWorkspaceContextService);

  campaignId = this.route.snapshot.paramMap.get('id') ?? '';
  draft: CampaignDraft | null = null;
  loading = true;
  loadError = '';

  private loadActivity(draft: CampaignDraft, from: string, to: string): void {
    if (!draft.entityId) { this.recentLoading = false; return; }
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    this.activity?.unsubscribe();
    this.recentLoading = true;
    this.recentError = false;
    this.periodTotal = null;
    this.unconvertedPaidCount = 0;
    this.confirmedTransactions = null;
    this.identifiedDonors = null;
    this.hasSelectedRange = Boolean(from && to);
    let params = new HttpParams().set('campaignId', this.campaignId).set('limit', '5');
    if (from && to) params = params.set('fromDate', from).set('toDate', shiftCivilDate(to, -1));
    this.activity = this.http.get<{ donations: RecentTransaction[]; kpi: { paidCount: number; totalRaised: number; identifiedDonorCount?: number; unconvertedPaidCount?: number } }>(
      `${environment.apiUrl}/api/donations/entity/${draft.entityId}`, { headers, params },
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        this.recentLoading = false;
        this.recentTransactions = response.donations;
        this.confirmedTransactions = response.kpi.paidCount;
        this.unconvertedPaidCount = response.kpi.unconvertedPaidCount ?? 0;
        this.periodTotal = this.unconvertedPaidCount && this.unconvertedPaidCount === response.kpi.paidCount
          ? null : response.kpi.totalRaised;
        this.identifiedDonors = response.kpi.identifiedDonorCount ?? null;
      },
      error: () => { this.recentError = true; this.recentLoading = false; },
    });
  }

  private loadTrend(draft: CampaignDraft): void {
    if (!draft.entityId) { this.trendLoading = false; return; }
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    const params = new HttpParams().set('campaignId', this.campaignId);
    this.http.get<{ yearOverYear: { thisYear: number; thisYearSeries: number[] } }>(
      `${environment.apiUrl}/api/reports/entity/${draft.entityId}/trends`, { headers, params },
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ yearOverYear }) => {
        const [year, month] = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit',
        }).format(new Date()).split('-').map(Number);
        this.trendYear = yearOverYear.thisYear;
        const values = yearOverYear.thisYear === year
          ? yearOverYear.thisYearSeries.slice(0, month)
          : yearOverYear.thisYearSeries;
        const max = Math.max(0, ...values);
        const increment = max > 0 ? 10 ** Math.floor(Math.log10(max / 4)) : 1;
        this.trendMaximum = Math.ceil(max / (4 * increment)) * 4 * increment;
        this.trendTotal = values.reduce((sum, amount) => sum + amount, 0);
        this.trend = max > 0 ? values.map((total, index) => ({
          month: index + 1, total, height: Math.max(0, total / this.trendMaximum * 100),
        })) : [];
        this.trendLoading = false;
      },
      error: () => { this.trendError = true; this.trendLoading = false; },
    });
  }

  ngOnInit(): void {
    this.loader.hide();
    if (!this.campaignId) {
      this.loading = false;
      this.loadError = 'לא נמצא קמפיין';
      return;
    }
    this.ctx.ensureLoaded(this.campaignId).subscribe({
      next: draft => {
        this.draft = draft;
        this.loading = false;
        this.loadTrend(draft);
        if (!draft.offeringsEnabled) {
          this.activeRewards = 0;
        } else if (draft.entityId) {
          this.campaignApi.getRewardClaims(draft.entityId, this.campaignId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: claims => {
              this.activeRewards = draft.offerings.filter(reward =>
                reward.stock === null || reward.stock > (claims.get(String(reward.id)) ?? 0)).length;
            },
            error: () => { this.activeRewards = null; },
          });
        }
        this.ambassadors.list(this.campaignId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: list => { this.activeAmbassadors = list.filter(item => item.status === 'active').length; },
          error: () => { this.activeAmbassadors = null; },
        });
      },
      error: () => { this.loadError = 'שגיאה בטעינת הקמפיין'; this.loading = false; },
    });
  }
}
