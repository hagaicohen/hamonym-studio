import { AnalyticsRange, AnalyticsRangeService, CAMPAIGN_RANGE_DEFAULT } from '../../../../core/services/analytics-range.service';
import { DateRangePickerComponent, shiftCivilDate } from '../../../../shared/components/date-range-picker/date-range-picker.component';
import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';
import { DropdownOptionComponent } from '../../../../shared/ui/dropdown/dropdown.component';
import { firstValueFrom } from 'rxjs';
import { EntityComboboxComponent } from '../../components/entity-combobox/entity-combobox.component';
import { AdminDetailsDrawerComponent } from '../../components/admin-details-drawer/admin-details-drawer.component';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ManagementPaginationComponent } from '../../../../shared/components/management-pagination/management-pagination.component';
import { ENTITY_CATEGORIES, categoryLabel, categorySolidIcon } from '../../../../shared/config/category-presentation';
import { CollectionOpsService, FinancialOverview, FinancialReportRow } from '../../services/collection-ops.service';
import { DashboardAttention, PlatformDashboardService } from '../../services/platform-dashboard.service';
import { PlatformService } from '../../services/platform.service';

interface ActivityRow { type: string; title: string; subtitle: string | null; timestamp: string; }
interface TaskRow extends DashboardAttention { kind: 'organizations' | 'payment' | 'collection'; count: number; amount?: number; }
interface TaskGroup extends TaskRow { events: TaskRow[]; }

@Component({
  providers: [AnalyticsRangeService, { provide: CAMPAIGN_RANGE_DEFAULT, useValue: 'month' }],
  standalone: true,
  imports: [DateRangePickerComponent, HmIconComponent, DropdownOptionComponent, CommonModule, FormsModule, RouterLink, ManagementPaginationComponent, EntityComboboxComponent, AdminDetailsDrawerComponent],
  templateUrl: './platform-v1-tools.component.html',
})
export class PlatformV1ToolsComponent {
  readonly screen = inject(ActivatedRoute).snapshot.data['screen'] as 'tasks' | 'business' | 'audit' | 'catalog' | 'portal';
  private readonly destroyRef = inject(DestroyRef);
  private readonly dashboard = inject(PlatformDashboardService);
  private readonly analyticsRange = inject(AnalyticsRangeService);
  private readonly collections = inject(CollectionOpsService);
  private readonly platform = inject(PlatformService);
  readonly taskTabs = [
    { key: 'all', label: 'הכל', icon: 'list' },
    { key: 'payment', label: 'סליקה', icon: 'card' },
    { key: 'organizations', label: 'אישורי ארגונים', icon: 'building' },
    { key: 'collection', label: 'גבייה', icon: 'coins' },
  ];
  readonly auditTypes = [
    { key: '', label: 'כל האירועים' },
    { key: 'audit', label: 'פעולות בארגונים' },
    { key: 'campaign_audit', label: 'פעולות בקמפיינים' },
    { key: 'user_audit', label: 'פעולות במשתמשים' },
    { key: 'campaign', label: 'קמפיינים חדשים' },
    { key: 'donation', label: 'תרומות' },
    { key: 'user', label: 'משתמשים חדשים' },
  ];
  taskTab = 'all';
  organizationFilter = '';
  taskRows: TaskRow[] = [];
  taskSearch = '';
  taskPage = 0;
  selectedTask: TaskGroup | null = null;
  organizationTasksAvailable = false;
  collectionTasksAvailable = false;

  taskTotal(key: string): number | null {
    if ((key !== 'collection' && !this.organizationTasksAvailable) || ((key === 'all' || key === 'collection') && !this.collectionTasksAvailable)) return null;
    return this.taskRows.filter(row => key === 'all' || row.kind === key).length;
  }

  taskKind(kind: string): string { return this.taskTabs.find(tab => tab.key === kind)?.label || kind; }

  auditRows: ActivityRow[] = [];
  auditType = '';
  auditSort: 'asc' | 'desc' = 'desc';
  auditDetail: ActivityRow | null = null;
  catalogQuery = '';
  catalogPage = 0;
  readonly categoryIcon = categorySolidIcon;

  get catalogRows() {
    const query = this.catalogQuery.trim().toLocaleLowerCase();
    return ENTITY_CATEGORIES.map((category, index) => ({ ...category, name: categoryLabel(category), order: index + 1 }))
      .filter(category => !query || category.name.toLocaleLowerCase().includes(query));
  }

  auditActor(row: ActivityRow): string {
    if (!row.type.includes('audit') || !row.subtitle) return '—';
    return row.subtitle.split(' ע"י ').slice(1).join(' ע"י ') || '—';
  }

  auditAction(row: ActivityRow): string {
    if (row.type.includes('audit') && row.subtitle) return row.subtitle.split(' ע"י ')[0];
    return this.auditTypes.find(item => item.key === row.type)?.label || 'פעילות בפלטפורמה';
  }

  sortAudit(): void {
    this.auditSort = this.auditSort === 'asc' ? 'desc' : 'asc';
    this.loadAudit(0);
  }

  auditTotal = 0;
  auditExporting = false;
  auditExportError = '';
  page = 0;
  loading = false;
  error = '';
  financial: FinancialOverview | null = null;
  financialRows: FinancialReportRow[] = [];
  financialRowsLoading = false;
  financialRowsError = false;
  financialPage = 0;
  businessTab = 'summary';
  private requestVersion = 0;
  month = '';

  constructor() {
    if (this.screen === 'tasks') this.loadTasks();
    if (this.screen === 'business') {
      effect(() => {
        const range = this.analyticsRange.activeRange();
        untracked(() => this.loadFinancial(range));
      });
    }
    if (this.screen === 'audit') this.loadAudit(0);
  }

