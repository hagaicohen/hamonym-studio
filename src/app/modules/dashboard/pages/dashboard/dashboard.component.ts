import {
  Component, OnInit, OnDestroy,
  ElementRef, ViewChild, inject, effect, untracked,
} from '@angular/core';
import { forkJoin } from 'rxjs';
import { OtherOrganizationsComponent } from './other-organizations.component';
import { OrganizationEntryService } from '../../../../core/services/organization-entry.service';
import { organizationNextAction } from '../../../../shared/utils/organization-next-action';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Chart, registerables } from 'chart.js';
import { environment } from '../../../../../environments/environment';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { EntitiesService } from '../../../../core/services/entities.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { AnalyticsRangeService } from '../../../../core/services/analytics-range.service';
import { OrganizationStatusCardComponent } from './organization-status-card.component';
import { DateRangePickerComponent } from '../../../../shared/components/date-range-picker/date-range-picker.component';
import { LucideAngularModule } from 'lucide-angular';
import { campaignCreatePath, campaignEditPath } from '../../../campaigns/campaign-editor-route';

Chart.register(...registerables);

interface DashboardData {
  kpi: {
    fundraisingThisMonth: { total: number; pctChange: number | null };
    donationsThisMonth:   { count: number; pctChange: number | null };
    activeCampaigns:      { active: number; total: number };
    failedPayments:       { count: number; totalLost: number };
  };
  recentDonations: Array<{
    id: string; amount: number; donor_name: string;
    completed_at: string; campaign_title: string;
  }>;
  failedPayments: Array<{
    id: string; amount: number; donor_name: string;
    updated_at: string; campaign_title: string;
  }>;
  topAmbassadors: Array<{
    id: string; full_name: string;
    campaign_title: string; raised_total: number; goal_amount?: number;
  }>;
  chartData: Array<{ day: string; total: number }>;
  alerts: Array<{ type: string; title: string; description: string; ref_id: string | null; severity?: 'critical' | 'warning' | 'info' }>;
  campaigns: Array<{
    id: string; title: string; status: string; slug: string;
    cover_image_url: string | null;
    current_amount: number; target_amount: number;
    supporters_count: number; created_at?: string;
    end_date: string | null; funding_type: string;
  }>;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, OrganizationStatusCardComponent, DateRangePickerComponent, OtherOrganizationsComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css', './organization-card-heading.css', '../../../../shared/styles/new-campaign-button.css'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly createCampaignPath = campaignCreatePath();
  chartCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartCanvas') set canvas(value: ElementRef<HTMLCanvasElement> | undefined) {
    this.chartCanvas = value;
    if (value && this.data) this.buildChart(this.data.chartData);
    else { this.chart?.destroy(); this.chart = null; }
  }

  private entry = inject(OrganizationEntryService);
  private requestVersion = 0;
  private http            = inject(HttpClient);
  currentEntity           = inject(CurrentEntityService);
  readonly ctx            = inject(CurrentContextService);
  readonly analyticsRange = inject(AnalyticsRangeService);
  private entitiesService = inject(EntitiesService);
  private router          = inject(Router);
  private loader          = inject(AppLoaderService);

  data: DashboardData | null = null;
  error: string | null = null;

  userName       = '';
  userInitials   = '';
  userPhoto      = '';
  entityName     = '';
  entityInitials = '';
  entityLogoUrl  = '';

  private chart: Chart | null = null;
  private lastLoadedKey: string | null = null;

  constructor() {
    // currentEntity() is coarse-grained — it changes reference on every
    // setEntity() call, including the "refresh" call inside loadDashboard()
    // itself. Guard on the actual id+range so switching entities (topbar)
    // or the date range (picker) reloads the dashboard, without looping on
    // the internal entity refresh.
    effect(() => {
      const id = this.currentEntity.currentEntity()?.id ?? null;
      const range = this.analyticsRange.activeRange();
      const key = `${id}_${range.from}_${range.to}`;
      if (key === this.lastLoadedKey) return;
      this.lastLoadedKey = key;
      untracked(() => this.loadDashboard());
    });
  }

  ngOnInit(): void {
    // Load user greeting
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      const full: string = u.full_name || u.name || '';
      this.userName = full;
      this.userPhoto = u.picture || '';
      const parts = full.trim().split(' ').filter(Boolean);
      this.userInitials = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : (parts[0]?.[0] ?? '?').toUpperCase();
    } catch { this.userName = ''; this.userInitials = '?'; this.userPhoto = ''; }
  }

  private loadDashboard(): void {
    const version = ++this.requestVersion;
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) { this.error = 'לא נמצאה ישות'; this.loader.hide(); return; }

    const eName: string = entity.display_name || '';
    this.entityName = eName;
    const eWords = eName.trim().split(' ').filter(Boolean);
    this.entityInitials = eWords.length >= 2
      ? (eWords[0][0] + eWords[1][0]).toUpperCase()
      : (eWords[0]?.[0] ?? '').toUpperCase();

    const raw: string = entity.logo_url || '';
    this.entityLogoUrl = raw
      ? (raw.startsWith('http') || raw.startsWith('data:') ? raw : `${environment.apiUrl}${raw}`)
      : '';


    this.data = null;
    this.error = null;
    this.loader.show();

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    const range = this.analyticsRange.activeRange();
    const params = new HttpParams().set('from', range.from).set('to', range.to);

    forkJoin({
      entity: this.entitiesService.getEntityById(entity.id),
      dashboard: this.http.get<DashboardData>(`${environment.apiUrl}/api/entities/${entity.id}/dashboard`, { headers, params }),
    }).subscribe({
      next: ({ entity: fresh, dashboard: res }) => {
        if (version !== this.requestVersion || this.ctx.active()?.context?.id !== entity.id) return;
        this.currentEntity.setEntity(fresh);
        this.entityName = fresh.display_name || '';
        const raw = fresh.logo_url || '';
        this.entityLogoUrl = raw && !raw.startsWith('http') && !raw.startsWith('data:') ? `${environment.apiUrl}${raw}` : raw;
        this.data = res;
        this.alertPage = 0;
        this.loader.hide();
        const entering = this.entry.consume(entity.id);
        if (entering && this.nextAction.createFirstCampaign) {
          this.router.navigate(['/campaigns'], { replaceUrl: true });
        }
        if (this.chartCanvas) this.buildChart(res.chartData);
      },
      error: (err) => {
        if (version !== this.requestVersion || this.ctx.active()?.context?.id !== entity.id) return;
        this.entry.consume(entity.id);
        this.error = err.error?.error || 'לא ניתן לטעון את נתוני העמותה. יש לנסות לרענן.';
        this.loader.hide();
      },
    });
  }

  get nextAction() {
    return organizationNextAction(this.currentEntity.currentEntity(), this.data?.kpi.activeCampaigns.total ?? -1);
  }
  get noCampaigns(): boolean { return this.data?.kpi.activeCampaigns.total === 0; }
  ngOnDestroy(): void { ++this.requestVersion; this.chart?.destroy(); }

  private buildChart(rows: DashboardData['chartData']): void {
    if (!this.chartCanvas?.nativeElement) {
      return;
    }
    if (this.chart) { this.chart.destroy(); this.chart = null; }

    const map = new Map(rows.map(r => [r.day, r.total]));
    const labels: string[] = [];
    const values: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      labels.push(`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth() + 1).padStart(2,'0')}`);
      values.push(map.get(key) ?? 0);
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, 'rgba(88, 60, 214, 0.25)');
    grad.addColorStop(1, 'rgba(88, 60, 214, 0.00)');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          fill: true,
          backgroundColor: grad,
          borderColor: '#583cd6',
          borderWidth: 3,
          pointBackgroundColor: '#583cd6',
          pointHoverRadius: 6,
          pointRadius: 3,
          tension: 0.35,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            position: 'right',
            beginAtZero: true,
            grid: { color: '#f1f5f9' },
            ticks: { font: { size: 11 }, callback: v => {
              const n = Number(v);
              if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
              if (n >= 1_000)     return `₪${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
              return `₪${n}`;
            }},
          },
        },
      },
    });
  }

  get displayAmbassadors()     { return this.data?.topAmbassadors ?? []; }
  get displayDonations()       { return this.data?.recentDonations ?? []; }
  get displayFailedPayments()  { return this.data?.failedPayments ?? []; }
  get displayFailedTotal(): number {
    return this.data?.kpi?.failedPayments?.totalLost ?? 0;
  }

  failureReason(f: any): string { return f.reason ?? 'כרטיס סירב'; }

  alertPage = 0;
  readonly alertsPerPage = 3;

  get alertTotalPages(): number {
    return Math.ceil(this.allAlerts.length / this.alertsPerPage);
  }

  get pagedAlerts(): DashboardData['alerts'] {
    const start = this.alertPage * this.alertsPerPage;
    return this.allAlerts.slice(start, start + this.alertsPerPage);
  }

  alertPrev(): void {
    if (this.alertPage > 0) this.alertPage--;
  }

  alertNext(): void {
    if (this.alertPage < this.alertTotalPages - 1) this.alertPage++;
  }

  get alertPageIndices(): number[] {
    return Array.from({ length: this.alertTotalPages }, (_, i) => i);
  }

  get allAlerts(): DashboardData['alerts'] {
    // Organization guidance is presented once above; keep operational alerts.
    const covered = ['entity_pending', 'missing_cardcom', 'missing_tax_doc', 'missing_association_cert'];
    return (this.data?.alerts ?? []).filter(alert => !covered.includes(alert.type) && !(this.noCampaigns && alert.type === 'no_active_campaigns'));
  }

  alertSeverity(a: DashboardData['alerts'][0]): 'critical' | 'warning' | 'info' {
    return a.severity ?? 'warning';
  }

  /* ── helpers ── */
  fmt(n: number): string {
    return `₪${Math.round(n).toLocaleString('he-IL')}`;
  }

  pct(n: number | null): string {
    if (n == null) return '';
    return n >= 0 ? `↑ לעומת חודש שעבר ${n}%` : `↓ לעומת חודש שעבר ${Math.abs(n)}%`;
  }

  pctAbs(n: number | null): string {
    return Math.abs(Math.round(n ?? 0)).toString();
  }

  pctIsUp(n: number | null): boolean {
    return (n ?? 0) >= 0;
  }

  timeAgo(iso: string): string {
    if (!iso) return '—';
    const ts = new Date(iso).getTime();
    if (!ts || ts < 1_000_000_000_000) return '—'; // לפני 2001 = דאטה פגום
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1)    return 'עכשיו';
    if (m < 60)   return `לפני ${m} דקות`;
    if (m < 1440) return `לפני ${Math.floor(m / 60)} שעות`;
    const d = Math.floor(m / 1440);
    if (d < 7)    return `לפני ${d} ימים`;
    return this.fmtDate(iso);
  }

  fmtDate(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  imgClass(i: number): string {
    return `img-${(i % 3) + 1}`;
  }

  alertTitle(a: DashboardData['alerts'][0]): string { return a.title; }

  alertDesc(a: DashboardData['alerts'][0]): string { return a.description; }

  alertBtn(a: DashboardData['alerts'][0]): string {
    switch (a.type) {
      case 'entity_pending':          return 'לפרופיל העמותה';
      case 'missing_cardcom':         return 'הגדר סליקה';
      case 'missing_tax_doc':         return 'העלה מסמך';
      case 'missing_association_cert':return 'העלה מסמך';
      case 'campaign_pending':        return 'צפה בקמפיין';
      case 'ending_soon':             return 'לקמפיין';
      case 'failed_payments':         return 'לפירוט';
      case 'no_active_campaigns':     return 'לקמפיינים';
      case 'goal_90pct':              return 'לקמפיין';
      case 'no_donations_14_days':    return 'לקמפיין';
      case 'draft_unpublished':       return 'המשך עריכה';
      default:                        return '';
    }
  }

  navigateAlert(a: DashboardData['alerts'][0]): void {
    const entityId = this.currentEntity.currentEntity()?.id;
    switch (a.type) {
      case 'entity_pending':
      case 'missing_cardcom':
      case 'missing_tax_doc':
      case 'missing_association_cert':
        this.router.navigate(['/settings/entities', entityId], { queryParams: { edit: 'true' } });
        break;
      case 'campaign_pending':
      case 'ending_soon':
      case 'goal_90pct':
      case 'no_donations_14_days':
        this.router.navigate(a.ref_id ? ['/campaigns', a.ref_id, 'view'] : ['/campaigns']);
        break;
      case 'failed_payments':
        document.getElementById('failed-payments-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case 'no_active_campaigns':
        this.router.navigate(['/campaigns']);
        break;
      case 'draft_unpublished':
        this.router.navigate(a.ref_id ? campaignEditPath(a.ref_id) : ['/campaigns']);
        break;
    }
  }

  scrollToAlerts(): void {
    document.getElementById('alerts-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ambPct(amb: { raised_total: number; goal_amount?: number }): string {
    if (!amb.goal_amount || amb.goal_amount === 0) return '';
    return `${this.ambProgressPct(amb)}% מהיעד`;
  }

  ambProgressPct(amb: { raised_total: number; goal_amount?: number }): number {
    if (!amb.goal_amount) return 0;
    return Math.round(amb.raised_total / amb.goal_amount * 100);
  }

  initials(name: string): string {
    return name.split(' ').slice(0,2).map(w => w[0] ?? '').join('');
  }

}
