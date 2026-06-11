import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Users, Plus, Upload, Download, Search, Pencil, Trash2, X, CircleCheck } from 'lucide-angular';
import { CampaignStudioStateService, CampaignAmbassador } from '../../../services/campaign-studio-state.service';
import { AmbassadorService } from '../../../services/ambassador.service';

function nameToSlug(name: string): string {
  const map: Record<string, string> = {
    'א':'a','ב':'b','ג':'g','ד':'d','ה':'h','ו':'v','ז':'z','ח':'ch','ט':'t',
    'י':'y','כ':'k','ך':'k','ל':'l','מ':'m','ם':'m','נ':'n','ן':'n','ס':'s',
    'ע':'a','פ':'p','ף':'p','צ':'tz','ץ':'tz','ק':'k','ר':'r','ש':'sh','ת':'t',
  };
  return name.trim().split('').map(c => map[c] ?? (c === ' ' ? '-' : c.toLowerCase())).join('')
    .replace(/-+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 60);
}

function uniqueSlug(base: string, existing: CampaignAmbassador[], excludeId?: string): string {
  const others = existing.filter(a => a.id !== excludeId);
  let slug = base || 'ambassador';
  let i = 0;
  while (others.some(a => a.slug === (i === 0 ? slug : `${slug}-${i}`))) i++;
  return i === 0 ? slug : `${slug}-${i}`;
}

function formatWithCommas(n: number | null): string {
  return n != null ? n.toLocaleString('he-IL') : '';
}

function parseCommas(s: string): number | null {
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return isNaN(n) ? null : n;
}

interface FormModel {
  fullName: string;
  phone: string;
  email: string;
  goalAmount: number | null;
  personalMessage: string;
  slug: string;
  slugTouched: boolean;
}

interface ImportRow {
  fullName: string;
  phone: string;
  email: string;
  goalAmount: number | null;
  personalMessage: string;
  valid: boolean;
  error?: string;
}

const EMPTY_FORM: FormModel = {
  fullName: '', phone: '', email: '', goalAmount: null,
  personalMessage: '', slug: '', slugTouched: false,
};

@Component({
  selector: 'app-campaign-ambassadors-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './campaign-ambassadors-step.component.html',
  styleUrl: './campaign-ambassadors-step.component.css',
})
export class CampaignAmbassadorsStepComponent {
  private state = inject(CampaignStudioStateService);
  readonly svc  = inject(AmbassadorService);

  readonly UsersIcon    = Users;
  readonly PlusIcon     = Plus;
  readonly UploadIcon   = Upload;
  readonly DownloadIcon = Download;
  readonly SearchIcon   = Search;
  readonly EditIcon     = Pencil;
  readonly TrashIcon    = Trash2;
  readonly XIcon        = X;
  readonly CheckIcon    = CircleCheck;

  draft$ = this.state.draft$;

  searchQuery = '';
  showDrawer  = false;
  editingId: string | null = null;
  form: FormModel = { ...EMPTY_FORM };
  goalDisplay = '';

  slugStatus: 'idle' | 'checking' | 'valid' | 'invalid' = 'idle';
  slugError = '';
  private slugTimer: ReturnType<typeof setTimeout> | null = null;

  showImportModal = false;
  importRows: ImportRow[] = [];

  get ambassadors(): CampaignAmbassador[] {
    return this.state.draft.ambassadors ?? [];
  }

  get ambassadorsBlock() {
    return this.state.draft.blocks?.find(b => b.type === 'ambassadors') ?? null;
  }

  get ambassadorsVisible(): boolean {
    return this.ambassadorsBlock?.visible !== false;
  }

  toggleAmbassadorsVisible(): void {
    const block = this.ambassadorsBlock;
    if (!block) return;
    const blocks = this.state.draft.blocks.map(b =>
      b.id === block.id ? { ...b, visible: !b.visible } : b
    );
    this.state.patch({ blocks });
  }

  get filtered(): CampaignAmbassador[] {
    if (!this.searchQuery.trim()) return this.ambassadors;
    const q = this.searchQuery.toLowerCase();
    return this.ambassadors.filter(a =>
      a.fullName.toLowerCase().includes(q) ||
      (a.phone ?? '').includes(q) ||
      (a.email ?? '').toLowerCase().includes(q)
    );
  }

  get campaignSlug(): string { return this.state.draft.slug ?? ''; }
  get withGoalCount():      number { return this.ambassadors.filter(a => a.goalAmount != null).length; }
  get validImportCount():   number { return this.importRows.filter(r =>  r.valid).length; }
  get invalidImportCount(): number { return this.importRows.filter(r => !r.valid).length; }

  get canSave(): boolean {
    return !!this.form.fullName.trim() &&
      !!this.form.slug.trim() &&
      this.slugStatus === 'valid';
  }

  openAdd(): void {
    this.editingId   = null;
    this.form        = { ...EMPTY_FORM };
    this.goalDisplay = '';
    this.slugStatus  = 'idle';
    this.slugError   = '';
    this.showDrawer  = true;
  }

