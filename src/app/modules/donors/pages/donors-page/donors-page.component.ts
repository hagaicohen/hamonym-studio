import { Component, OnInit, inject, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

interface Kpi {
  donorCount:  number;
  totalRaised: number;
  avgPerDonor: number;
}

interface DonorRow {
  donor_key:        string;
  email:            string | null;
  phone:            string | null;
  display_name:     string;
  has_anonymous:    boolean;
  has_mock:         boolean;
  total_donated:    number;
  donation_count:   number;
  first_donation_at: string;
  last_donation_at:  string;
  campaigns_count:  number;
}

type SortField = 'name' | 'total' | 'count' | 'last';
type SortDir   = 'asc' | 'desc';
type ColumnKey = 'email' | 'phone' | 'count' | 'campaigns' | 'last';

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: 'email',      label: 'אימייל' },
  { key: 'phone',      label: 'טלפון' },
  { key: 'count',      label: 'תרומות' },
  { key: 'campaigns',  label: 'קמפיינים' },
  { key: 'last',       label: 'תרומה אחרונה' },
];
const COLUMNS_STORAGE_KEY = 'donors-hidden-columns';

@Component({
  selector: 'app-donors-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './donors-page.component.html',
  styleUrl: './donors-page.component.css',
})
export class DonorsPageComponent implements OnInit {
  private http          = inject(HttpClient);
  private currentEntity = inject(CurrentEntityService);
  private loader        = inject(AppLoaderService);

  donors: DonorRow[] = [];
  kpi: Kpi = { donorCount: 0, totalRaised: 0, avgPerDonor: 0 };
  selected: DonorRow | null = null;

  searchQuery = '';
  sortField: SortField = 'total';
  sortDir:   SortDir   = 'desc';

  page  = 0;
  limit = 25;
  total = 0;
  loading    = false;
  refreshing = false;
  error: string | null = null;

  private searchTimer: any;

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }

  readonly columnDefs = COLUMN_DEFS;
  hiddenColumns = new Set<ColumnKey>();
  columnsMenuOpen = false;
  private lastLoadedEntityId: string | null = null;

  constructor() {
    effect(() => {
      const id = this.currentEntity.currentEntity()?.id ?? null;
      if (id === this.lastLoadedEntityId) return;
      this.lastLoadedEntityId = id;
      untracked(() => this.load());
    });
  }

  ngOnInit(): void {
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

  openDrawer(d: DonorRow): void { this.selected = d; }
  closeDrawer(): void           { this.selected = null; }

  load(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) { this.error = 'לא נמצאה ישות'; return; }

    if (this.donors.length === 0) this.loading = true;
    else this.refreshing = true;

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });

    let params = new HttpParams()
      .set('page',    String(this.page))
      .set('limit',   String(this.limit))
      .set('sortBy',  this.sortField)
      .set('sortDir', this.sortDir);

    if (this.searchQuery.trim()) params = params.set('search', this.searchQuery.trim());

    this.http.get<any>(`${environment.apiUrl}/api/donations/entity/${entity.id}/donors`, { headers, params })
      .subscribe({
        next: (res) => {
          this.donors     = res.donors ?? [];
          this.kpi        = res.kpi;
          this.total      = res.total ?? 0;
          this.loading    = false;
          this.refreshing = false;
          this.loader.hide();
        },
        error: (err) => {
          console.error('donors load error', err.status, err.error);
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
      .set('sortBy',  this.sortField)
      .set('sortDir', this.sortDir);

    if (this.searchQuery.trim()) params = params.set('search', this.searchQuery.trim());

    this.http.get<any>(`${environment.apiUrl}/api/donations/entity/${entity.id}/donors`, { headers, params })
      .subscribe({
        next: (res) => {
          this.downloadCsv(res.donors ?? []);
          this.exporting = false;
        },
        error: (err) => {
          console.error('donors export error', err.status, err.error);
          this.exporting = false;
        },
      });
  }

  private downloadCsv(rows: DonorRow[]): void {
    const headerRow = ['שם', 'אימייל', 'טלפון', 'סה"כ נתרם', 'מספר תרומות', 'קמפיינים', 'תרומה ראשונה', 'תרומה אחרונה'];
    const csvRows = rows.map(d => [
      d.display_name,
      d.email ?? '',
      d.phone ?? '',
      d.total_donated,
      d.donation_count,
      d.campaigns_count,
      this.fmtDate(d.first_donation_at),
      this.fmtDate(d.last_donation_at),
    ]);

    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headerRow, ...csvRows].map(row => row.map(escape).join(',')).join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `תורמים-${new Date().toISOString().slice(0, 10)}.csv`;
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
}
