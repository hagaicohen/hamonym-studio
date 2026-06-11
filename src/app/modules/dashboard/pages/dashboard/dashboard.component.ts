import {
  Component, OnInit, AfterViewInit,
  ElementRef, ViewChild, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Chart, registerables } from 'chart.js';
import { environment } from '../../../../../environments/environment';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { EntitiesService } from '../../../../core/services/entities.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

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
  }>;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private http            = inject(HttpClient);
  currentEntity           = inject(CurrentEntityService);
  private entitiesService = inject(EntitiesService);
  private router          = inject(Router);
  private loader          = inject(AppLoaderService);

  data: DashboardData | null = null;
  error: string | null = null;

  userName       = '';
  userInitials   = '';
  entityName     = '';
  entityInitials = '';
  entityLogoUrl  = '';

  private chart: Chart | null = null;
  private chartPending: DashboardData['chartData'] | null = null;
  private viewReady = false;

  ngOnInit(): void {
    // Load user greeting
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      const full: string = u.full_name || u.name || '';
      this.userName = full;
      const parts = full.trim().split(' ').filter(Boolean);
      this.userInitials = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : (parts[0]?.[0] ?? '?').toUpperCase();
    } catch { this.userName = ''; this.userInitials = '?'; }

    const eName: string = this.currentEntity.currentEntity()?.display_name || '';
    this.entityName = eName;
    const eWords = eName.trim().split(' ').filter(Boolean);
    this.entityInitials = eWords.length >= 2
      ? (eWords[0][0] + eWords[1][0]).toUpperCase()
      : (eWords[0]?.[0] ?? '').toUpperCase();

    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) { this.error = 'לא נמצאה ישות'; this.loader.hide(); return; }

    const raw: string = entity.logo_url || '';
    this.entityLogoUrl = raw
      ? (raw.startsWith('http') || raw.startsWith('data:') ? raw : `${environment.apiUrl}${raw}`)
      : '';

    // רענון entity — מעדכן את ה-signal כך שה-allAlerts getter יקבל נתונים עדכניים
    this.entitiesService.getEntityById(entity.id).subscribe({
      next: (fresh) => { this.currentEntity.setEntity(fresh); },
      error: () => {},
    });

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });

    this.http
      .get<DashboardData>(`${environment.apiUrl}/api/entities/${entity.id}/dashboard`, { headers })
      .subscribe({
        next: (res) => {
          this.data = res;
          this.loader.hide();
          if (this.viewReady) this.buildChart(res.chartData);
          else this.chartPending = res.chartData;
        },
        error: (err) => {
          this.error = err.error?.error || 'שגיאה בטעינה';
          this.loader.hide();
        },
      });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.chartPending) { this.buildChart(this.chartPending); this.chartPending = null; }
  }

  private buildChart(rows: DashboardData['chartData']): void {
    if (!this.chartCanvas) return;
    if (this.chart) { this.chart.destroy(); this.chart = null; }

    const map = new Map(rows.map(r => [r.day, r.total]));
    const labels: string[] = [];
    const values: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      labels.push(`${d.getDate()}.${d.getMonth() + 1}`);
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
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            position: 'right',
            beginAtZero: true,
            grid: { color: '#f1f5f9' },
            ticks: { font: { size: 11 }, callback: v => `₪${Number(v).toLocaleString('he-IL')}` },
          },
        },
      },
    });
  }

  /* ── fake data for design preview ── */
  readonly mockAmbassadors = [
    { id: '1', full_name: 'דוד לוי',        raised_total: 8200 },
    { id: '2', full_name: 'רותם גבאי',      raised_total: 6700 },
    { id: '3', full_name: 'מיכל כהן',       raised_total: 4300 },
    { id: '4', full_name: 'ישראל ישראלי',   raised_total: 3900 },
    { id: '5', full_name: 'יגל מרדכי',      raised_total: 2800 },
  ];

  readonly mockDonations = [
    { id: '1', amount: 180,   donor_name: 'ישראל ישראלי', campaign_title: 'מלגות תשפ"ה',        completed_at: new Date(Date.now() - 5   * 60000).toISOString() },
    { id: '2', amount: 500,   donor_name: 'רותם כהן',     campaign_title: 'סלי מזון למשפחות',  completed_at: new Date(Date.now() - 18  * 60000).toISOString() },
    { id: '3', amount: 250,   donor_name: 'אנונימי',       campaign_title: 'בית חם לנוער',       completed_at: new Date(Date.now() - 60  * 60000).toISOString() },
    { id: '4', amount: 1000,  donor_name: 'דוד לוי',       campaign_title: 'מלגות תשפ"ה',        completed_at: new Date(Date.now() - 2   * 3600000).toISOString() },
    { id: '5', amount: 120,   donor_name: 'מיכל שטרית',   campaign_title: 'סלי מזון למשפחות',  completed_at: new Date(Date.now() - 3   * 3600000).toISOString() },
  ];

  readonly mockFailedPayments = [
    { id: '1', amount: 180,  campaign_title: 'מלגות תשפ"ה',       updated_at: '2025-05-12T10:00:00Z', reason: 'כרטיס פג תוקף' },
    { id: '2', amount: 500,  campaign_title: 'בית חם לנוער',       updated_at: '2025-05-11T10:00:00Z', reason: 'סורב ע"י חברת אשראי' },
    { id: '3', amount: 120,  campaign_title: 'סלי מזון למשפחות',  updated_at: '2025-05-11T10:00:00Z', reason: 'שגיאת סליקה' },
    { id: '4', amount: 1360, campaign_title: 'מלגות תשפ"ה',       updated_at: '2025-05-10T10:00:00Z', reason: 'כרטיס פג תוקף' },
  ];

  get displayAmbassadors()     { return this.data?.topAmbassadors?.length  ? this.data.topAmbassadors  : this.mockAmbassadors; }
  get displayDonations()       { return this.data?.recentDonations?.length  ? this.data.recentDonations  : this.mockDonations; }
  get displayFailedPayments()  { return this.data?.failedPayments?.length   ? this.data.failedPayments   : this.mockFailedPayments; }
  get displayFailedTotal(): number {
    return this.data?.failedPayments?.length
      ? this.data.kpi.failedPayments.totalLost
      : this.mockFailedPayments.reduce((s, f) => s + f.amount, 0);
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
    const base = this.data?.alerts ?? [];
    const e = this.currentEntity.currentEntity();
    const critical: DashboardData['alerts'] = [];
    if (e) {
      if (e.status === 'pending_review')
        critical.push({ type: 'entity_pending', ref_id: null, severity: 'critical',
          title: 'העמותה ממתינה לאישור',
          description: 'לא ניתן להעלות קמפיינים עד לאישור העמותה' });
      if (!e.cardcom_terminal_number)
        critical.push({ type: 'missing_cardcom', ref_id: null, severity: 'critical',
          title: 'לא הוגדר אמצעי סליקה',
          description: 'יש להגדיר מסוף Cardcom כדי לקבל תשלומים' });
      if (!e.tax_document_name)
        critical.push({ type: 'missing_tax_doc', ref_id: null, severity: 'critical',
          title: 'חסר אישור סעיף 46',
          description: 'יש להעלות אישור פטור ממס כדי לאפשר גיוס כספים' });
      if (!e.association_certificate_name)
        critical.push({ type: 'missing_association_cert', ref_id: null, severity: 'critical',
          title: 'חסרה תעודת התאגדות',
          description: 'יש להעלות תעודת התאגדות כדי לאמת את הגוף' });
    }
    return [...critical, ...base];
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

  progressPct(c: DashboardData['campaigns'][0]): number {
    return c.target_amount > 0 ? Math.min(100, Math.round(c.current_amount / c.target_amount * 100)) : 0;
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
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  }

  statusLabel(s: string): string {
    return ({ published:'פעיל', draft:'טיוטה', pending_review:'ממתין', ended:'הסתיים' })[s] ?? s;
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
        this.router.navigate(a.ref_id ? ['/campaigns', a.ref_id, 'edit'] : ['/campaigns']);
        break;
    }
  }

  scrollToAlerts(): void {
    document.getElementById('alerts-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ambPct(amb: DashboardData['topAmbassadors'][0]): string {
    if (!amb.goal_amount || amb.goal_amount === 0) return '';
    return `${Math.round(amb.raised_total / amb.goal_amount * 100)}% מהיעד`;
  }

  initials(name: string): string {
    return name.split(' ').slice(0,2).map(w => w[0] ?? '').join('');
  }

  editCampaign(id: string): void {
    this.router.navigate(['/campaigns', id, 'edit']);
  }

  viewCampaign(slug: string): void {
    this.router.navigate(['/campaigns', slug, 'view']);
  }
}