  openEdit(a: CampaignAmbassador): void {
    this.editingId   = a.id;
    this.form        = {
      fullName: a.fullName, phone: a.phone ?? '', email: a.email ?? '',
      goalAmount: a.goalAmount, personalMessage: a.personalMessage,
      slug: a.slug, slugTouched: true,
    };
    this.goalDisplay = formatWithCommas(a.goalAmount);
    this.slugStatus  = 'valid';
    this.slugError   = '';
    this.showDrawer  = true;
  }

  closeDrawer(): void {
    this.showDrawer = false;
    this.editingId  = null;
    if (this.slugTimer) clearTimeout(this.slugTimer);
  }

  onFullNameInput(): void {
    if (!this.form.slugTouched) {
      const suggested = uniqueSlug(nameToSlug(this.form.fullName), this.ambassadors, this.editingId ?? undefined);
      this.form.slug = suggested;
      this.triggerSlugValidation();
    }
  }

  onSlugInput(): void {
    this.form.slugTouched = true;
    this.form.slug = this.form.slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    this.triggerSlugValidation();
  }

  private triggerSlugValidation(): void {
    if (this.slugTimer) clearTimeout(this.slugTimer);
    const slug = this.form.slug.trim();
    if (!slug) { this.slugStatus = 'idle'; this.slugError = ''; return; }

    this.slugStatus = 'checking';
    this.slugTimer = setTimeout(() => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        this.slugStatus = 'invalid';
        this.slugError  = 'רק אותיות אנגלית, מספרים ומקפים';
        return;
      }
      const taken = this.ambassadors.some(a => a.slug === slug && a.id !== this.editingId);
      if (taken) {
        this.slugStatus = 'invalid';
        this.slugError  = 'הכינוי כבר תפוס';
        return;
      }
      this.slugStatus = 'valid';
      this.slugError  = '';
    }, 500);
  }

  save(): void {
    if (!this.canSave) return;
    const slug = this.form.slug.trim();

    if (this.editingId) {
      const updated = this.ambassadors.map(a =>
        a.id === this.editingId
          ? { ...a, fullName: this.form.fullName.trim(), phone: this.form.phone || null,
              email: this.form.email || null, goalAmount: this.form.goalAmount,
              personalMessage: this.form.personalMessage, slug }
          : a
      );
      this.state.patch({ ambassadors: updated });
    } else {
      const item: CampaignAmbassador = {
        id:              Math.random().toString(36).slice(2, 10),
        fullName:        this.form.fullName.trim(),
        phone:           this.form.phone   || null,
        email:           this.form.email   || null,
        goalAmount:      this.form.goalAmount,
        personalMessage: this.form.personalMessage,
        slug,
      };
      this.state.patch({ ambassadors: [...this.ambassadors, item] });
    }
    this.closeDrawer();
  }

  delete(id: string): void {
    if (!confirm('למחוק שגריר/ה זה?')) return;
    this.state.patch({ ambassadors: this.ambassadors.filter(a => a.id !== id) });
  }

  onGoalInput(event: Event): void {
    const raw    = (event.target as HTMLInputElement).value;
    const parsed = parseCommas(raw);
    this.form.goalAmount = parsed;
    const formatted = parsed != null ? parsed.toLocaleString('he-IL') : '';
    (event.target as HTMLInputElement).value = formatted;
    this.goalDisplay = formatted;
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
        const fullName = cols[0] ?? '';
        return {
          fullName, phone: cols[1] ?? '', email: cols[2] ?? '',
          goalAmount: cols[3] ? parseCommas(cols[3]) : null,
          personalMessage: '',
          valid: fullName.length > 0,
          error: fullName ? undefined : 'שם חסר',
        };
      });
      this.showImportModal = true;
    };
    reader.readAsText(file, 'UTF-8');
  }

  private async parseExcel(file: File): Promise<void> {
    const XLSX  = await import('xlsx');
    const wb    = XLSX.read(await file.arrayBuffer());
    const raw: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    this.importRows = raw.slice(1).map(r => {
      const row = r as string[];
      const fullName = String(row[0] ?? '').trim();
      return {
        fullName, phone: String(row[1] ?? '').trim(), email: String(row[2] ?? '').trim(),
        goalAmount: row[3] ? parseCommas(String(row[3])) : null,
        personalMessage: '',
        valid: fullName.length > 0,
        error: fullName ? undefined : 'שם חסר',
      };
    });
    this.showImportModal = true;
  }

  confirmImport(): void {
    const newItems: CampaignAmbassador[] = this.importRows
      .filter(r => r.valid)
      .map(r => ({
        id:              Math.random().toString(36).slice(2, 10),
        fullName:        r.fullName.trim(),
        phone:           r.phone  || null,
        email:           r.email  || null,
        goalAmount:      r.goalAmount,
        personalMessage: '',
        slug:            uniqueSlug(nameToSlug(r.fullName), this.ambassadors),
      }));
    this.state.patch({ ambassadors: [...this.ambassadors, ...newItems] });
    this.closeImport();
  }

  closeImport(): void { this.showImportModal = false; this.importRows = []; }

  formatMoney(n: number | null): string {
    if (!n) return '—';
    return '₪' + n.toLocaleString('he-IL');
  }

  downloadTemplate(): void { this.svc.downloadTemplate(); }
}
