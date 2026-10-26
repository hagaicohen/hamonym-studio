import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PlatformService } from '../../services/platform.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { relativeTime } from '../../utils/relative-time';
import { ColumnPickerComponent, ColumnDef } from '../../components/column-picker/column-picker.component';

const COLUMNS: ColumnDef[] = [
  { key: 'status', label: 'סטטוס' }, { key: 'owner', label: 'מנהל' },
  { key: 'completion', label: 'השלמות מהותיות' }, { key: 'campaigns', label: 'קמפיינים' },
  { key: 'raised', label: 'סכום שגויס' },
  { key: 'activity', label: 'עדכון פרטים אחרון' },
];
interface Organization {
  id: string; display_name: string; legal_name: string | null; registration_number?: string | null;
  logo_url: string | null; status: string; created_at: string; updated_at: string;
  flagged_for_review: boolean; flagged_for_review_reason: string | null;
  profile_completion: number; missing_profile_fields?: string[];
  owner_name: string | null; owner_email: string | null;
  campaigns_count: number; active_campaigns_count?: number; total_raised: number;
}
type SortField = 'name' | 'status' | 'created_at' | 'campaigns' | 'raised' | 'activity';
type FilterKey = 'missing_docs' | 'flagged_for_review' | 'no_campaigns' | 'new_week';
const STATUS_LABELS: Record<string, string> = {
  draft: 'השלמת פרטים', pending_review: 'ממתין לאישור', active: 'פעיל',
  changes_requested: 'נדרשים תיקונים', rejected: 'נדחה', suspended: 'מושעה',
};
const STATUS_CHIPS = [
  { key: 'pending_review', label: 'ממתינות', dot: 'amber' }, { key: 'active', label: 'פעילות', dot: 'green' },
  { key: 'draft', label: 'השלמת פרטים', dot: 'gray' }, { key: 'changes_requested', label: 'נדרשים תיקונים', dot: 'amber' },
  { key: 'suspended', label: 'מושעות', dot: 'red' }, { key: 'rejected', label: 'נדחו', dot: 'red' },
];
const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'missing_docs', label: 'חסרות מסמכים' }, { key: 'flagged_for_review', label: 'דורשות בדיקה חוזרת' },
  { key: 'no_campaigns', label: 'ללא קמפיינים' }, { key: 'new_week', label: 'חדשות השבוע' },
];
const SORT_FIELDS: SortField[] = ['name', 'status', 'created_at', 'campaigns', 'raised', 'activity'];

@Component({
  selector: 'app-platform-organizations-page', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ColumnPickerComponent],
  templateUrl: './platform-organizations-page.component.html',
  styleUrl: './platform-organizations-page.component.css',
})
export class PlatformOrganizationsPageComponent implements OnInit, OnDestroy {
  private platformService = inject(PlatformService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  readonly context = inject(CurrentContextService);
  readonly statusChips = STATUS_CHIPS;
  readonly filterChips = FILTER_CHIPS;
  readonly columns = COLUMNS;
  visibleColumns = new Set(COLUMNS.map(c => c.key));
  organizations: Organization[] = [];
  total = 0;
  unfilteredTotal: number | null = null;
  page = 0;
  limit = 25;
  loading = false;
  refreshing = false;
  error: string | null = null;
  exportBusy = false;
  activeStatus = 'active';
  selectedFilters = new Set<FilterKey>();
  searchQuery = '';
  sortField: SortField = 'created_at';
  sortDir: 'asc' | 'desc' = 'desc';
  actionOrganization: Organization | null = null;
  menuPosition = { top: 0, right: 0 };
  private menuTrigger?: HTMLElement;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private request?: Subscription;
  private requestId = 0;

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }
  get extendedOrganizationDataAvailable(): boolean { return this.unfilteredTotal !== null; }
  get hasFilters(): boolean { return this.activeStatus !== 'all' || this.selectedFilters.size > 0 || !!this.searchQuery.trim(); }
  get visibleColumnCount(): number { return this.visibleColumns.size + 2; }
  get listQuery(): Record<string, string> {
    const query: Record<string, string> = { status: this.activeStatus, sortBy: this.sortField, sortDir: this.sortDir, page: String(this.page) };
    if (this.searchQuery.trim()) query['search'] = this.searchQuery.trim();
    if (this.selectedFilters.has('missing_docs')) query['missingDocs'] = '1';
    if (this.selectedFilters.has('flagged_for_review')) query['flaggedForReview'] = '1';
    if (this.selectedFilters.has('no_campaigns')) query['noCampaigns'] = '1';
    if (this.selectedFilters.has('new_week')) query['newSince'] = '7';
    return query;
  }

