import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService, DiscoverCampaign } from '../../services/campaign-api.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

type Mode = 'donate' | 'ambassador';
type SortBy = 'newest' | 'popular' | 'ending_soon';

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'newest', label: 'החדשים ביותר' },
  { key: 'popular', label: 'הפופולריים ביותר' },
  { key: 'ending_soon', label: 'מסתיימים בקרוב' },
];

@Component({
  selector: 'app-campaign-discover',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './campaign-discover.component.html',
  styleUrl: './campaign-discover.component.css',
})
export class CampaignDiscoverComponent implements OnInit {
  private api = inject(CampaignApiService);
  private loader = inject(AppLoaderService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly sortOptions = SORT_OPTIONS;

  mode: Mode = 'donate';
  campaigns: DiscoverCampaign[] = [];
  total = 0;
  page = 0;
  limit = 12;
  loading = false;
  refreshing = false;
  error: string | null = null;

  searchQuery = '';
  sortBy: SortBy = 'newest';

  private searchTimer: any;

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }

  get pageTitle(): string {
    return this.mode === 'ambassador' ? 'בחרו קמפיין להצטרפות כשגרירים' : 'מצאו קמפיין לתרומה';
  }

  get pageSubtitle(): string {
    return this.mode === 'ambassador'
      ? 'בחרו קמפיין שתרצו לגייס עבורו, ותצטרפו כשגרירים בלחיצה אחת'
      : 'חפשו פרויקטים ועמותות לתמיכה מתוך כל הקמפיינים הפעילים';
  }

  ngOnInit(): void {
    this.mode = this.route.snapshot.queryParamMap.get('mode') === 'ambassador' ? 'ambassador' : 'donate';
    this.load();
  }

  load(): void {
    if (this.campaigns.length === 0) this.loading = true;
    else this.refreshing = true;

    this.api.discover({
      search: this.searchQuery.trim() || undefined,
      sortBy: this.sortBy,
      page: this.page,
      limit: this.limit,
    }).subscribe({
      next: (res) => {
        this.campaigns = res.campaigns ?? [];
        this.total = res.total ?? 0;
        this.loading = false;
        this.refreshing = false;
        this.loader.hide();
      },
      error: () => {
        this.error = 'שגיאה בטעינת הקמפיינים';
        this.loading = false;
        this.refreshing = false;
        this.loader.hide();
      },
    });
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page = 0; this.load(); }, 400);
  }

  setSortBy(sortBy: SortBy): void {
    this.sortBy = sortBy;
    this.page = 0;
    this.load();
  }

  prevPage(): void { if (this.page > 0) { this.page--; this.load(); } }
  nextPage(): void { if (this.page < this.totalPages - 1) { this.page++; this.load(); } }

  openCampaign(c: DiscoverCampaign): void {
    const queryParams = this.mode === 'ambassador' ? { join: 'ambassador' } : {};
    this.router.navigate(['/campaigns', c.slug, 'view'], { queryParams });
  }

  progressPct(c: DiscoverCampaign): number {
    const target = Number(c.target_amount) || 0;
    if (target <= 0) return 0;
    const current = Number(c.current_amount) || 0;
    return Math.min(100, Math.round((current / target) * 100));
  }

  daysLeft(endDate: string | null): number | null {
    if (!endDate) return null;
    const diff = new Date(endDate).getTime() - Date.now();
    return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
  }

  fmtMoney(n: string | number): string {
    return '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL');
  }
}
