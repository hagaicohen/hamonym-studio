import { Component, inject, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

interface Participant {
  id:              string;
  name:            string;
  option_key:      string | null;
  option_title:    string | null;
  shirt_size:      string | null;
  created_at:      string;
  payment_status:  string;
  payer_name:      string;
  payer_email:     string;
  payer_phone:     string;
  campaign_id:     string;
  campaign_title:  string;
}

// Registration Management (MVP) — the "day after registration opens" screen:
// see who registered, search them, export them. Deliberately just this —
// no QR/check-in/bib numbers, no age/gender/custom fields, until there's a
// real need for them. See docs/DECISIONS.md (2026-07-15).
@Component({
  selector: 'app-registrations-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './registrations-page.component.html',
  styleUrl: './registrations-page.component.css',
})
export class RegistrationsPageComponent {
  private http          = inject(HttpClient);
  private currentEntity = inject(CurrentEntityService);
  private loader        = inject(AppLoaderService);

  participants: Participant[] = [];
  total = 0;
  searchQuery = '';

  page  = 0;
  limit = 25;
  loading    = false;
  refreshing = false;
  exporting  = false;
  error: string | null = null;

  private searchTimer: any;
  private lastLoadedEntityId: string | null = null;

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }

  constructor() {
    effect(() => {
      const id = this.currentEntity.currentEntity()?.id ?? null;
      if (id === this.lastLoadedEntityId) return;
      this.lastLoadedEntityId = id;
      untracked(() => this.load());
    });
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

  private fetch(params: HttpParams, headers: HttpHeaders) {
    const entity = this.currentEntity.currentEntity();
    return this.http.get<{ participants: Participant[]; total: number }>(
      `${environment.apiUrl}/api/registrations/entity/${entity?.id}`,
      { headers, params },
    );
  }

  load(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) { this.error = 'לא נמצאה ישות'; return; }

    if (this.participants.length === 0) this.loading = true;
    else this.refreshing = true;
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });

    let params = new HttpParams()
      .set('page',  String(this.page))
      .set('limit', String(this.limit));
    if (this.searchQuery.trim()) params = params.set('search', this.searchQuery.trim());

    this.fetch(params, headers).subscribe({
      next: (res) => {
        this.participants = res.participants ?? [];
        this.total         = res.total ?? 0;
        this.loading    = false;
        this.refreshing = false;
        this.loader.hide();
      },
      error: (err) => {
        console.error('registrations load error', err.status, err.error);
        this.error      = err.error?.error || err.error?.message || `שגיאה בטעינה (${err.status})`;
        this.loading    = false;
        this.refreshing = false;
        this.loader.hide();
      },
    });
  }

  exportCsv(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) return;

    this.exporting = true;
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    let params = new HttpParams().set('page', '0').set('limit', '10000');
    if (this.searchQuery.trim()) params = params.set('search', this.searchQuery.trim());

    this.fetch(params, headers).subscribe({
      next: (res) => {
        this.downloadCsv(res.participants ?? []);
        this.exporting = false;
      },
      error: (err) => {
        console.error('registrations export error', err.status, err.error);
        this.exporting = false;
      },
    });
  }

  private downloadCsv(rows: Participant[]): void {
    const headerRow = ['משתתף', 'מסלול', 'מידת חולצה', 'קמפיין', 'סטטוס תשלום'];
    const csvRows = rows.map(p => [
      p.name,
      p.option_title ?? '',
      p.shirt_size ?? '',
      p.campaign_title,
      this.statusLabel(p.payment_status),
    ]);

    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headerRow, ...csvRows].map(row => row.map(escape).join(',')).join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `הרשמות-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  statusLabel(s: string): string {
    return s === 'paid' ? 'שולם' : s === 'failed' ? 'נכשל' : 'ממתין';
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
}
