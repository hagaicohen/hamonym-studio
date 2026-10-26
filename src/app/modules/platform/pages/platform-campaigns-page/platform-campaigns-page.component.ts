import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PlatformService } from '../../services/platform.service';
import { ColumnPickerComponent, ColumnDef } from '../../components/column-picker/column-picker.component';
import { AdminDetailsDrawerComponent } from '../../components/admin-details-drawer/admin-details-drawer.component';
import { israelDate, shekels } from '../../utils/admin-display';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { Subscription } from 'rxjs';
import { EntityComboboxComponent } from '../../components/entity-combobox/entity-combobox.component';

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
  end_date?: string | null;
  entity_id: string;
  entity_name: string;
}

type SortField = 'title' | 'status' | 'created_at' | 'raised' | 'entity' | 'progress' | 'end_date';
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


type PendingActionType = 'status' | 'lock' | 'delete' | 'slug' | 'duplicate';

interface PendingAction {
  type: PendingActionType;
  campaign: Campaign;
  status?: string;
}

@Component({
  selector: 'app-platform-campaigns-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ColumnPickerComponent, RouterLink, AdminDetailsDrawerComponent, EntityComboboxComponent],
  templateUrl: './platform-campaigns-page.component.html',
  styleUrl: './platform-campaigns-page.component.css',
})
export class PlatformCampaignsPageComponent implements OnInit, OnDestroy {
  private platformService = inject(PlatformService);
  private route = inject(ActivatedRoute);
  readonly context = inject(CurrentContextService);
  selectedCampaign: Campaign | null = null;
  campaignDetail: any = null;
  detailLoading = false;
  detailError: string | null = null;
  feedback: string | null = null;
  entityFilter = '';
  advancedListAvailable = false;
  dateFrom = '';
  dateTo = '';
  organizationOptions: { id: string; name: string }[] = [];
  organizationOptionsError: string | null = null;
  private optionsRequest?: Subscription;
  loadOrganizationOptions(): void {
    this.organizationOptionsError = null;
    this.optionsRequest?.unsubscribe();
    this.optionsRequest = this.platformService.getOrganizationFilterOptions().subscribe({ next: options => { this.organizationOptions = options; }, error: () => { this.organizationOptionsError = 'לא ניתן לטעון את העמותות לסינון.'; } });
  }
  private request?: Subscription;
  private detailRequest?: Subscription;
  private requestId = 0;
  get hasFilters(): boolean { return this.activeChip !== 'all' || !!this.searchQuery.trim() || !!this.entityFilter || !!this.dateFrom || !!this.dateTo; }
  clearFilters(): void { this.activeChip = 'all'; this.searchQuery = ''; this.entityFilter = ''; this.dateFrom = ''; this.dateTo = ''; this.page = 0; this.load(); }
  ngOnDestroy(): void { clearTimeout(this.searchTimer); this.requestId++; this.request?.unsubscribe(); this.detailRequest?.unsubscribe(); this.optionsRequest?.unsubscribe(); }
  openCampaign(campaign: Campaign): void {
    this.detailRequest?.unsubscribe();
    this.selectedCampaign = campaign; this.campaignDetail = null; this.detailError = null; this.detailLoading = true;
    this.detailRequest = this.platformService.getCampaign(campaign.id).subscribe({
      next: res => { if (this.selectedCampaign?.id !== campaign.id) return; this.campaignDetail = res.campaign; this.detailLoading = false; },
      error: () => { if (this.selectedCampaign?.id !== campaign.id) return; this.detailError = 'לא ניתן לטעון את פרטי הקמפיין.'; this.detailLoading = false; },
    });
  }
  closeCampaign(): void { this.detailRequest?.unsubscribe(); this.selectedCampaign = null; }
  campaignUrl(campaign: Campaign): string { return `${window.location.origin}/campaigns/${encodeURIComponent(campaign.slug)}`; }
  async copyCampaignLink(campaign: Campaign): Promise<void> {
    try { await navigator.clipboard.writeText(this.campaignUrl(campaign)); this.feedback = 'הקישור הועתק'; }
    catch { this.actionError = 'לא ניתן להעתיק את הקישור. אפשר לפתוח את עמוד התרומה ולהעתיק את כתובתו.'; }
  }

  readonly chips = CHIPS;
  readonly statusOptions = Object.keys(STATUS_LABELS);

