import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../../../../environments/environment';
import { CurrentEntityService } from '../../../../../../core/services/current-entity.service';
import { ReportChartComponent, ReportChartDataset } from '../../../../shared/report-chart/report-chart.component';

const MONTH_LABELS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

interface Period { total: number; count: number; avg: number; }
interface PctChange { total: number | null; count: number | null; avg: number | null; }

@Component({
  selector: 'app-trends-report',
  standalone: true,
  imports: [CommonModule, ReportChartComponent],
  templateUrl: './trends-report.component.html',
  styleUrls: ['./trends-report.component.css', '../../../../shared/reports-shared.css'],
})
export class TrendsReportComponent implements OnInit {
  private http          = inject(HttpClient);
  private currentEntity = inject(CurrentEntityService);

  thisMonth: Period = { total: 0, count: 0, avg: 0 };
  lastMonth: Period = { total: 0, count: 0, avg: 0 };
  pctChange: PctChange = { total: null, count: null, avg: null };
  thisYear = 0;
  lastYear = 0;

  chartLabels = MONTH_LABELS;
  chartDatasets: ReportChartDataset[] = [];

  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) { this.error = 'לא נמצאה ישות'; this.loading = false; return; }

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });

    this.http.get<any>(`${environment.apiUrl}/api/reports/entity/${entity.id}/trends`, { headers })
      .subscribe({
        next: (res) => {
          this.thisMonth = res.kpi.thisMonth;
          this.lastMonth = res.kpi.lastMonth;
          this.pctChange = res.kpi.pctChange;
          this.thisYear  = res.yearOverYear.thisYear;
          this.lastYear  = res.yearOverYear.lastYear;
          this.chartDatasets = [
            { label: String(this.lastYear), data: res.yearOverYear.lastYearSeries, color: '#2a78d6' },
            { label: String(this.thisYear), data: res.yearOverYear.thisYearSeries, color: '#583cd6' },
          ];
          this.loading = false;
        },
        error: (err) => {
          this.error   = err.error?.error || `שגיאה בטעינה (${err.status})`;
          this.loading = false;
        },
      });
  }

  changeClass(pct: number | null): string {
    if (pct === null) return 'flat';
    return pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  }

  changeLabel(pct: number | null): string {
    if (pct === null) return '—';
    const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '—';
    return `${arrow} ${Math.abs(pct)}%`;
  }

  fmtMoney(n: number): string {
    return '₪' + Math.round(n).toLocaleString('he-IL');
  }
}
