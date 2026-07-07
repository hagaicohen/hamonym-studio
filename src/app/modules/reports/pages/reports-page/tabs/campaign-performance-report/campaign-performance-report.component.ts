import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../../../../../environments/environment';
import { CurrentEntityService } from '../../../../../../core/services/current-entity.service';

interface CampaignPerf {
  id: string;
  title: string;
  slug: string;
  status: string;
  cover_image_url: string | null;
  target_amount: number;
  current_amount: number;
  supporters_count: number;
  pct: number | null;
  avg: number;
  daily_pace: number;
  days_remaining: number | null;
  projected_total: number | null;
  created_at: string;
}

interface Kpi {
  totalCampaigns: number;
  activeCampaigns: number;
  totalRaised: number;
  avgProgressPct: number | null;
}

type SortField = 'name' | 'target' | 'raised' | 'pct' | 'donors' | 'avg';
type SortDir = 'asc' | 'desc';
type ColumnKey = 'target' | 'pct' | 'donors' | 'avg' | 'pace' | 'remaining';

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: 'target',    label: 'יעד' },
  { key: 'pct',       label: '%' },
  { key: 'donors',    label: 'תורמים' },
  { key: 'avg',       label: 'ממוצע' },
  { key: 'pace',      label: 'קצב יומי' },
  { key: 'remaining', label: 'ימים שנותרו' },
];
const COLUMNS_STORAGE_KEY = 'reports-campaigns-hidden-columns';

@Component({
  selector: 'app-campaign-performance-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './campaign-performance-report.component.html',
  styleUrls: ['./campaign-performance-report.component.css', '../../../../shared/reports-shared.css'],
})
export class CampaignPerformanceReportComponent implements OnInit {
  private http          = inject(HttpClient);
  private currentEntity = inject(CurrentEntityService);

  campaigns: CampaignPerf[] = [];
  kpi: Kpi = { totalCampaigns: 0, activeCampaigns: 0, totalRaised: 0, avgProgressPct: null };
  loading    = true;
  refreshing = false;
  error: string | null = null;

  searchQuery  = '';
  statusFilter = 'all';

  sortField: SortField = 'raised';
  sortDir: SortDir = 'desc';

  readonly columnDefs = COLUMN_DEFS;
  hiddenColumns = new Set<ColumnKey>();
  columnsMenuOpen = false;

  private searchTimer: any;
  exporting = false;

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

    if (this.campaigns.length === 0) this.loading = true;
    else this.refreshing = true;

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    let params = new HttpParams().set('sortBy', this.sortField).set('sortDir', this.sortDir);
    if (this.statusFilter !== 'all')  params = params.set('status', this.statusFilter);
    if (this.searchQuery.trim())      params = params.set('search', this.searchQuery.trim());

    this.http.get<any>(`${environment.apiUrl}/api/reports/entity/${entity.id}/campaigns`, { headers, params })
      .subscribe({
        next: (res) => {
          this.campaigns  = res.campaigns ?? [];
          this.kpi        = res.kpi;
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
    const headerRow = ['קמפיין', 'סטטוס', 'יעד', 'גויס', '%', 'תורמים', 'ממוצע', 'קצב יומי', 'ימים שנותרו'];
    const rows = this.campaigns.map((c) => [
      c.title, c.status, c.target_amount, c.current_amount, c.pct ?? '',
      c.supporters_count, Math.round(c.avg), Math.round(c.daily_pace), c.days_remaining ?? '',
    ]);
    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headerRow, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `ביצועי-קמפיינים-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.exporting = false;
  }

  fmtMoney(n: number): string {
    return '₪' + Math.round(n).toLocaleString('he-IL');
  }

  fmtDays(n: number | null): string {
    if (n === null) return '—';
    if (n < 0) return 'הסתיים';
    return `${n} ימים`;
  }
}
