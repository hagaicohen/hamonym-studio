import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PlatformService } from '../../services/platform.service';
import { relativeTime } from '../../utils/relative-time';

interface DashboardKpis {
  totalEntities: number;
  activeEntities: number;
  pendingReviewEntities: number;
  incompleteDraftEntities: number;
  activeCampaigns: number;
  donationsToday: number;
  donationsMonth: number;
  failedPaymentsThisMonth: number;
  newDonorsThisMonth: number;
}

interface Alert {
  key: string;
  label: string;
  count: number;
  linkQuery: Record<string, string>;
}

type ActivityType = 'audit' | 'campaign_audit' | 'campaign' | 'donation' | 'user';

interface ActivityItem {
  type: ActivityType;
  title: string;
  subtitle: string | null;
  timestamp: string;
}

interface ChartPoint {
  date: string;
  value: number;
}

const ACTIVITY_ICON: Record<ActivityType, string> = {
  audit: '🛡️',
  campaign_audit: '🛡️',
  campaign: '🎯',
  donation: '💛',
  user: '👤',
};

const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  audit: 'עמותה',
  campaign_audit: 'קמפיין',
  campaign: 'קמפיין חדש',
  donation: 'תרומה',
  user: 'משתמש',
};

type ActivityFilter = 'all' | ActivityType;

const ACTIVITY_FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'audit', label: 'עמותות' },
  { key: 'campaign_audit', label: 'ניהול קמפיינים' },
  { key: 'campaign', label: 'קמפיינים חדשים' },
  { key: 'donation', label: 'תרומות' },
  { key: 'user', label: 'משתמשים' },
];

@Component({
  selector: 'app-platform-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './platform-dashboard-page.component.html',
  styleUrl: './platform-dashboard-page.component.css',
})
export class PlatformDashboardPageComponent implements OnInit {
  private platformService = inject(PlatformService);
  private router = inject(Router);

  loading = true;
  error: string | null = null;

  kpis: DashboardKpis | null = null;
  alerts: Alert[] = [];
  donationsDaily: ChartPoint[] = [];
  entitiesWeekly: ChartPoint[] = [];

  readonly activityFilters = ACTIVITY_FILTERS;
  activity: ActivityItem[] = [];
  activityTotal = 0;
  activityPage = 0;
  activityLimit = 10;
  activityLoading = false;
  activityFilter: ActivityFilter = 'all';
  activitySortDir: 'asc' | 'desc' = 'desc';

  get activityTotalPages(): number {
    return Math.max(1, Math.ceil(this.activityTotal / this.activityLimit));
  }

  // Chart geometry (shared viewBox sizing for both inline SVG charts)
  readonly chartWidth = 560;
  readonly chartHeight = 160;
  private readonly padding = { top: 10, bottom: 20, left: 8, right: 8 };

  lineHover: { index: number; x: number; y: number } | null = null;
  barHover: { index: number; x: number; y: number } | null = null;

