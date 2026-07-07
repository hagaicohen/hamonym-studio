import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

interface Kpi {
  totalRaised:  number;
  paidCount:    number;
  failedCount:  number;
  pendingCount: number;
  avgAmount:    number;
  total:        number;
}

interface Campaign { id: string; title: string; }

interface Donation {
  id:             string;
  amount:         number;
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
}

type Period = 'month' | 'last_month' | 'quarter' | 'all';
type SortField = 'donor' | 'campaign' | 'amount' | 'date' | 'status';
type SortDir = 'asc' | 'desc';
type ColumnKey = 'campaign' | 'date' | 'status';

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: 'campaign', label: 'קמפיין' },
  { key: 'date',     label: 'תאריך' },
  { key: 'status',   label: 'סטטוס' },
];
const COLUMNS_STORAGE_KEY = 'donations-hidden-columns';

@Component({
  selector: 'app-donations-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './donations-page.component.html',
  styleUrl: './donations-page.component.css',
})
export class DonationsPageComponent implements OnInit {
  private http          = inject(HttpClient);
  private currentEntity = inject(CurrentEntityService);
  private loader        = inject(AppLoaderService);

  donations:  Donation[]  = [];
  campaigns:  Campaign[]  = [];
  kpi: Kpi = { totalRaised: 0, paidCount: 0, failedCount: 0, pendingCount: 0, avgAmount: 0, total: 0 };
  selected:   Donation | null = null;

  period:         Period = 'month';
  statusFilter    = 'all';
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

  onLimitChange(): void {
    this.page = 0;
    this.load();
  }

  openDrawer(d: Donation): void  { this.selected = d; }
  closeDrawer(): void            { this.selected = null; }

  load(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) { this.error = 'לא נמצאה ישות'; return; }

    if (this.donations.length === 0) this.loading = true;
    else this.refreshing = true;
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });

    let params = new HttpParams()
      .set('page',    String(this.page))
      .set('limit',   String(this.limit))
      .set('period',  this.period)
      .set('sortBy',  this.sortField)
      .set('sortDir', this.sortDir);

    if (this.statusFilter !== 'all') params = params.set('status', this.statusFilter);
    if (this.campaignFilter)         params = params.set('campaignId', this.campaignFilter);
    if (this.searchQuery.trim())     params = params.set('search', this.searchQuery.trim());

    this.http.get<any>(`${environment.apiUrl}/api/donations/entity/${entity.id}`, { headers, params })
      .subscribe({
        next: (res) => {
          this.donations  = res.donations ?? [];
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
      .set('period',  this.period)
      .set('sortBy',  this.sortField)
      .set('sortDir', this.sortDir);

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
    const headerRow = ['תורם', 'קמפיין', 'סכום', 'תאריך', 'סטטוס'];
    const csvRows = rows.map(d => [
      this.donorDisplay(d),
      d.campaign_title,
      d.amount,
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
