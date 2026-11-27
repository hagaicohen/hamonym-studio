import { AnalyticsRangeService, CAMPAIGN_RANGE_DEFAULT } from '../../../../core/services/analytics-range.service';
import { DateRangePickerComponent, shiftCivilDate } from '../../../../shared/components/date-range-picker/date-range-picker.component';
import { Component, ElementRef, HostListener, OnDestroy, ViewChild, effect, inject, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { DashboardOverview, DashboardRange, PlatformDashboardService } from '../../services/platform-dashboard.service';


import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';
type DashboardPeriod = 'month' | DashboardRange | 'custom';
interface ChartPoint { date: string; value: number; }

@Component({
  providers: [AnalyticsRangeService, { provide: CAMPAIGN_RANGE_DEFAULT, useValue: 'month' }],
  selector: 'app-platform-dashboard-page',
  standalone: true,
  imports: [DateRangePickerComponent, HmIconComponent, CommonModule, RouterLink],
  templateUrl: './platform-dashboard-page.component.html',
  styleUrl: './platform-dashboard-page.component.css',
})
export class PlatformDashboardPageComponent implements OnDestroy {
  private service = inject(PlatformDashboardService);
  readonly context = inject(CurrentContextService);
  @ViewChild('donorDrawer') donorDrawer?: ElementRef<HTMLElement>;
  @ViewChild('drawerClose') drawerClose?: ElementRef<HTMLButtonElement>;
  private request?: Subscription;
  private requestId = 0;
  private focusTimer?: ReturnType<typeof setTimeout>;
  private drawerTrigger?: HTMLElement;

  data: DashboardOverview | null = null;
  loading = true;
  error: string | null = null;
  range: DashboardRange = '30d';
  period: DashboardPeriod = 'month';
  private readonly analyticsRange = inject(AnalyticsRangeService);
  attentionPage = 0;
  donorsOpen = false;
  donorPage = 0;
  readonly donorPageSize = 20;
  readonly chartWidth = 560;
  readonly chartHeight = 160;
  private readonly padding = { top: 10, bottom: 20, left: 8, right: 8 };
  lineHover: { index: number; x: number; y: number } | null = null;

  constructor() {
    effect(() => {
      const { preset } = this.analyticsRange.activeRange();
      const period = preset === 'calendar_12m' ? '12m' : preset === 'month' || preset === '7d' || preset === '30d' ? preset : 'custom';
      untracked(() => this.load(period));
    });
  }
  ngOnDestroy(): void {
    this.requestId++;
    this.request?.unsubscribe();
    clearTimeout(this.focusTimer);
  }

  load(period: DashboardPeriod = this.period): void {
    const range = period === 'month' || period === 'custom' ? '30d' : period;
    const periodChanged = this.period !== period;
    this.period = period;
    if (periodChanged && this.donorsOpen) this.closeDonors();
    this.request?.unsubscribe();
    const requestId = ++this.requestId;
    this.loading = true;
    this.error = null;
    this.lineHover = null;
    this.request = this.service.getOverview(range).subscribe({
      next: (data) => {
        if (requestId !== this.requestId) return;
        if (data.version !== 1 || !Array.isArray(data.newDonors) ||
            (data.kpis.newDonorsThisMonth !== null && data.kpis.newDonorsThisMonth !== data.newDonors.length)) {
          this.error = 'נתוני הדשבורד אינם תואמים. נסה לטעון מחדש.';
          this.loading = false;
          return;
        }
        this.data = data;
        this.range = range;
        this.attentionPage = 0;
        this.donorPage = 0;
        this.loading = false;
      },
      error: (err) => {
        if (requestId !== this.requestId) return;
        this.error = err.status === 404 ? 'נדרשת גרסת שרת תואמת לדשבורד המעודכן.' : 'לא ניתן לטעון את הדשבורד. נסה שוב.';
        this.loading = false;
      },
    });
  }

  private get monthStartDay(): string {
    const start = this.data?.period?.start;
    return start ? this.fmtDate(start).split('/').reverse().join('-') : '';
  }

  get monthSeriesAvailable(): boolean {
    const points = this.data?.trend?.points;
    return !!this.monthStartDay && !!points?.length && points[0].date <= this.monthStartDay;
  }

  get seriesAvailable(): boolean {
    if (this.period === 'month') return this.monthSeriesAvailable;
    if (this.period !== 'custom') return !!this.data?.trend;
    const { from, to } = this.analyticsRange.activeRange();
    const points = this.data?.trend?.points ?? [];
    return !!from && !!to && !!points.length && points[0].date <= from &&
      points[points.length - 1].date >= shiftCivilDate(to, -1);
  }

  get donationTotal(): number | null {
    if (this.loading || this.error) return null;
    if (this.period === 'month') return this.data?.kpis.donationsMonth ?? null;
    if (this.period === 'custom') return this.seriesAvailable ? this.donationsDaily.reduce((total, point) => total + point.value, 0) : null;
    return this.data?.trend?.total ?? null;
  }

  get periodDonors() {
    if (this.loading || this.error || this.data?.kpis.newDonorsThisMonth == null) return null;
    if (this.period === 'month') return this.data.newDonors;
    const { from, to } = this.analyticsRange.activeRange();
    if (!from || from < this.monthStartDay || !to || to > this.localDay(this.data.period?.end ?? '')) return null;
    return this.data.newDonors.filter(donor => {
      const day = this.localDay(donor.firstDonationAt);
      return day >= from && day < to;
    });
  }

  private localDay(iso: string): string {
    return iso ? this.fmtDate(iso).split('/').reverse().join('-') : '';
  }

  get donationsDaily(): ChartPoint[] {
    const points = this.data?.trend?.points ?? [];
    if (this.period === 'custom') {
      const { from, to } = this.analyticsRange.activeRange();
      return this.seriesAvailable ? points.filter(point => point.date >= from && point.date < to) : [];
    }
    if (this.period !== 'month') return points;
    return this.monthSeriesAvailable ? points.filter(point => point.date.startsWith(this.monthStartDay.slice(0, 7))) : [];
  }

  get recentActivity() {
    const seen = new Set<string>();
    return this.data?.activity.filter(event => {
      // The record identity denotes the action; matching text or timestamps
      // alone must never merge genuinely distinct business events.
      if (!event.id) return true;
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    }) ?? [];
  }
  get hasDonations(): boolean { return this.donationsDaily.some(p => p.value > 0); }
  get comparisonPercent(): number | null {
    const previous = this.previousTotal;
    const total = this.donationTotal;
    return previous !== null && previous > 0 && total !== null ? (total - previous) / previous * 100 : null;
  }

  get previousTotal(): number | null {
    if (this.period !== 'month' && this.period !== 'custom') return this.data?.trend?.previousTotal ?? null;
    if (!this.seriesAvailable) return null;
    const { from, to } = this.analyticsRange.activeRange();
    const days = (Date.parse(to) - Date.parse(from)) / 86400000;
    const previousFrom = this.period === 'month'
      ? shiftCivilDate(from, -1).slice(0, 7) + '-01'
      : shiftCivilDate(from, -days);
    const matchedEnd = shiftCivilDate(previousFrom, days);
    const previousEnd = matchedEnd < from ? matchedEnd : from;
    const points = this.data?.trend?.points ?? [];
    if (!points.length || points[0].date > previousFrom) return null;
    return points.filter(point => point.date >= previousFrom && point.date < previousEnd).reduce((total, point) => total + point.value, 0);
  }
  get visibleAttention() { return this.data?.attention.slice(this.attentionPage * 5, this.attentionPage * 5 + 5) ?? []; }
  get attentionPages(): number { return Math.max(1, Math.ceil((this.data?.attention.length ?? 0) / 5)); }
  get visibleDonors() { return this.periodDonors?.slice(this.donorPage * this.donorPageSize, (this.donorPage + 1) * this.donorPageSize) ?? []; }
  get donorPages(): number { return Math.max(1, Math.ceil((this.periodDonors?.length ?? 0) / this.donorPageSize)); }

  focusAttention(section: HTMLElement): void {
    this.attentionPage = 0;
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openDonors(trigger: HTMLElement): void {
    if (!this.context.isSuperAdmin() || !this.periodDonors) return;
    this.drawerTrigger = trigger;
    this.donorPage = 0;
    this.donorsOpen = true;
    clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => this.drawerClose?.nativeElement.focus());
  }

  closeDonors(): void {
    this.donorsOpen = false;
    clearTimeout(this.focusTimer);
    this.drawerTrigger?.focus();
  }

  @HostListener('document:keydown', ['$event'])
  onDrawerKey(event: KeyboardEvent): void {
    if (!this.donorsOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); this.closeDonors(); return; }
    if (event.key !== 'Tab') return;
    const controls = this.donorDrawer?.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]');
    if (!controls?.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    const active = first.ownerDocument.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  fmtMoney(value: number | null): string {
    return value === null ? '—' : new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }
  fmtDate(iso: string, withTime = false): string {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
    }).format(date);
  }
  fmtDayLabel(iso: string): string {
    const [year, month, day] = iso.slice(0, 10).split('-');
    return this.range === '12m' ? `${month}/${year}` : `${day}/${month}`;
  }
  // Reuse the existing SVG chart geometry for each supported time range.
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

}