  private get readQuery(): Parameters<PlatformService['getOrganizations']>[0] {
    return {
      search: this.searchQuery.trim() || undefined, status: this.activeStatus === 'all' ? undefined : this.activeStatus,
      sortBy: this.sortField, sortDir: this.sortDir, page: this.page, limit: this.limit,
      missingDocs: this.selectedFilters.has('missing_docs') || undefined,
      flaggedForReview: this.selectedFilters.has('flagged_for_review') || undefined,
      noCampaigns: this.selectedFilters.has('no_campaigns') || undefined,
      newSince: this.selectedFilters.has('new_week') ? 7 : undefined,
    };
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const status = qp.get('status');
    if (status === 'all' || status && Object.hasOwn(STATUS_LABELS, status)) this.activeStatus = status;
    else if (status && FILTER_CHIPS.some(c => c.key === status)) { this.activeStatus = 'all'; this.selectedFilters.add(status as FilterKey); }
    for (const [param, key] of [['missingDocs', 'missing_docs'], ['flaggedForReview', 'flagged_for_review'], ['noCampaigns', 'no_campaigns']] as const) {
      if (['1', 'true'].includes(qp.get(param) || '')) {
        this.selectedFilters.add(key);
        if (!status) this.activeStatus = 'all';
      }
    }
    if (qp.get('newSince') === '7') { this.selectedFilters.add('new_week'); if (!status) this.activeStatus = 'all'; }
    this.searchQuery = qp.get('search') || '';
    const sort = qp.get('sortBy');
    if (SORT_FIELDS.includes(sort as SortField)) this.sortField = sort as SortField;
    if (qp.get('sortDir') === 'asc') this.sortDir = 'asc';
    const page = Number(qp.get('page') || 0);
    if (Number.isInteger(page) && page >= 0) this.page = page;
    this.load(false);
  }

  ngOnDestroy(): void { clearTimeout(this.searchTimer); this.requestId++; this.request?.unsubscribe(); }
  onVisibleColumnsChange(columns: Set<string>): void { this.visibleColumns = columns; }

  load(updateUrl = true): void {
    clearTimeout(this.searchTimer);
    this.request?.unsubscribe();
    const requestId = ++this.requestId;
    this.loading = this.organizations.length === 0;
    this.refreshing = !this.loading;
    this.error = null;
    this.actionOrganization = null;
    if (updateUrl) this.router.navigate([], { relativeTo: this.route, queryParams: this.listQuery, replaceUrl: true });
    this.request = this.platformService.getOrganizations(this.readQuery).subscribe({
      next: res => {
        if (requestId !== this.requestId) return;
        this.organizations = res.organizations ?? [];
        this.total = res.total ?? 0;
        this.unfilteredTotal = typeof res.unfilteredTotal === 'number' ? res.unfilteredTotal : null;
        // Older servers fall back to created_at for this new sort key.
        if (!this.extendedOrganizationDataAvailable && this.sortField === 'activity') this.sortField = 'created_at';
        this.loading = false; this.refreshing = false;
      },
      error: () => {
        if (requestId !== this.requestId) return;
        this.error = 'לא ניתן לטעון את העמותות. נסה שוב.';
        this.loading = false; this.refreshing = false;
      },
    });
  }

