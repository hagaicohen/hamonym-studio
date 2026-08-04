import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlatformService } from '../../services/platform.service';
import { ColumnPickerComponent, ColumnDef } from '../../components/column-picker/column-picker.component';

const COLUMNS: ColumnDef[] = [
  { key: 'entity',      label: 'עמותה' },
  { key: 'status',      label: 'סטטוס' },
  { key: 'raised',      label: 'גיוס' },
  { key: 'featured',    label: 'מומלץ' },
  { key: 'locked',      label: 'נעילה' },
  { key: 'created_at',  label: 'נוצר' },
];

interface Campaign {
  id: string;
  title: string;
  slug: string;
  status: string;
  current_amount: number;
  target_amount: number;
  supporters_count: number;
  is_featured: boolean;
  is_locked: boolean;
  deleted_at: string | null;
  created_at: string;
  entity_id: string;
  entity_name: string;
}

type SortField = 'title' | 'status' | 'created_at' | 'raised' | 'entity';
type SortDir = 'asc' | 'desc';

type ChipKey = 'all' | 'published' | 'paused' | 'draft' | 'ended' | 'featured' | 'deleted';

const CHIPS: { key: ChipKey; label: string; dot: string }[] = [
  { key: 'published', label: 'פעילים',   dot: '🟢' },
  { key: 'paused',    label: 'מושהים',   dot: '⚫' },
  { key: 'draft',     label: 'טיוטה',    dot: '🔵' },
  { key: 'ended',     label: 'הסתיימו',  dot: '⚪' },
  { key: 'featured',  label: 'מומלצים',  dot: '⭐' },
  { key: 'deleted',   label: 'נמחקו',    dot: '🗑️' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
  published: 'פעיל',
  paused: 'מושהה',
  ended: 'הסתיים',
};

const NOTES_REQUIRED_STATUSES = new Set(['paused', 'ended']);

type PendingActionType = 'status' | 'lock' | 'delete' | 'slug';

interface PendingAction {
  type: PendingActionType;
  campaign: Campaign;
  status?: string;
}

@Component({
  selector: 'app-platform-campaigns-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ColumnPickerComponent],
  templateUrl: './platform-campaigns-page.component.html',
  styleUrl: './platform-campaigns-page.component.css',
})
export class PlatformCampaignsPageComponent implements OnInit {
  private platformService = inject(PlatformService);

  readonly chips = CHIPS;
  readonly statusOptions = Object.keys(STATUS_LABELS);
  readonly columns = COLUMNS;
  visibleColumns = new Set(COLUMNS.map((c) => c.key));

  onVisibleColumnsChange(v: Set<string>): void {
    this.visibleColumns = v;
  }

  campaigns: Campaign[] = [];
  total = 0;
  page = 0;
  limit = 25;
  loading = false;
  refreshing = false;
  error: string | null = null;
  actionError: string | null = null;

  activeChip: ChipKey = 'all';
  searchQuery = '';
  sortField: SortField = 'created_at';
  sortDir: SortDir = 'desc';

  pendingAction: PendingAction | null = null;
  notesInput = '';
  noteRequiredError = false;
  actionInProgress = false;
  // Shown inside the modal itself (unlike actionError, which is a page-level
  // banner) — a failed action (e.g. a duplicate slug) used to silently close
  // the modal and rely on that banner alone, easy to miss and confusing
  // ("it just closes the popup"). Now the modal stays open with the reason.
  pendingActionError: string | null = null;

  slugInput = '';
  slugError: string | null = null;

  private searchTimer: any;

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (this.campaigns.length === 0) this.loading = true;
    else this.refreshing = true;

    const chipParams = this.chipToParams(this.activeChip);

    this.platformService
      .getCampaigns({
        search: this.searchQuery.trim() || undefined,
        sortBy: this.sortField,
        sortDir: this.sortDir,
        page: this.page,
        limit: this.limit,
        ...chipParams,
      })
      .subscribe({
        next: (res) => {
          this.campaigns = res.campaigns ?? [];
          this.total = res.total ?? 0;
          this.loading = false;
          this.refreshing = false;
        },
        error: (err) => {
          this.error = err.error?.error || 'שגיאה בטעינת הקמפיינים';
          this.loading = false;
          this.refreshing = false;
        },
      });
  }

  private chipToParams(chip: ChipKey): { status?: string; featuredOnly?: boolean; showDeleted?: boolean } {
    switch (chip) {
      case 'published': return { status: 'published' };
      case 'paused':    return { status: 'paused' };
      case 'draft':     return { status: 'draft' };
      case 'ended':     return { status: 'ended' };
      case 'featured':  return { featuredOnly: true };
      case 'deleted':   return { showDeleted: true };
      default:          return {};
    }
  }

  selectChip(chip: ChipKey): void {
    this.activeChip = this.activeChip === chip ? 'all' : chip;
    this.page = 0;
    this.load();
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page = 0; this.load(); }, 400);
  }

  sortBy(field: SortField): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'asc';
    }
    this.page = 0;
    this.load();
  }

  prevPage(): void { if (this.page > 0) { this.page--; this.load(); } }
  nextPage(): void { if (this.page < this.totalPages - 1) { this.page++; this.load(); } }

  statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  fmtMoney(n: number): string {
    return '₪' + Math.round(n || 0).toLocaleString('he-IL');
  }

  progressPct(campaign: Campaign): number {
    const target = Number(campaign.target_amount) || 0;
    if (target <= 0) return 0;
    const current = Number(campaign.current_amount) || 0;
    return Math.min(100, Math.round((current / target) * 100));
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  onStatusChange(campaign: Campaign, newStatus: string): void {
    this.actionError = null;
    if (newStatus === campaign.status) return;

    if (NOTES_REQUIRED_STATUSES.has(newStatus)) {
      this.pendingAction = { type: 'status', campaign, status: newStatus };
      this.notesInput = '';
      this.noteRequiredError = false;
      return;
    }

    this.applyStatus(campaign, newStatus);
  }

  private applyStatus(campaign: Campaign, status: string, notes?: string): void {
    this.actionInProgress = true;
    this.platformService.setCampaignStatus(campaign.id, status, notes).subscribe({
      next: () => { this.actionInProgress = false; this.pendingAction = null; this.load(); },
      error: (err) => {
        this.actionInProgress = false;
        this.actionError = err.error?.error || 'הפעולה נכשלה';
      },
    });
  }

  toggleFeatured(campaign: Campaign): void {
    this.actionError = null;
    this.actionInProgress = true;
    this.platformService.setCampaignFeatured(campaign.id, !campaign.is_featured).subscribe({
      next: () => { this.actionInProgress = false; this.load(); },
      error: (err) => {
        this.actionInProgress = false;
        this.actionError = err.error?.error || 'הפעולה נכשלה';
      },
    });
  }

  toggleLock(campaign: Campaign): void {
    this.actionError = null;
    if (!campaign.is_locked) {
      this.pendingAction = { type: 'lock', campaign };
      this.notesInput = '';
      this.noteRequiredError = false;
      return;
    }
    this.actionInProgress = true;
    this.platformService.setCampaignLocked(campaign.id, false).subscribe({
      next: () => { this.actionInProgress = false; this.load(); },
      error: (err) => {
        this.actionInProgress = false;
        this.actionError = err.error?.error || 'הפעולה נכשלה';
      },
    });
  }

  requestDelete(campaign: Campaign): void {
    this.actionError = null;
    this.pendingAction = { type: 'delete', campaign };
    this.notesInput = '';
    this.noteRequiredError = false;
  }

  restore(campaign: Campaign): void {
    this.actionError = null;
    this.actionInProgress = true;
    this.platformService.restoreCampaign(campaign.id).subscribe({
      next: () => { this.actionInProgress = false; this.load(); },
      error: (err) => {
        this.actionInProgress = false;
        this.actionError = err.error?.error || 'הפעולה נכשלה';
      },
    });
  }

  requestSlugChange(campaign: Campaign): void {
    this.actionError = null;
    this.pendingAction = { type: 'slug', campaign };
    this.notesInput = '';
    this.noteRequiredError = false;
    this.slugInput = campaign.slug;
    this.slugError = null;
  }

  duplicate(campaign: Campaign): void {
    this.actionError = null;
    this.actionInProgress = true;
    this.platformService.duplicateCampaign(campaign.id).subscribe({
      next: () => { this.actionInProgress = false; this.load(); },
      error: (err) => {
        this.actionInProgress = false;
        this.actionError = err.error?.error || 'הפעולה נכשלה';
      },
    });
  }

  cancelPendingAction(): void {
    this.pendingAction = null;
    this.notesInput = '';
    this.noteRequiredError = false;
    this.slugError = null;
    this.pendingActionError = null;
  }

  confirmPendingAction(): void {
    if (!this.pendingAction) return;
    const trimmedNotes = this.notesInput.trim();
    if (!trimmedNotes) {
      this.noteRequiredError = true;
      return;
    }

    const { type, campaign, status } = this.pendingAction;

    // Hebrew is a valid slug character here too — matches the regular
    // campaign editor's own slug field (campaign-basic-step's onSlugChange),
    // which already allows א-ת. This panel's stricter English-only regex was
    // inconsistent with that and rejected perfectly normal Hebrew URLs.
    if (type === 'slug' && !/^[a-z0-9א-ת-]+$/.test(this.slugInput.trim())) {
      this.slugError = 'כתובת לא תקינה — אותיות (עברית/לועזית קטנות), מספרים ומקפים בלבד';
      return;
    }

    this.actionInProgress = true;
    this.pendingActionError = null;
    this.slugError = null;

    const done = () => { this.actionInProgress = false; this.pendingAction = null; this.load(); };
    // A failed action (most commonly: the slug is already taken by another
    // campaign) used to silently close the modal here, leaving only a
    // page-level banner as the explanation — easy to miss, and looked like
    // "it just closes without letting me do anything". Now the modal stays
    // open with the real reason shown inline, so it can be corrected and
    // retried immediately.
    const fail = (err: any) => {
      this.actionInProgress = false;
      const message = err.error?.error || 'הפעולה נכשלה';
      if (type === 'slug') this.slugError = message;
      else this.pendingActionError = message;
    };

    if (type === 'status' && status) {
      this.platformService.setCampaignStatus(campaign.id, status, trimmedNotes).subscribe({ next: done, error: fail });
    } else if (type === 'lock') {
      this.platformService.setCampaignLocked(campaign.id, true, trimmedNotes).subscribe({ next: done, error: fail });
    } else if (type === 'delete') {
      this.platformService.deleteCampaign(campaign.id, trimmedNotes).subscribe({ next: done, error: fail });
    } else if (type === 'slug') {
      this.platformService.setCampaignSlug(campaign.id, this.slugInput.trim(), trimmedNotes).subscribe({ next: done, error: fail });
    }
  }

  pendingActionTitle(): string {
    if (!this.pendingAction) return '';
    switch (this.pendingAction.type) {
      case 'status': return `שינוי סטטוס ל"${this.statusLabel(this.pendingAction.status!)}"`;
      case 'lock': return 'נעילת קמפיין לעריכה';
      case 'delete': return 'מחיקת קמפיין';
      case 'slug': return 'שינוי כתובת URL של הקמפיין';
      default: return '';
    }
  }
}
