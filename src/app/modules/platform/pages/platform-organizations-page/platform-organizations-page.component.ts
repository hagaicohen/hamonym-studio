import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PlatformService } from '../../services/platform.service';
import { relativeTime } from '../../utils/relative-time';

interface Organization {
  id: string;
  display_name: string;
  logo_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  profile_completion: number;
  owner_name: string | null;
  owner_email: string | null;
  campaigns_count: number;
  total_raised: number;
}

type SortField = 'name' | 'status' | 'created_at' | 'campaigns' | 'raised';
type SortDir = 'asc' | 'desc';

type ChipKey = 'all' | 'pending_review' | 'active' | 'suspended' | 'missing_docs' | 'no_campaigns' | 'new_week';

const CHIPS: { key: ChipKey; label: string; dot: string }[] = [
  { key: 'pending_review', label: 'ממתינות', dot: '🔴' },
  { key: 'active',         label: 'פעילות',   dot: '🟢' },
  { key: 'suspended',      label: 'מושעות',   dot: '⚫' },
  { key: 'missing_docs',   label: 'חסרות מסמכים', dot: '🟠' },
  { key: 'no_campaigns',   label: 'ללא קמפיינים', dot: '🔵' },
  { key: 'new_week',       label: 'חדשות השבוע',  dot: '🟣' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'השלמת פרטים',
  pending_review: 'ממתין לאישור',
  active: 'פעיל',
  changes_requested: 'נדרשים תיקונים',
  rejected: 'נדחה',
  suspended: 'מושעה',
};

@Component({
  selector: 'app-platform-organizations-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './platform-organizations-page.component.html',
  styleUrl: './platform-organizations-page.component.css',
})
export class PlatformOrganizationsPageComponent implements OnInit {
  private platformService = inject(PlatformService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly chips = CHIPS;

  organizations: Organization[] = [];
  total = 0;
  page = 0;
  limit = 25;
  loading = false;
  refreshing = false;
  error: string | null = null;

  activeChip: ChipKey = 'all';
  searchQuery = '';
  sortField: SortField = 'created_at';
  sortDir: SortDir = 'desc';

  private searchTimer: any;

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const status = qp.get('status');
    const missingDocs = qp.get('missingDocs');
    if (status && CHIPS.some((c) => c.key === status)) {
      this.activeChip = status as ChipKey;
    } else if (missingDocs) {
      this.activeChip = 'missing_docs';
    }

    this.load();
  }

  load(): void {
    if (this.organizations.length === 0) this.loading = true;
    else this.refreshing = true;

    const chipParams = this.chipToParams(this.activeChip);

    this.platformService
      .getOrganizations({
        search: this.searchQuery.trim() || undefined,
        sortBy: this.sortField,
        sortDir: this.sortDir,
        page: this.page,
        limit: this.limit,
        ...chipParams,
      })
      .subscribe({
        next: (res) => {
          this.organizations = res.organizations ?? [];
          this.total = res.total ?? 0;
          this.loading = false;
          this.refreshing = false;
        },
        error: (err) => {
          this.error = err.error?.error || 'שגיאה בטעינת העמותות';
          this.loading = false;
          this.refreshing = false;
        },
      });
  }

  private chipToParams(chip: ChipKey): { status?: string; missingDocs?: boolean; noCampaigns?: boolean; newSince?: number } {
    switch (chip) {
      case 'pending_review': return { status: 'pending_review' };
      case 'active':         return { status: 'active' };
      case 'suspended':      return { status: 'suspended' };
      case 'missing_docs':   return { missingDocs: true };
      case 'no_campaigns':   return { noCampaigns: true };
      case 'new_week':       return { newSince: 7 };
      default:               return {};
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

  openOrganization(org: Organization): void {
    this.router.navigate(['/platform/organizations', org.id]);
  }

  statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  relativeTime(iso: string): string {
    return relativeTime(iso);
  }

  fmtMoney(n: number): string {
    return '₪' + Math.round(n || 0).toLocaleString('he-IL');
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
}