  selectStatus(status: string): void { this.activeStatus = status; this.page = 0; this.load(); }
  toggleFilter(key: FilterKey): void {
    if (this.selectedFilters.has(key)) this.selectedFilters.delete(key); else this.selectedFilters.add(key);
    this.page = 0; this.load();
  }
  clearFilters(): void { this.activeStatus = 'all'; this.selectedFilters.clear(); this.searchQuery = ''; this.page = 0; this.load(); }
  onSearch(): void { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.page = 0; this.load(); }, 400); }
  sortBy(field: SortField): void {
    this.sortDir = this.sortField === field && this.sortDir === 'asc' ? 'desc' : 'asc';
    this.sortField = field; this.page = 0; this.load();
  }
  sortAria(field: SortField): 'ascending' | 'descending' | 'none' {
    return this.sortField !== field ? 'none' : this.sortDir === 'asc' ? 'ascending' : 'descending';
  }
  sortMark(field: SortField): string { return this.sortField === field ? this.sortDir === 'asc' ? '↑' : '↓' : ''; }
  prevPage(): void { if (this.page > 0) { this.page--; this.load(); } }
  nextPage(): void { if (this.page + 1 < this.totalPages) { this.page++; this.load(); } }
  exportExcel(): void {
    if (this.exportBusy || this.loading || this.refreshing || !this.total) return;
    this.exportBusy = true;
    // Same filtered/sorted reader as the table; no financial export/job path.
    this.platformService.getOrganizations({ ...this.readQuery, page: 0, limit: this.total }).subscribe({
      next: async res => {
        try {
          const rows: Organization[] = res.organizations ?? [];
          if (rows.length !== res.total) throw new Error('Incomplete export');
          const XLSX = await import('xlsx');
          const sheet = XLSX.utils.json_to_sheet(rows.map(org => ({
            'שם העמותה': this.orgName(org), 'מספר עמותה': org.registration_number ?? '',
            'סטטוס': this.statusLabel(org.status), 'מנהל': org.owner_name ?? '',
            'השלמות חסרות': org.missing_profile_fields?.join(', ') ?? 'לא זמין',
            'קמפיינים פעילים': org.active_campaigns_count ?? 'לא זמין', 'סה״כ קמפיינים': org.campaigns_count,
            'סכום מצטבר שגויס': Number(org.total_raised), 'תאריך הרשמה': this.fmtDate(org.created_at),
            'עדכון פרטים אחרון': this.fmtDate(org.updated_at, true),
          })));
          const book = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(book, sheet, 'עמותות');
          XLSX.writeFile(book, 'עמותות.xlsx');
        } catch { this.error = 'לא ניתן להשלים את הייצוא. רענן את הרשימה ונסה שוב.'; }
        finally { this.exportBusy = false; }
      },
      error: () => { this.exportBusy = false; this.error = 'ייצוא העמותות נכשל. נסה שוב.'; },
    });
  }
  openOrganization(org: Organization): void { this.router.navigate(['/platform/organizations', org.id], { queryParams: this.listQuery }); }
  actionLabel(org: Organization): string {
    if (org.status === 'pending_review') return 'בדיקת הבקשה';
    if (org.flagged_for_review && org.status === 'active') return 'בדיקה חוזרת';
    if (org.status === 'draft' || org.status === 'changes_requested') return 'בדיקת השלמות';
    return 'צפייה בפרטים';
  }
  openActionMenu(org: Organization, event: MouseEvent): void {
    event.stopPropagation();
    if (this.actionOrganization?.id === org.id) { this.closeMenu(); return; }
    const trigger = event.currentTarget as HTMLElement, rect = trigger.getBoundingClientRect();
    this.menuTrigger = trigger;
    this.menuPosition = { top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 64)), right: Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - 208)) };
    this.actionOrganization = org;
  }
  @HostListener('document:click') closeMenu(): void { this.actionOrganization = null; }
  @HostListener('document:keydown.escape') escapeMenu(): void { if (this.actionOrganization) { this.closeMenu(); this.menuTrigger?.focus(); } }
  @HostListener('document:keydown.tab', ['$event']) focusMenuAction(event: KeyboardEvent): void {
    if (this.actionOrganization && !event.shiftKey && event.target === this.menuTrigger) {
      const action = document.getElementById('organization-row-action');
      if (action) { event.preventDefault(); action.focus(); }
    }
  }
  orgName(org: Organization): string { return org.display_name || org.legal_name || 'ללא שם'; }
  statusLabel(status: string): string { return STATUS_LABELS[status] || status; }
  relativeTime(iso: string): string { return relativeTime(iso); }
  fmtMoney(amount: number): string { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount); }
  fmtDate(iso: string | null, withTime = false): string {
    if (!iso || !Number.isFinite(new Date(iso).getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
    }).format(new Date(iso));
  }
}