  get organizations() { return [...new Set(this.taskRows.map(row => row.name))].sort((a, b) => a.localeCompare(b, 'he')).map(name => ({ id: name, name })); }

  get groupedTasks(): TaskGroup[] {
    const groups = new Map<string, TaskGroup>();
    const query = this.taskSearch.trim().toLocaleLowerCase();
    for (const row of this.taskRows) {
      if (query && ![row.name, row.reason, this.taskKind(row.kind)].some(value => value.toLocaleLowerCase().includes(query))) continue;
      if (this.taskTab !== 'all' && this.taskTab !== row.kind) continue;
      if (this.organizationFilter && row.name !== this.organizationFilter) continue;
      const key = JSON.stringify([row.kind, row.name, row.reason]);
      const existing = groups.get(key);
      if (existing) { existing.count += row.count; existing.events.push(row); }
      else groups.set(key, { ...row, events: [row] });
    }
    return [...groups.values()];
  }

  private loadTasks(): void {
    this.loading = true;
    let pending = 2;
    const finish = () => { this.loading = --pending > 0; };
    this.dashboard.getOverview('30d').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.organizationTasksAvailable = true;
        this.taskRows.push(...data.attention.filter(row => !row.route.join('/').includes('collection-ops') || row.id.startsWith('uncertain:')).map(row => ({
          ...row, count: 1, kind: row.id.startsWith('uncertain:') || row.route.join('/').includes('donations') ? 'payment' as const : 'organizations' as const,
        })));
        finish();
      },
      error: () => { this.error = 'חלק מנתוני המשימות אינם זמינים'; finish(); },
    });
    this.collections.getNeedsAttention().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        this.collectionTasksAvailable = true;
        this.taskRows.push(...response.categories.flatMap(group => group.items.map(item => ({
          id: group.category + ':' + item.statementId, name: item.entityName, reason: item.reason || group.label,
          action: item.nextAction, route: ['/platform/collection-ops'], query: {}, fragment: 'collection-attention',
          kind: 'collection' as const, count: 1, amount: item.amount,
        }))));
        finish();
      },
      error: () => { this.error = 'חלק מנתוני המשימות אינם זמינים'; finish(); },
    });
  }

  loadFinancial(range: AnalyticsRange): void {
    this.month = range.from.slice(0, 7);
    this.error = '';
    const version = ++this.requestVersion;
    const [year, month] = this.month.split('-').map(Number);
    this.loading = true;
    this.financial = null;
    this.financialPage = 0;
    this.financialRows = [];
    this.financialRowsError = false;
    this.financialRowsLoading = false;
    if (range.preset !== 'month' && range.preset !== 'last_month') {
      this.collections.getReportPreview({
        dateFrom: range.from || undefined,
        dateTo: range.to ? shiftCivilDate(range.to, -1) : undefined,
      }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: response => {
          if (version !== this.requestVersion) return;
          this.financialRows = response.rows;
          this.loading = false;
        },
        error: () => {
          if (version !== this.requestVersion) return;
          this.error = 'טעינת נתוני הגבייה נכשלה';
          this.loading = false;
        },
      });
      return;
    }
    this.collections.getOverview(year, month).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        if (version !== this.requestVersion) return;
        this.financial = response.overview;
        this.loading = false;
        this.financialPage = 0;
        this.financialRows = [];
        this.financialRowsError = false;
        const periodId = response.overview.period.id;
        this.financialRowsLoading = !!periodId;
        if (!periodId) return;
        this.collections.getReportPreview({ periodId }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: report => {
            if (version !== this.requestVersion) return;
            this.financialRows = report.rows;
            this.financialRowsLoading = false;
          },
          error: () => {
            if (version !== this.requestVersion) return;
            this.financialRowsLoading = false;
            this.financialRowsError = true;
          },
        });
      },
      error: () => { if (version === this.requestVersion) { this.error = 'טעינת נתוני הגבייה נכשלה'; this.loading = false; } },
    });
  }

  async exportAudit(): Promise<void> {
    if (this.auditExporting || !this.auditTotal) return;
    this.auditExporting = true;
    this.auditExportError = '';
    const type = this.auditType || undefined;
    const sortDir = this.auditSort;
    const limit = 100;
    try {
      const rows: ActivityRow[] = [];
      const first = await firstValueFrom(this.platform.getActivity({ type, sortDir, page: 0, limit }).pipe(takeUntilDestroyed(this.destroyRef)));
      rows.push(...first.items);
      for (let page = 1; page * limit < first.total; page++) {
        const next = await firstValueFrom(this.platform.getActivity({ type, sortDir, page, limit }).pipe(takeUntilDestroyed(this.destroyRef)));
        rows.push(...next.items);
      }
      const csv = (value: string | null): string => {
        const text = value || '';
        return '"' + (/^\s*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
      };
      const lines = ['זמן אירוע,אירוע,פירוט', ...rows.map(row => [row.timestamp, row.title, row.subtitle].map(csv).join(','))];
      const url = URL.createObjectURL(new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'platform-activity.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.auditExportError = 'ייצוא היומן נכשל';
    } finally {
      this.auditExporting = false;
    }
  }

  loadAudit(page: number): void {
    this.page = page;
    this.loading = true;
    this.error = '';
    const version = ++this.requestVersion;
    this.platform.getActivity({ type: this.auditType || undefined, sortDir: this.auditSort, page, limit: 25 }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        if (version !== this.requestVersion) return;
        this.auditRows = result.items;
        this.auditTotal = result.total;
        this.loading = false;
      },
      error: () => {
        if (version !== this.requestVersion) return;
        this.error = 'טעינת יומן הפעילות נכשלה';
        this.loading = false;
      },
    });
  }
}
