import { AmbassadorFormDrawerComponent } from '../../shared/components/ambassador-form-drawer.component';
import { AmbassadorFormFieldsComponent, DEFAULT_AMBASSADOR_SLOGAN } from '../../shared/components/ambassador-form-fields.component';
import { DropdownComponent, DropdownOptionComponent } from '../../../../shared/ui/dropdown/dropdown.component';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideAngularModule,
  Users, Eye, EyeOff, Trash2, ChevronRight, Plus, Upload, Download, X, Pencil,
} from 'lucide-angular';
import { AmbassadorService, Ambassador, AmbassadorFormData, ImportRow } from '../../services/ambassador.service';
import { CampaignApiService } from '../../services/campaign-api.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';


import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';
function parseCommas(s: string): number | null {
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return isNaN(n) ? null : n;
}

// Excel stores a plain-digits phone column as a number, which drops the
// leading 0 (e.g. "0501234567" → 501234567). Only touches pure-digit values
// so an already-correct number, or one with a +972/dash format, is untouched.
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed && /^\d+$/.test(trimmed) && !trimmed.startsWith('0')) {
    return '0' + trimmed;
  }
  return trimmed;
}

const EMPTY_FORM: AmbassadorFormData = {
  fullName: '', phone: '', email: '', goalAmount: null, personalMessage: DEFAULT_AMBASSADOR_SLOGAN, personalTitle: '', slug: '',
};

