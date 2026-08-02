import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlatformService } from '../../services/platform.service';
import { relativeTime } from '../../utils/relative-time';
import { ColumnPickerComponent, ColumnDef } from '../../components/column-picker/column-picker.component';

const COLUMNS: ColumnDef[] = [
  { key: 'website',    label: 'אתר' },
  { key: 'owner',      label: 'מנהל' },
  { key: 'campaigns',  label: 'קמפיינים' },
  { key: 'created_at', label: 'תאריך הרשמה' },
  { key: 'activity',   label: 'פעילות אחרונה' },
  { key: 'hidden',     label: 'מוסתר' },
];

interface Partner {
  id: string;
  display_name: string;
  legal_name: string | null;
  logo_url: string | null;
  website: string | null;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  owner_name: string | null;
  owner_email: string | null;
  campaigns_count: number;
}

type SortField = 'name' | 'created_at' | 'campaigns';
type SortDir = 'asc' | 'desc';

// Partners never go through the nonprofit approval lifecycle (no status
// chips, no document/profile-completion columns) — see
// platform.service.js#getPartners. Rows are deliberately NOT clickable: the
// Partner Builder route is gated by requireEntityOwnership (user_entities
// membership), which most platform admins won't have — a click-through
// admin detail view is real future work, not built here (see
// PARTNER_DOMAIN_MODEL_ADR.md §14 for the "Partner Library owns manual
// management" split this respects).
@Component({
  selector: 'app-platform-partners-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ColumnPickerComponent],
  templateUrl: './platform-partners-page.component.html',
  styleUrl: './platform-partners-page.component.css',
})
export class PlatformPartnersPageComponent implements OnInit {
  private platformService = inject(PlatformService);

  readonly columns = COLUMNS;
  visibleColumns = new Set(COLUMNS.map((c) => c.key));

  onVisibleColumnsChange(v: Set<string>): void {
    this.visibleColumns = v;
  }

  partners: Partner[] = [];
  total = 0;
  page = 0;
  limit = 25;
  loading = false;
  refreshing = false;
  error: string | null = null;

  activeChip: 'no_campaigns' | 'new_week' | 'hidden' | null = null;
  searchQuery = '';
  sortField: SortField = 'created_at';
  sortDir: SortDir = 'desc';

  private searchTimer: any;

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (this.partners.length === 0) this.loading = true;
    else this.refreshing = true;

    this.platformService
      .getPartners({
        search: this.searchQuery.trim() || undefined,
        sortBy: this.sortField,
        sortDir: this.sortDir,
        page: this.page,
        limit: this.limit,
        noCampaigns: this.activeChip === 'no_campaigns',
        hidden: this.activeChip === 'hidden',
        newSince: this.activeChip === 'new_week' ? 7 : undefined,
      })
      .subscribe({
        next: (res) => {
          this.partners = res.partners ?? [];
          this.total = res.total ?? 0;
          this.loading = false;
          this.refreshing = false;
        },
        error: (err) => {
          this.error = err.error?.error || 'שגיאה בטעינת השותפים';
          this.loading = false;
          this.refreshing = false;
        },
      });
  }

  selectChip(chip: 'no_campaigns' | 'new_week' | 'hidden'): void {
    this.activeChip = this.activeChip === chip ? null : chip;
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

  // display_name is only filled in step 2 of the registration wizard —
  // a partner that only completed step 1 would otherwise show a blank name.
  partnerName(p: Partner): string {
    return p.display_name || p.legal_name || 'ללא שם';
  }

  relativeTime(iso: string): string {
    return relativeTime(iso);
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
}
