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

  page  = 0;
  limit = 25;
  loading = false;
  error: string | null = null;

  private searchTimer: any;

  get totalPages(): number { return Math.max(1, Math.ceil(this.kpi.total / this.limit)); }

  ngOnInit(): void {
    this.load();
  }

  setPeriod(p: Period): void {
    this.period = p;
    this.page   = 0;
    this.load();
  }

  onFilterChange(): void {
    this.page = 0;
    this.load();
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page = 0; this.load(); }, 400);
  }

  prevPage(): void { if (this.page > 0) { this.page--; this.load(); } }
  nextPage(): void { if (this.page < this.totalPages - 1) { this.page++; this.load(); } }

  openDrawer(d: Donation): void  { this.selected = d; }
  closeDrawer(): void            { this.selected = null; }

  load(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) { this.error = 'לא נמצאה ישות'; return; }

    this.loading = true;
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });

    let params = new HttpParams()
      .set('page',   String(this.page))
      .set('limit',  String(this.limit))
      .set('period', this.period);

    if (this.statusFilter !== 'all') params = params.set('status', this.statusFilter);
    if (this.campaignFilter)         params = params.set('campaignId', this.campaignFilter);
    if (this.searchQuery.trim())     params = params.set('search', this.searchQuery.trim());

    this.http.get<any>(`${environment.apiUrl}/api/donations/entity/${entity.id}`, { headers, params })
      .subscribe({
        next: (res) => {
          this.donations = res.donations ?? [];
          this.kpi       = res.kpi;
          this.campaigns = res.campaigns ?? [];
          this.loading   = false;
          this.loader.hide();
        },
        error: (err) => {
          console.error('donations load error', err.status, err.error);
          this.error   = err.error?.error || err.error?.message || `שגיאה בטעינה (${err.status})`;
          this.loading = false;
          this.loader.hide();
        },
      });
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
