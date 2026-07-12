import { Component, inject, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../../../../environments/environment';
import { CurrentEntityService } from '../../../../../../core/services/current-entity.service';
import { ReportChartComponent, ReportChartDataset } from '../../../../shared/report-chart/report-chart.component';

const CHANNEL_COLORS = ['#583cd6', '#1baf7a', '#eda100', '#008300', '#e34948', '#e87ba4', '#eb6834', '#2a78d6'];

interface Channel { channel: string; count: number; total: number; }
interface UtmRow { source: string; medium: string | null; count: number; total: number; }
interface Kpi {
  totalRaised: number;
  topChannel: string | null;
  withUtmCount: number;
  totalCount: number;
}

@Component({
  selector: 'app-marketing-report',
  standalone: true,
  imports: [CommonModule, ReportChartComponent],
  templateUrl: './marketing-report.component.html',
  styleUrls: ['./marketing-report.component.css', '../../../../shared/reports-shared.css'],
})
export class MarketingReportComponent {
  private http          = inject(HttpClient);
  private currentEntity = inject(CurrentEntityService);

  channels: Channel[] = [];
  utmBreakdown: UtmRow[] = [];
  kpi: Kpi = { totalRaised: 0, topChannel: null, withUtmCount: 0, totalCount: 0 };
  loading = true;
  error: string | null = null;

  chartLabels: string[] = [];
  chartDatasets: ReportChartDataset[] = [];

  get chartHeight(): number {
    return Math.max(160, this.channels.length * 44);
  }

  private lastLoadedEntityId: string | null = null;

  constructor() {
    effect(() => {
      const id = this.currentEntity.currentEntity()?.id ?? null;
      if (id === this.lastLoadedEntityId) return;
      this.lastLoadedEntityId = id;
      untracked(() => this.load());
    });
  }

  load(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) { this.error = 'לא נמצאה ישות'; this.loading = false; return; }

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });

    this.http.get<any>(`${environment.apiUrl}/api/reports/entity/${entity.id}/marketing`, { headers })
      .subscribe({
        next: (res) => {
          this.channels     = res.channels ?? [];
          this.utmBreakdown = res.utmBreakdown ?? [];
          this.kpi           = res.kpi;
          this.buildChart();
          this.loading = false;
        },
        error: (err) => {
          this.error   = err.error?.error || `שגיאה בטעינה (${err.status})`;
          this.loading = false;
        },
      });
  }

  private buildChart(): void {
    this.chartLabels = this.channels.map((c) => c.channel);
    this.chartDatasets = [{
      label: 'גויס',
      data: this.channels.map((c) => c.total),
      color: this.channels.map((_, i) => CHANNEL_COLORS[i % CHANNEL_COLORS.length]),
    }];
  }

  channelColor(i: number): string {
    return CHANNEL_COLORS[i % CHANNEL_COLORS.length];
  }

  private downloadCsv(filename: string, headerRow: string[], rows: (string | number)[][]): void {
    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headerRow, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportChannelsCsv(): void {
    this.downloadCsv(
      `שיווק-לפי-ערוץ-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ערוץ', 'תרומות', 'סה"כ'],
      this.channels.map((c) => [c.channel, c.count, c.total]),
    );
  }

  exportUtmCsv(): void {
    this.downloadCsv(
      `פירוט-UTM-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Source', 'Medium', 'תרומות', 'סה"כ'],
      this.utmBreakdown.map((u) => [u.source, u.medium ?? '', u.count, u.total]),
    );
  }

  fmtMoney(n: number): string {
    return '₪' + Math.round(n).toLocaleString('he-IL');
  }
}