  availableStatuses(campaign: Campaign): string[] {
    if (campaign.deleted_at || !this.context.hasPlatformSection('campaigns')) return [];
    return this.statusOptions.filter(status => status !== campaign.status);
  }
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
  get pendingActionRequiresNote(): boolean {
    return !!this.pendingAction && (this.pendingAction.type === 'status' ? ['paused', 'ended'].includes(this.pendingAction.status || '') : this.pendingAction.type !== 'duplicate');
  }
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
    const params = this.route.snapshot.queryParamMap;
    this.searchQuery = params.get('search') || '';
    this.entityFilter = params.get('entityId') || '';
    if (this.context.hasPlatformSection('organizations')) this.loadOrganizationOptions();
    const campaignId = params.get('campaignId');
    if (campaignId && /^[0-9a-f-]{36}$/i.test(campaignId)) {
      this.detailLoading = true;
      this.detailRequest = this.platformService.getCampaign(campaignId).subscribe({
        next: res => { this.selectedCampaign = res.campaign; this.campaignDetail = res.campaign; this.detailLoading = false; },
        error: () => { this.detailLoading = false; this.actionError = 'הקמפיין המבוקש אינו זמין או שאין הרשאה לצפות בו.'; },
      });
    }
    const status = params.get('status');
    if (status && Object.hasOwn(STATUS_LABELS, status)) this.activeChip = status as ChipKey;
    this.load();
  }

  load(): void {
    clearTimeout(this.searchTimer); this.request?.unsubscribe();
    const requestId = ++this.requestId;
    this.error = null;
    if (this.dateFrom && this.dateTo && this.dateFrom > this.dateTo) { this.error = 'תאריך ההתחלה חייב להיות מוקדם מתאריך הסיום.'; this.loading = false; this.refreshing = false; return; }
    if (this.campaigns.length === 0) this.loading = true;
    else this.refreshing = true;

    const chipParams = this.chipToParams(this.activeChip);

    this.request = this.platformService
      .getCampaigns({
        search: this.searchQuery.trim() || undefined,
        entityId: this.entityFilter || undefined,
        dateFrom: this.dateFrom || undefined,
        dateTo: this.dateTo || undefined,
        sortBy: this.sortField,
        sortDir: this.sortDir,
        page: this.page,
        limit: this.limit,
        ...chipParams,
      })
      .subscribe({
        next: (res) => {
          if (requestId !== this.requestId) return;
          if ((this.dateFrom || this.dateTo || this.sortField === 'progress' || this.sortField === 'end_date') && res.adminListVersion !== 1) { this.error = 'נדרשת גרסת שרת תואמת לסינון ולמיון שנבחרו.'; this.loading = false; this.refreshing = false; return; }
          this.advancedListAvailable = res.adminListVersion === 1;
          this.campaigns = res.campaigns ?? [];
          this.total = res.total ?? 0;
          this.loading = false;
          this.refreshing = false;
        },
        error: (err) => {
          if (requestId !== this.requestId) return;
          this.error = 'לא ניתן לטעון את הקמפיינים. נסה שוב.';
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
    return shekels(n);
  }

  progressPct(campaign: Campaign): number {
    const target = Number(campaign.target_amount) || 0;
    if (target <= 0) return 0;
    const current = Number(campaign.current_amount) || 0;
    return Math.max(0, Math.round((current / target) * 100));
  }

  fmtDate(iso: string | null): string {
    return israelDate(iso);
  }

  onStatusChange(campaign: Campaign, newStatus: string): void {
    this.actionError = null;
    if (newStatus === campaign.status || this.actionInProgress || !Object.hasOwn(STATUS_LABELS, newStatus)) return;

    if (Object.hasOwn(STATUS_LABELS, newStatus)) {
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
    if (this.actionInProgress) return;
    this.pendingAction = { type: 'duplicate', campaign };
    this.notesInput = ''; this.noteRequiredError = false; this.pendingActionError = null;
  }

  cancelPendingAction(): void {
    if (this.actionInProgress) return;
    this.pendingAction = null;
    this.notesInput = '';
    this.noteRequiredError = false;
    this.slugError = null;
    this.pendingActionError = null;
  }

  confirmPendingAction(): void {
    if (!this.pendingAction || this.actionInProgress) return;
    const trimmedNotes = this.notesInput.trim();
    if (!trimmedNotes && this.pendingActionRequiresNote) {
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
    } else if (type === 'duplicate') {
      this.platformService.duplicateCampaign(campaign.id, trimmedNotes).subscribe({ next: done, error: fail });
    }
  }

  pendingActionTitle(): string {
    if (!this.pendingAction) return '';
    switch (this.pendingAction.type) {
      case 'status': return `שינוי סטטוס ל"${this.statusLabel(this.pendingAction.status!)}"`;
      case 'lock': return 'נעילת קמפיין לעריכה';
      case 'delete': return 'מחיקת קמפיין';
      case 'slug': return 'שינוי כתובת URL של הקמפיין';
      case 'duplicate': return 'שכפול קמפיין לטיוטה חדשה';
      default: return '';
    }
  }
}
