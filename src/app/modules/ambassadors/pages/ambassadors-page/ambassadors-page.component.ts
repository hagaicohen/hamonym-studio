import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

interface Kpi {
  totalAmbassadors:  number;
  activeAmbassadors: number;
  totalRaised:       number;
  totalDonors:       number;
}

interface Campaign { id: string; title: string; }

interface AmbassadorRow {
  id:               string;
  campaign_id:      string;
  full_name:        string;
  phone:            string | null;
  email:            string | null;
  goal_amount:      number | null;
  status:           'active' | 'inactive' | 'pending';
  personal_message: string;
  personal_title:   string;
  slug:             string;
  raised_online:    number;
  raised_manual:    number;
  raised_total:     number;
  donor_count:      number;
  created_at:       string;
  deactivated_at:   string | null;
  campaign_title:   string;
  campaign_slug:    string;
}

type SortField = 'name' | 'campaign' | 'goal' | 'raised' | 'donors' | 'status';
type SortDir   = 'asc' | 'desc';
type ColumnKey = 'campaign' | 'email' | 'phone' | 'goal' | 'donors' | 'status';

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: 'campaign', label: 'קמפיין' },
  { key: 'email',    label: 'אימייל' },
  { key: 'phone',    label: 'טלפון' },
  { key: 'goal',     label: 'יעד אישי' },
  { key: 'donors',   label: 'תורמים' },
  { key: 'status',   label: 'סטטוס' },
];
const COLUMNS_STORAGE_KEY = 'ambassadors-hidden-columns';

@Component({
  selector: 'app-ambassadors-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ambassadors-page.component.html',
  styleUrl: './ambassadors-page.component.css',
})
export class AmbassadorsPageComponent implements OnInit {
  private http          = inject(HttpClient);
  private currentEntity = inject(CurrentEntityService);
  private loader        = inject(AppLoaderService);

  ambassadors: AmbassadorRow[] = [];
  campaigns:   Campaign[]      = [];
  kpi: Kpi = { totalAmbassadors: 0, activeAmbassadors: 0, totalRaised: 0, totalDonors: 0 };
  selected: AmbassadorRow | null = null;

  statusFilter   = 'all';
  campaignFilter = '';
  searchQuery    = '';

  sortField: SortField = 'raised';
  sortDir:   SortDir   = 'desc';

  page  = 0;
  limit = 25;
  loading    = false;
  refreshing = false;
  error: string | null = null;

  private searchTimer: any;

  get totalPages(): number { return Math.max(1, Math.ceil(this.kpi.totalAmbassadors / this.limit)); }

  readonly columnDefs = COLUMN_DEFS;
  hiddenColumns = new Set<ColumnKey>();
  columnsMenuOpen = false;

  linkCopied = false;

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

  openDrawer(a: AmbassadorRow): void { this.selected = a; this.linkCopied = false; }
  closeDrawer(): void               { this.selected = null; }

  load(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) { this.error = 'לא נמצאה ישות'; return; }

    if (this.ambassadors.length === 0) this.loading = true;
    else this.refreshing = true;

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });

    let params = new HttpParams()
      .set('page',    String(this.page))
      .set('limit',   String(this.limit))
      .set('sortBy',  this.sortField)
      .set('sortDir', this.sortDir);

    if (this.statusFilter !== 'all') params = params.set('status', this.statusFilter);
    if (this.campaignFilter)         params = params.set('campaignId', this.campaignFilter);
    if (this.searchQuery.trim())     params = params.set('search', this.searchQuery.trim());

    this.http.get<any>(`${environment.apiUrl}/api/entities/${entity.id}/ambassadors`, { headers, params })
      .subscribe({
        next: (res) => {
          this.ambassadors = res.ambassadors ?? [];
          this.kpi         = res.kpi;
          this.campaigns   = res.campaigns ?? [];
          this.loading     = false;
          this.refreshing  = false;
          this.loader.hide();
        },
        error: (err) => {
          console.error('ambassadors load error', err.status, err.error);
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

    if (this.statusFilter !== 'all') params = params.set('status', this.statusFilter);
    if (this.campaignFilter)         params = params.set('campaignId', this.campaignFilter);
    if (this.searchQuery.trim())     params = params.set('search', this.searchQuery.trim());

    this.http.get<any>(`${environment.apiUrl}/api/entities/${entity.id}/ambassadors`, { headers, params })
      .subscribe({
        next: (res) => {
          this.downloadCsv(res.ambassadors ?? []);
          this.exporting = false;
        },
        error: (err) => {
          console.error('ambassadors export error', err.status, err.error);
          this.exporting = false;
        },
      });
  }

  private downloadCsv(rows: AmbassadorRow[]): void {
    const headerRow = ['שם', 'קמפיין', 'אימייל', 'טלפון', 'יעד אישי', 'גויס', 'תורמים', 'סטטוס'];
    const csvRows = rows.map(a => [
      a.full_name,
      a.campaign_title,
      a.email ?? '',
      a.phone ?? '',
      a.goal_amount ?? '',
      a.raised_total,
      a.donor_count,
      this.statusLabel(a.status),
    ]);

    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headerRow, ...csvRows].map(row => row.map(escape).join(',')).join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `שגרירים-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  shareUrl(a: AmbassadorRow): string {
    return `${window.location.origin}/campaigns/${a.campaign_slug}/${a.slug}`;
  }

  copyLink(a: AmbassadorRow): void {
    navigator.clipboard.writeText(this.shareUrl(a)).then(() => {
      this.linkCopied = true;
      setTimeout(() => { this.linkCopied = false; }, 1500);
    }).catch(() => {});
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
    return s === 'active' ? 'פעיל' : s === 'pending' ? 'ממתין' : 'לא פעיל';
  }
}
