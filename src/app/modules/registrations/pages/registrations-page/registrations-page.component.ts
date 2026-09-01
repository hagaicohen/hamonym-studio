import { Component, inject, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { CampaignApiService } from '../../../campaigns/services/campaign-api.service';
import { RegistrationOption } from '../../../campaigns/services/campaign-studio-state.service';
import { CampaignManagementSidebarComponent } from '../../../campaigns/shared/components/campaign-management-sidebar/campaign-management-sidebar.component';

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

type ManualSource = 'bank_transfer' | 'check' | 'cash' | 'other';

interface ImportRow {
  participantName: string;
  categoryTitle: string;
  shirtSize: string;
  valid: boolean;
  error?: string;
  // Idempotency key (Donation Engine closure WP5, 2026-08-31) — generated
  // once per row when the file is parsed, not per submit attempt, so a
  // retried/duplicate-clicked import resends the SAME key per row and the
  // backend's client_submission_key uniqueness (same mechanism as manual
  // donations, migration 056) can tell "same row, retried" apart from
  // "a genuinely new row" without relying on name/category matching.
  clientSubmissionKey: string;
}

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// Registration Management (MVP) — the "day after registration opens" screen:
// see who registered, search them, export them. Deliberately just this —
// no QR/check-in/bib numbers until there's a real need for them (see
// docs/DECISIONS.md, 2026-07-15).
@Component({
  selector: 'app-registrations-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CampaignManagementSidebarComponent],
  templateUrl: './registrations-page.component.html',
  styleUrl: './registrations-page.component.css',
})
export class RegistrationsPageComponent {
  private http          = inject(HttpClient);
  private currentEntity = inject(CurrentEntityService);
  private loader        = inject(AppLoaderService);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private campaignApi    = inject(CampaignApiService);

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

  // Two entry points: /campaigns/:id/registrations (campaign-scoped — the
  // Workspace sidebar's own route, renders the Workspace shell/sidebar
  // below instead of the generic app layout) and /registrations?campaignId=
  // (entity-wide list, optionally pre-filtered). Whichever is present, the
  // filter/"add participant"/"import" behavior is identical — only the
  // surrounding chrome differs.
  campaignScoped = !!this.route.snapshot.paramMap.get('id');
  campaignId = this.route.snapshot.paramMap.get('id') || this.route.snapshot.queryParamMap.get('campaignId') || '';
  campaignTitle: string | null = null;
  isOngoing = false;
  registrationOptions: RegistrationOption[] = [];

  readonly sourceOptions: { value: ManualSource; label: string }[] = [
    { value: 'bank_transfer', label: 'העברה בנקאית' },
    { value: 'check',         label: 'צ\'ק' },
    { value: 'cash',          label: 'מזומן' },
    { value: 'other',         label: 'אחר' },
  ];
  readonly shirtSizes = SHIRT_SIZES;

  constructor() {
    // Campaign-scoped mode navigates in from the Workspace sidebar under the
    // '/campaigns'-prefixed self-hiding global loader — forceHide() (not
    // hide()) clears it immediately instead of waiting out hide()'s 600ms
    // minimum-visible window, since this page hands off to its own local
    // spinner (.reg-loading) right away. See campaign-ambassadors-page's
    // identical fix for the same "two spinners" bug.
    if (this.campaignScoped) this.loader.forceHide();

    effect(() => {
      const id = this.currentEntity.currentEntity()?.id ?? null;
      if (id === this.lastLoadedEntityId) return;
      this.lastLoadedEntityId = id;
      untracked(() => this.load());
    });

    if (this.campaignId) {
      this.campaignApi.getById(this.campaignId).subscribe({
        next: (draft) => {
          this.campaignTitle = draft.title;
          this.registrationOptions = draft.registrationOptions ?? [];
          this.isOngoing = draft.campaignLifecycle === 'ongoing';
        },
        error: () => { this.campaignTitle = 'קמפיין זה'; },
      });
    }
  }

  back(): void { this.router.navigate(['/campaigns', this.campaignId, 'dashboard']); }

  clearCampaignFilter(): void {
    this.campaignId    = '';
    this.campaignTitle = null;
    this.page = 0;
    this.load();
    this.router.navigate(['/registrations']);
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
    if (this.campaignId)         params = params.set('campaignId', this.campaignId);
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
    if (this.campaignId)         params = params.set('campaignId', this.campaignId);
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

  // ── Add participant ──
  showDrawer = false;
  saving = false;
  saveError: string | null = null;
  form = {
    participantName: '', registrationOptionId: '', shirtSize: '',
    payerName: '', payerEmail: '', payerPhone: '',
    source: 'bank_transfer' as ManualSource, note: '', declared: false,
  };
  // Idempotency key (Donation Engine closure WP5, 2026-08-31) — same pattern
  // as campaign-dashboard-finance.component.ts's manual-donation
  // clientSubmissionKey (F4.1): one UUID per drawer-open, sent with the
  // submit, regenerated only after a successful save. A double-click or a
  // retried request after a dropped response resends the SAME key, and the
  // backend can tell it's the same attempt instead of creating a second
  // paid registration.
  private clientSubmissionKey = '';

  openAdd(): void {
    this.form = {
      participantName: '', registrationOptionId: this.registrationOptions[0]?.id ?? '', shirtSize: '',
      payerName: '', payerEmail: '', payerPhone: '',
      source: 'bank_transfer', note: '', declared: false,
    };
    this.clientSubmissionKey = crypto.randomUUID();
    this.saveError = null;
    this.showDrawer = true;
  }

  closeDrawer(): void {
    if (this.saving) return;
    this.showDrawer = false;
  }

  get canSaveParticipant(): boolean {
    return !!this.form.participantName.trim() && !!this.form.registrationOptionId && this.form.declared && !this.saving;
  }

  saveParticipant(): void {
    if (!this.canSaveParticipant) return;
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id) return;

    this.saving = true;
    this.saveError = null;
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    const body = {
      campaignId:            this.campaignId,
      registrationOptionId:  this.form.registrationOptionId,
      participantName:       this.form.participantName.trim(),
      shirtSize:              this.form.shirtSize || null,
      payerName:              this.form.payerName.trim() || null,
      payerEmail:             this.form.payerEmail.trim() || null,
      payerPhone:             this.form.payerPhone.trim() || null,
      source:                 this.form.source,
      note:                   this.form.note.trim() || null,
      clientSubmissionKey:    this.clientSubmissionKey,
    };

    this.http.post(`${environment.apiUrl}/api/registrations/entity/${entity.id}/manual`, body, { headers }).subscribe({
      next: () => {
        this.saving = false;
        this.showDrawer = false;
        this.page = 0;
        this.load();
      },
      error: (err) => {
        this.saveError = err.error?.error || 'שגיאה בהוספת המשתתף';
        this.saving = false;
      },
    });
  }

  // ── Bulk import (.csv/.xlsx) — same shape as the Ambassadors importer:
  // parse → preview with per-row validation → confirm. Category column is
  // matched by title against this campaign's current registration options
  // (validated again server-side, this is just for a fast preview). ──
  showImportModal = false;
  importRows: ImportRow[] = [];
  importing = false;
  importSource: ManualSource = 'bank_transfer';

  get validImportCount():   number { return this.importRows.filter(r =>  r.valid).length; }
  get invalidImportCount(): number { return this.importRows.filter(r => !r.valid).length; }
  get availableCategoriesLabel(): string { return this.registrationOptions.map(o => o.title).join(', '); }

  openImport(): void {
    this.importRows = [];
    this.importSource = 'bank_transfer';
    this.showImportModal = true;
  }

  closeImport(): void {
    if (this.importing) return;
    this.showImportModal = false;
    this.importRows = [];
  }

  downloadTemplate(): void {
    const csv = 'שם משתתף,קטגוריה,מידת חולצה\nישראל ישראלי,5 ק"מ,M\n';
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'משתתפים-תבנית.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  private validateRow(participantName: string, categoryTitle: string, shirtSize: string): ImportRow {
    // clientSubmissionKey generated once here, at parse time, not at
    // confirmImport() time — so re-clicking "Import" after a dropped
    // response resends the SAME per-row keys instead of minting new ones
    // that would look like N brand-new registrations to the backend.
    const clientSubmissionKey = crypto.randomUUID();
    const validTitles = new Set(this.registrationOptions.map(o => o.title.trim().toLowerCase()));
    if (!participantName) return { participantName, categoryTitle, shirtSize, valid: false, error: 'שם חסר', clientSubmissionKey };
    if (!validTitles.has(categoryTitle.trim().toLowerCase())) {
      return { participantName, categoryTitle, shirtSize, valid: false, error: `קטגוריה לא נמצאה: "${categoryTitle}"`, clientSubmissionKey };
    }
    return { participantName, categoryTitle, shirtSize, valid: true, clientSubmissionKey };
  }

  onImportFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv') this.parseCSV(file);
    else               this.parseExcel(file);
    (event.target as HTMLInputElement).value = '';
  }

  private parseCSV(file: File): void {
    const reader = new FileReader();
    reader.onload = e => {
      const lines = ((e.target?.result as string) ?? '').split(/\r?\n/).filter(l => l.trim());
      this.importRows = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        return this.validateRow(cols[0] ?? '', cols[1] ?? '', cols[2] ?? '');
      });
    };
    reader.readAsText(file, 'UTF-8');
  }

  private async parseExcel(file: File): Promise<void> {
    const XLSX = await import('xlsx');
    const wb   = XLSX.read(await file.arrayBuffer());
    const raw: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    this.importRows = raw.slice(1).map(r => {
      const row = r as string[];
      return this.validateRow(String(row[0] ?? '').trim(), String(row[1] ?? '').trim(), String(row[2] ?? '').trim());
    });
  }

  confirmImport(): void {
    const entity = this.currentEntity.currentEntity();
    if (!entity?.id || !this.validImportCount || this.importing) return;

    this.importing = true;
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    const body = {
      campaignId: this.campaignId,
      source: this.importSource,
      rows: this.importRows.filter(r => r.valid),
    };

    this.http.post<{ created: number; errors: string[] }>(
      `${environment.apiUrl}/api/registrations/entity/${entity.id}/import`, body, { headers },
    ).subscribe({
      next: () => {
        this.importing = false;
        this.showImportModal = false;
        this.importRows = [];
        this.page = 0;
        this.load();
      },
      error: () => { this.importing = false; },
    });
  }
}
