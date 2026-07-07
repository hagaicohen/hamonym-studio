import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../../../../../environments/environment';
import { CurrentEntityService } from '../../../../../../core/services/current-entity.service';
import { ReportChartComponent, ReportChartDataset } from '../../../../shared/report-chart/report-chart.component';

interface Kpi {
  failedCount: number;
  failedAmount: number;
  pendingCount: number;
  successRate: number | null;
}
interface FailureReason { reason: string; count: number; }
interface RecentRow {
  id: string;
  amount: number;
  donor_name: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  campaign_title: string;
}

type SortField = 'donor' | 'campaign' | 'amount' | 'status' | 'date';
type SortDir = 'asc' | 'desc';
type ColumnKey = 'campaign' | 'status' | 'reason' | 'date';

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: 'campaign', label: 'קמפיין' },
  { key: 'status',   label: 'סטטוס' },
  { key: 'reason',   label: 'סיבה' },
  { key: 'date',     label: 'עודכן' },
];
const COLUMNS_STORAGE_KEY = 'reports-failures-hidden-columns';

@Component({
  selector: 'app-failures-report',
  standalone: true,
  imports: [CommonModule, FormsModule, ReportChartComponent],
  templateUrl: './failures-report.component.html',
  styleUrls: ['./failures-report.component.css', '../../../../shared/reports-shared.css'],
})
export class FailuresReportComponent implements OnInit {
  private http          = inject(HttpClient);
  private currentEntity = inject(CurrentEntityService);

  kpi: Kpi = { failedCount: 0, failedAmount: 0, pendingCount: 0, successRate: null };
  failureReasons: FailureReason[] = [];
  recent: RecentRow[] = [];

  chartLabels: string[] = [];
  chartDatasets: ReportChartDataset[] = [];

  searchQuery  = '';
  statusFilter = 'all';
  sortField: SortField = 'date';
  sortDir: SortDir = 'desc';

  readonly columnDefs = COLUMN_DEFS;
  hiddenColumns = new Set<ColumnKey>();
  columnsMenuOpen = false;

  private searchTimer: any;
  exporting = false;

  loading    = true;
  refreshing = false;
  error: string | null = null;

  get chartHeight(): number {
    return Math.max(120, this.failureReasons.length * 40);
  }

  ngOnInit(): void {
    this.load();
    try {
      const saved = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (saved) this.hiddenColumns = new Set(JSON.parse(saved));
    } catch { /* ignore malformed storage */ }
  }

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

  onFilterChange(): void {
    this.load();
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 400);
  }

  sortBy(field: SortField): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'asc';
    }
    this.load();
  }

  load(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) { this.error = 'לא נמצאה ישות'; this.loading = false; return; }

    if (this.recent.length === 0 && !this.kpi.failedCount && !this.kpi.pendingCount) this.loading = true;
    else this.refreshing = true;

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    let params = new HttpParams().set('sortBy', this.sortField).set('sortDir', this.sortDir);
    if (this.statusFilter !== 'all')  params = params.set('status', this.statusFilter);
    if (this.searchQuery.trim())      params = params.set('search', this.searchQuery.trim());

    this.http.get<any>(`${environment.apiUrl}/api/reports/entity/${entity.id}/failures`, { headers, params })
      .subscribe({
        next: (res) => {
          this.kpi            = res.kpi;
          this.failureReasons = res.failureReasons ?? [];
          this.recent         = res.recent ?? [];
          this.chartLabels    = this.failureReasons.map((r) => r.reason);
          this.chartDatasets  = [{ label: 'תרומות שנכשלו', data: this.failureReasons.map((r) => r.count), color: '#e34948' }];
          this.loading    = false;
          this.refreshing = false;
        },
        error: (err) => {
          this.error      = err.error?.error || `שגיאה בטעינה (${err.status})`;
          this.loading    = false;
          this.refreshing = false;
        },
      });
  }

  exportCsv(): void {
    this.exporting = true;
    const headerRow = ['תורם', 'קמפיין', 'סכום', 'סטטוס', 'סיבה', 'עודכן'];
    const rows = this.recent.map((r) => [
      r.donor_name, r.campaign_title, r.amount, this.statusLabel(r.status), r.failure_reason ?? '', this.fmtDateTime(r.updated_at),
    ]);
    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headerRow, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `תקלות-וסליקה-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.exporting = false;
  }

  fmtMoney(n: number): string {
    return '₪' + Math.round(n).toLocaleString('he-IL');
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
    return s === 'failed' ? 'נכשל' : 'ממתין';
  }
}