  ngOnInit(): void {
    this.platformService.getDashboard().subscribe({
      next: (res) => {
        this.kpis = res.kpis;
        this.alerts = res.alerts ?? [];
        this.donationsDaily = res.charts?.donationsDaily ?? [];
        this.entitiesWeekly = res.charts?.entitiesWeekly ?? [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'שגיאה בטעינת נתוני הפלטפורמה';
        this.loading = false;
      },
    });

    this.loadActivity();
  }

  loadActivity(): void {
    this.activityLoading = true;
    this.platformService
      .getActivity({
        type: this.activityFilter === 'all' ? undefined : this.activityFilter,
        sortDir: this.activitySortDir,
        page: this.activityPage,
        limit: this.activityLimit,
      })
      .subscribe({
        next: (res) => {
          this.activity = res.items ?? [];
          this.activityTotal = res.total ?? 0;
          this.activityLoading = false;
        },
        error: () => {
          this.activityLoading = false;
        },
      });
  }

  selectActivityFilter(filter: ActivityFilter): void {
    this.activityFilter = filter;
    this.activityPage = 0;
    this.loadActivity();
  }

  toggleActivitySort(): void {
    this.activitySortDir = this.activitySortDir === 'desc' ? 'asc' : 'desc';
    this.activityPage = 0;
    this.loadActivity();
  }

  prevActivityPage(): void {
    if (this.activityPage > 0) { this.activityPage--; this.loadActivity(); }
  }

  nextActivityPage(): void {
    if (this.activityPage < this.activityTotalPages - 1) { this.activityPage++; this.loadActivity(); }
  }

  goToAlert(alert: Alert): void {
    this.router.navigate(['/platform/organizations'], { queryParams: alert.linkQuery });
  }

  activityIcon(type: ActivityType): string {
    return ACTIVITY_ICON[type] ?? '•';
  }

  activityTypeLabel(type: ActivityType): string {
    return ACTIVITY_TYPE_LABEL[type] ?? type;
  }

  relativeTime(iso: string): string {
    return relativeTime(iso);
  }

  fmtMoney(n: number): string {
    return '₪' + Math.round(n || 0).toLocaleString('he-IL');
  }

  fmtDayLabel(iso: string): string {
    const [, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}`;
  }

  // ── Line chart geometry (donations, 30 days) ──
  get linePoints(): { x: number; y: number; value: number; date: string }[] {
    return this.toPoints(this.donationsDaily);
  }

  get lineMax(): number {
    return Math.max(1, ...this.donationsDaily.map((p) => p.value));
  }

  get linePath(): string {
    const pts = this.linePoints;
    if (pts.length === 0) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  get lineAreaPath(): string {
    const pts = this.linePoints;
    if (pts.length === 0) return '';
    const baseline = this.chartHeight - this.padding.bottom;
    const top = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return `${top} L ${pts[pts.length - 1].x} ${baseline} L ${pts[0].x} ${baseline} Z`;
  }

  onLineMove(evt: MouseEvent, svg: Element): void {
    const pts = this.linePoints;
    if (pts.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * this.chartWidth;
    let closest = 0;
    let closestDist = Infinity;
    pts.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    });
    this.lineHover = { index: closest, x: pts[closest].x, y: pts[closest].y };
  }

  onLineLeave(): void {
    this.lineHover = null;
  }

  private toPoints(series: ChartPoint[]): { x: number; y: number; value: number; date: string }[] {
    if (series.length === 0) return [];
    const max = Math.max(1, ...series.map((p) => p.value));
    const innerWidth = this.chartWidth - this.padding.left - this.padding.right;
    const innerHeight = this.chartHeight - this.padding.top - this.padding.bottom;
    const step = series.length > 1 ? innerWidth / (series.length - 1) : 0;

    return series.map((p, i) => ({
      x: this.padding.left + step * i,
      y: this.padding.top + innerHeight * (1 - p.value / max),
      value: p.value,
      date: p.date,
    }));
  }

  // ── Bar chart geometry (new entities, 8 weeks) ──
  get barItems(): { x: number; y: number; width: number; height: number; value: number; date: string }[] {
    const series = this.entitiesWeekly;
    if (series.length === 0) return [];
    const max = Math.max(1, ...series.map((p) => p.value));
    const innerWidth = this.chartWidth - this.padding.left - this.padding.right;
    const innerHeight = this.chartHeight - this.padding.top - this.padding.bottom;
    const slot = innerWidth / series.length;
    const barWidth = Math.min(24, slot * 0.55);

    return series.map((p, i) => {
      const height = p.value === 0 ? 0 : Math.max(3, innerHeight * (p.value / max));
      return {
        x: this.padding.left + slot * i + (slot - barWidth) / 2,
        y: this.padding.top + innerHeight - height,
        width: barWidth,
        height,
        value: p.value,
        date: p.date,
      };
    });
  }

  onBarEnter(i: number, evt: MouseEvent): void {
    const bar = this.barItems[i];
    if (!bar) return;
    this.barHover = { index: i, x: bar.x + bar.width / 2, y: bar.y };
  }

  onBarLeave(): void {
    this.barHover = null;
  }
}