@Component({
  selector: 'app-campaign-ambassadors-page',
  standalone: true,
  imports: [AmbassadorFormDrawerComponent, AmbassadorFormFieldsComponent, DropdownComponent, DropdownOptionComponent, HmIconComponent, CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './campaign-ambassadors-page.component.html',
  styleUrls: ['./campaign-ambassadors-page.component.css'],
})
export class CampaignAmbassadorsPageComponent implements OnInit {
  private route        = inject(ActivatedRoute);
  private router       = inject(Router);
  private ambassadorSvc = inject(AmbassadorService);
  private campaignApi  = inject(CampaignApiService);
  private loader       = inject(AppLoaderService);

  readonly UsersIcon   = Users;
  readonly EyeIcon     = Eye;
  readonly EyeOffIcon  = EyeOff;
  readonly TrashIcon   = Trash2;
  readonly BackIcon    = ChevronRight;
  readonly PlusIcon    = Plus;
  readonly UploadIcon  = Upload;
  readonly DownloadIcon = Download;
  readonly XIcon       = X;
  readonly EditIcon    = Pencil;

  campaignId    = '';
  campaignTitle = '';
  campaignSlug  = '';
  campaignTargetAmount = 0;
  isOngoing = false;
  ambassadors: Ambassador[] = [];
  isLoading = true;
  search = '';
  statusFilter = '';
  sortKey: 'name' | 'goal' | 'raised' = 'name';
  descending = false;

  sortBy(key: 'name' | 'goal' | 'raised'): void {
    this.descending = key === this.sortKey ? !this.descending : false;
    this.sortKey = key;
    this.page = 0;
  }

  exportCsv(): void {
    const escape = (value: string | number | null): string => {
      const raw = String(value ?? '');
      const safe = /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
      return '"' + safe.replace(/"/g, '""') + '"';
    };
    const rows = this.filteredAmbassadors.map(row => [row.fullName, row.goalAmount, row.raisedTotal, row.donorCount, row.status]);
    const csv = [['שגריר', 'יעד גיוס', 'גויס', 'תורמים', 'סטטוס'], ...rows]
      .map(row => row.map(escape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.download = 'campaign-ambassadors.csv';
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  page = 0;
  readonly pageSize = 25;
  readonly selectedIds = new Set<string>();
  bulkAction: 'pause' | 'remove' | null = null;
  bulkSaving = false;
  actionReason = '';
  loadError = '';
  actionTarget: Ambassador | null = null;
  photoUploading = false;
  actionMessage = '';
  bulkProgressMessage = '';
  bulkResultError = false;

  get filteredAmbassadors(): Ambassador[] {
    const text = this.search.trim().toLowerCase();
    const matches = this.ambassadors.filter(row =>
      (!this.statusFilter || row.status === this.statusFilter)
      && [row.fullName, row.email, row.phone, row.slug].some(value => value?.toLowerCase().includes(text)),
    );
    return matches.sort((a, b) => {
      let comparison = a.fullName.localeCompare(b.fullName, 'he');
      if (this.sortKey === 'goal') comparison = (a.goalAmount ?? 0) - (b.goalAmount ?? 0);
      if (this.sortKey === 'raised') comparison = a.raisedTotal - b.raisedTotal;
      return this.descending ? -comparison : comparison;
    });
  }

  get pageRows(): Ambassador[] {
    return this.filteredAmbassadors.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get selectableAmbassadors(): Ambassador[] {
    return this.filteredAmbassadors.filter(row => row.status === 'active');
  }

  toggleSelectAll(rows: Ambassador[], checked: boolean): void {
    if (this.bulkSaving) return;
    for (const row of rows) {
      if (checked) this.selectedIds.add(row.id);
      else this.selectedIds.delete(row.id);
    }
  }

  resetFilters(): void {
    this.page = 0;
    this.selectedIds.clear();
    this.bulkAction = null;
    this.actionTarget = null;
  }

  toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
  }

  async applyBulkAction(): Promise<void> {
    const action = this.bulkAction;
    const reason = this.actionReason.trim();
    if (!action || !reason || this.bulkSaving) return;
    const targetId = this.actionTarget?.id;
    const rows = this.ambassadors.filter(row =>
      targetId ? row.id === targetId : row.status === 'active' && this.selectedIds.has(row.id)
    );
    if (!rows.length) return;
    this.actionMessage = '';
    this.bulkResultError = false;
    this.bulkProgressMessage = action === 'remove' ? 'מסיר את השגרירים שנבחרו…' : 'משהה את השגרירים שנבחרו…';
    this.bulkSaving = true;
    this.cancelStatusAction();
    let removed = 0;
    let paused = 0;
    let failed = 0;
    let removalUnavailable = false;
    let removalBlocked = false;
    for (const row of rows) {
      try {
        if (action === 'remove') {
          await firstValueFrom(this.ambassadorSvc.archive(row.id, reason));
          this.ambassadors = this.ambassadors.filter(item => item.id !== row.id);
          removed++;
        } else {
          const updated = await firstValueFrom(this.ambassadorSvc.setStatus(row.id, 'inactive', reason));
          this.ambassadors = this.ambassadors.map(item => item.id === row.id ? updated : item);
          paused++;
        }
      } catch (error) {
        const failure = error as { status?: number };
        if (action === 'remove' && failure.status === 404) removalUnavailable = true;
        if (action === 'remove' && failure.status === 409) removalBlocked = true;
        failed++;
      }
    }
    this.bulkProgressMessage = '';
    this.bulkResultError = failed > 0;
    this.actionMessage = [removed ? `הוסרו ${removed} שגרירים בהצלחה` : '',
      paused ? `הושהו ${paused} שגרירים` : '', failed ? `${failed} פעולות נכשלו` : '',
      removalUnavailable ? 'נתיב ההסרה עדיין אינו זמין בשרת.' : ''].filter(Boolean).join(' · ');
    this.resetFilters();
    this.bulkSaving = false;
  }

  get editedAmbassador(): Ambassador | undefined {
    return this.ambassadors.find(row => row.id === this.editingId);
  }

  publicPath(row: Ambassador): string {
    return `/campaigns/${encodeURIComponent(this.campaignSlug)}/${encodeURIComponent(row.slug)}`;
  }

  async copyPublicLink(row: Ambassador): Promise<void> {
    try {
      await navigator.clipboard.writeText(new URL(this.publicPath(row), window.location.origin).href);
      this.actionMessage = 'הקישור הועתק';
    } catch {
      this.actionMessage = 'העתקת הקישור נכשלה';
    }
  }
  togglingId: string | null = null;

  // ── Add ambassador ──
  showDrawer = false;
  form: AmbassadorFormData = { ...EMPTY_FORM };
  private initialForm = '';
  saving = false;
  saveError: string | null = null;
  // Gates save() alongside fullName — same pattern as the self-registration
  // modal's joinSlugAvailable. true-by-default in edit mode because the
  // slug field component itself optimistically confirms a pre-existing
  // value on first change (see AmbassadorSlugFieldComponent#ngOnChanges).
  slugAvailable = false;

  // ── Bulk import (.csv/.xlsx) — same parsing shape as the Builder's own
  // campaign-ambassadors-step, but wired to the real backend (create/
  // importBulk) instead of the local draft, since this page persists
  // immediately like the rest of the Workspace. Slugs are generated
  // server-side (see ambassadors.service.js#uniqueSlug), so no slug field
  // is needed here at all. ──
  showImportModal = false;
  importRows: ImportRow[] = [];
  importing = false;

  get validImportCount():   number { return this.importRows.filter(r =>  r.valid).length; }
  get invalidImportCount(): number { return this.importRows.filter(r => !r.valid).length; }

  ngOnInit(): void {
    // The global self-hiding loader (app.component.ts) shows on every
    // '/campaigns'-prefixed navigation and waits for THIS page to hide it.
    // forceHide() (not hide()) — hide() enforces a 600ms minimum-visible
    // window to avoid flicker on fast operations, which still overlapped
    // with the local spinner below for the whole ambassadors-list fetch
    // (the "two spinners" bug); forceHide() clears it immediately since
    // we're deliberately handing off to that local spinner right now.
    this.loader.forceHide();
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    this.campaignApi.getById(this.campaignId).subscribe({
      next: (c) => {
        this.campaignTitle = c.title;
        this.campaignSlug  = c.slug;
        this.campaignTargetAmount = c.targetAmount ?? 0;
        this.isOngoing = c.campaignLifecycle === 'ongoing';
      },
      error: () => {},
    });
    this.loadAmbassadors();
  }

  loadAmbassadors(): void {
    this.isLoading = true;
    this.ambassadorSvc.list(this.campaignId).subscribe({
      next: (list) => { this.ambassadors = list; this.isLoading = false; },
      error: () => { this.isLoading = false; this.loadError = 'טעינת השגרירים נכשלה'; },
    });
  }

  get stats() { return this.ambassadorSvc.computeStats(this.ambassadors); }
  get hiddenCount(): number { return this.ambassadors.filter(a => a.status === 'inactive').length; }

  toggleStatus(a: Ambassador): void {
    if (this.togglingId || this.bulkSaving) return;
    if (a.status === 'active') {
      this.openStatusAction('pause', a);
      return;
    }
    this.changeStatus(a, 'active');
  }

  openStatusAction(action: 'pause' | 'remove', target: Ambassador | null = null): void {
    if (this.bulkSaving || this.togglingId) return;
    this.actionReason = '';
    this.actionMessage = '';
    this.actionTarget = target;
    this.bulkAction = action;
  }

  cancelStatusAction(): void {
    this.bulkAction = null;
    this.actionTarget = null;
  }

  private changeStatus(a: Ambassador, status: 'active' | 'inactive', reason?: string): void {
    this.actionMessage = '';
    this.bulkResultError = false;
    this.togglingId = a.id;
    this.ambassadorSvc.setStatus(a.id, status, reason).subscribe({
      next: (updated) => {
        const i = this.ambassadors.findIndex(x => x.id === updated.id);
        if (i !== -1) this.ambassadors = [
          ...this.ambassadors.slice(0, i),
          updated,
          ...this.ambassadors.slice(i + 1),
        ];
        if (status === 'active') this.actionMessage = 'השגריר הופעל מחדש';
        this.togglingId = null;
      },
      error: err => { this.togglingId = null; this.bulkResultError = true; this.actionMessage = err?.error?.error || 'שינוי הסטטוס נכשל'; },
    });
  }

  back(): void { this.router.navigate(['/campaigns', this.campaignId, 'dashboard']); }

  fmtMoney(n: number): string { return '₪' + n.toLocaleString('he-IL'); }
  initials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  progressPct(a: Ambassador): number {
    if (!a.goalAmount) return 0;
    return Math.round((a.raisedTotal / a.goalAmount) * 100);
  }

  // ── Add / edit ambassador — same drawer form for both; editingId set
  // means save() calls update() instead of create(). ──
  editingId: string | null = null;

  openAdd(): void {
    this.editingId = null;
    this.form = { ...EMPTY_FORM };
    this.slugAvailable = false;
    this.saveError = null;
    this.initialForm = JSON.stringify(this.form);
    this.showDrawer = true;
  }

  openEdit(a: Ambassador): void {
    this.editingId = a.id;
    this.form = {
      fullName: a.fullName, phone: a.phone ?? '', email: a.email ?? '',
      goalAmount: a.goalAmount, personalMessage: a.personalMessage || DEFAULT_AMBASSADOR_SLOGAN, personalTitle: a.personalTitle,
      slug: a.slug,
    };
    // The slug field component optimistically confirms a non-empty
    // pre-existing value as available on its first change, so this is
    // the normal case rather than a race — see ngOnChanges there.
    this.slugAvailable = true;
    this.saveError = null;
    this.initialForm = JSON.stringify(this.form);
    this.showDrawer = true;
  }

  goalAboveCampaignGoal(): boolean {
    return !!this.form.goalAmount && this.campaignTargetAmount > 0 && this.form.goalAmount > this.campaignTargetAmount;
  }

  closeDrawer(): void {
    if (this.saving || this.photoUploading) return;
    if (this.initialForm !== JSON.stringify(this.form) && !window.confirm('לצאת בלי לשמור את השינויים?')) return;
    this.showDrawer = false;
  }

  get canSaveAmbassador(): boolean {
    return !!this.form.fullName.trim() && !this.saving && !this.photoUploading && this.slugAvailable;
  }

  saveAmbassador(): void {
    if (!this.canSaveAmbassador) return;
    this.saving = true;
    this.saveError = null;
    const data = { ...this.form, fullName: this.form.fullName.trim() };

    if (this.editingId && data.slug === this.editedAmbassador?.slug) delete data.slug;

    const request$ = this.editingId
      ? this.ambassadorSvc.update(this.editingId, data)
      : this.ambassadorSvc.create(this.campaignId, data);

    request$.subscribe({
      next: (saved) => {
        if (this.editingId) {
          const i = this.ambassadors.findIndex(x => x.id === saved.id);
          if (i !== -1) this.ambassadors = [...this.ambassadors.slice(0, i), saved, ...this.ambassadors.slice(i + 1)];
        } else {
          this.ambassadors = [saved, ...this.ambassadors];
        }
        this.saving = false;
        this.showDrawer = false;
      },
      error: (err) => {
        this.saveError = err.error?.error || 'שגיאה בשמירת השגריר';
        this.saving = false;
      },
    });
  }

  // ── Bulk import ──
  openImport(): void {
    this.importRows = [];
    this.showImportModal = true;
  }

  closeImport(): void {
    if (this.importing) return;
    this.showImportModal = false;
    this.importRows = [];
  }

  downloadTemplate(): void { this.ambassadorSvc.downloadTemplate(); }

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
        const fullName = cols[0] ?? '';
        return {
          fullName, phone: normalizePhone(cols[1] ?? ''), email: cols[2] ?? '',
          goalAmount: cols[3] ? parseCommas(cols[3]) : null,
          valid: fullName.length > 0,
          error: fullName ? undefined : 'שם חסר',
        };
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
      const fullName = String(row[0] ?? '').trim();
      return {
        fullName, phone: normalizePhone(String(row[1] ?? '')), email: String(row[2] ?? '').trim(),
        goalAmount: row[3] ? parseCommas(String(row[3])) : null,
        valid: fullName.length > 0,
        error: fullName ? undefined : 'שם חסר',
      };
    });
  }

  confirmImport(): void {
    if (!this.validImportCount || this.importing) return;
    this.importing = true;
    this.ambassadorSvc.importBulk(this.campaignId, this.importRows).subscribe({
      next: () => {
        this.importing = false;
        this.showImportModal = false;
        this.importRows = [];
        this.loadAmbassadors();
      },
      error: () => { this.importing = false; },
    });
  }
}
