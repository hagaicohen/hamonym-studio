import { Component, OnDestroy, OnInit, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PlatformService } from '../../services/platform.service';
import { relativeTime } from '../../utils/relative-time';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { EntitiesService } from '../../../../core/services/entities.service';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { AmbassadorService } from '../../../campaigns/services/ambassador.service';
import { ColumnPickerComponent, ColumnDef } from '../../components/column-picker/column-picker.component';
import { AdminDetailsDrawerComponent } from '../../components/admin-details-drawer/admin-details-drawer.component';
import { israelDate } from '../../utils/admin-display';
import { EntityComboboxComponent } from '../../components/entity-combobox/entity-combobox.component';

const COLUMNS: ColumnDef[] = [
  { key: 'role',         label: 'תפקיד' },
  { key: 'entities',     label: 'עמותות' },
  { key: 'status',       label: 'סטטוס' },
  { key: 'permissions',  label: 'הרשאות פלטפורמה' },
  { key: 'last_login_at', label: 'כניסה אחרונה' },
  { key: 'created_at',   label: 'נרשם' },
];

interface PlatformUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role_id: number;
  role_name: string;
  is_active: boolean;
  is_super_admin: boolean;
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
  deleted_at: string | null;
  entities_count: number;
  entities?: { entity_id: string; entity_name: string; role: string }[];
  platform_permissions: string[] | null;
}

const PLATFORM_PERMISSION_OPTIONS: { key: string; label: string }[] = [
  { key: 'organizations', label: 'עמותות' },
  { key: 'campaigns',     label: 'קמפיינים' },
];

type SortField = 'name' | 'email' | 'role' | 'created_at' | 'last_login_at';
type SortDir = 'asc' | 'desc';

type ChipKey = 'all' | 'active' | 'disabled' | 'super_admin' | 'deleted';

const CHIPS: { key: ChipKey; label: string; dot: string }[] = [
  { key: 'active',      label: 'פעילים',       dot: '🟢' },
  { key: 'disabled',    label: 'מושבתים',      dot: '⚫' },
  { key: 'super_admin', label: 'סופר אדמין',   dot: '🛡️' },
  { key: 'deleted',     label: 'נמחקו',        dot: '🗑️' },
];

type PendingActionType = 'disable' | 'delete' | 'impersonate' | 'grantSuperAdmin' | 'revokeSuperAdmin' | 'setPermissions';

interface PendingAction {
  type: PendingActionType;
  user: PlatformUser;
}

@Component({
  selector: 'app-platform-users-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ColumnPickerComponent, RouterLink, AdminDetailsDrawerComponent, EntityComboboxComponent],
  templateUrl: './platform-users-page.component.html',
  styleUrl: './platform-users-page.component.css',
})
export class PlatformUsersPageComponent implements OnInit, OnDestroy {
  private platformService = inject(PlatformService);
  private route = inject(ActivatedRoute);
  private ctx = inject(CurrentContextService);
  canViewOrganizations(): boolean { return this.ctx.hasPlatformSection('organizations'); }
  roles: { id: number; name: string }[] = [];
  rolesError: string | null = null;
  roleFilter = '';
  entityFilter: string | undefined;
  superAdminOnly = false;
  advancedListAvailable = false;
  organizationOptions: { id: string; name: string }[] = [];
  organizationOptionsError: string | null = null;
  private optionsRequest?: Subscription;
  private optionsLoaded = false;
  loadOrganizationOptions(): void {
    this.organizationOptionsError = null; this.optionsRequest?.unsubscribe();
    this.optionsRequest = this.platformService.getOrganizationFilterOptions().subscribe({ next: options => { this.organizationOptions = options; this.optionsLoaded = true; }, error: () => { this.organizationOptionsError = 'לא ניתן לטעון את העמותות לסינון.'; } });
  }
  selectedUser: PlatformUser | null = null;
  userDetail: any = null;
  detailLoading = false;
  detailError: string | null = null;
  private request?: Subscription;
  private detailRequest?: Subscription;
  private rolesRequest?: Subscription;
  private requestId = 0;
  get hasFilters(): boolean { return this.activeChip !== 'all' || !!this.searchQuery.trim() || !!this.roleFilter || !!this.entityFilter || this.superAdminOnly; }
  clearFilters(): void { this.activeChip = 'all'; this.searchQuery = ''; this.roleFilter = ''; this.entityFilter = undefined; this.superAdminOnly = false; this.page = 0; this.load(); }
  onRoleChange(): void { this.page = 0; this.load(); }
  loadRoles(): void {
    this.rolesError = null;
    this.rolesRequest?.unsubscribe();
    this.rolesRequest = this.platformService.getRoles().subscribe({ next: res => { this.roles = res.roles || []; }, error: () => { this.rolesError = 'לא ניתן לטעון את רשימת התפקידים.'; } });
  }
  ngOnDestroy(): void { clearTimeout(this.searchTimer); this.requestId++; this.request?.unsubscribe(); this.detailRequest?.unsubscribe(); this.rolesRequest?.unsubscribe(); this.optionsRequest?.unsubscribe(); }
  openUser(user: PlatformUser): void {
    this.detailRequest?.unsubscribe(); this.selectedUser = user; this.userDetail = null; this.detailLoading = true; this.detailError = null; this.closeActionsMenu();
    this.detailRequest = this.platformService.getUser(user.id).subscribe({
      next: res => { if (this.selectedUser?.id !== user.id) return; this.userDetail = res; this.detailLoading = false; },
      error: () => { if (this.selectedUser?.id !== user.id) return; this.detailLoading = false; this.detailError = 'לא ניתן לטעון את פרטי המשתמש.'; },
    });
  }
  closeUser(): void { this.detailRequest?.unsubscribe(); this.selectedUser = null; }
  userEventLabel(action: string): string {
    return ({ enable: 'החשבון הופעל', disable: 'החשבון הושבת', delete: 'החשבון נמחק', restore: 'החשבון שוחזר', grant_super_admin: 'ניתנה הרשאת מנהל־על', revoke_super_admin: 'הוסרה הרשאת מנהל־על', set_permissions: 'הרשאות עודכנו', impersonate: 'התחברות בשם המשתמש', reset_password_link: 'נוצר קישור לאיפוס סיסמה' } as Record<string, string>)[action] || 'פעולת ניהול בחשבון';
  }
  private entitiesService = inject(EntitiesService);
  private currentEntityService = inject(CurrentEntityService);
  readonly columns = COLUMNS;
  visibleColumns = new Set(COLUMNS.map((c) => c.key));

  onVisibleColumnsChange(v: Set<string>): void {
    this.visibleColumns = v;
  }
  private ambassadorService = inject(AmbassadorService);

  readonly chips = CHIPS;
  readonly permissionOptions = PLATFORM_PERMISSION_OPTIONS;
  readonly currentUserId: string | null = (() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? String(JSON.parse(raw).id) : null;
    } catch {
      return null;
    }
  })();

  users: PlatformUser[] = [];
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

  resetLinkResult: { url: string; user: { full_name: string | null; email: string } } | null = null;
  resetLinkCopied = false;

  pendingPermissions: string[] = [];

  showCreateAdmin = false;
  createAdminEmail = '';
  createAdminFullName = '';
  createAdminIsSuperAdmin = false;
  createAdminPermissions: string[] = [];
  createAdminNotes = '';
  createAdminError: string | null = null;
  createAdminInProgress = false;

  private searchTimer: any;

  // "פעולות" column redesign (2026-09-14) -- a row used to render up to 6
  // buttons inline (status toggle, reset link, impersonate, permissions,
  // super-admin toggle, delete), which wrapped onto a second line at normal
  // table widths and read as visual clutter. Only the status toggle stays
  // inline now; everything else lives behind a single "⋮" menu, open for
  // at most one row at a time.
  openMenuUserId: string | null = null;
  // Computed on open from the trigger button's own real position (2026-09-16
  // fix -- the menu used to be `position: absolute` inside .plat-table-wrap,
  // which sets `overflow-x: auto` (and, per spec, an `overflow-x`/`overflow-y`
  // pair where neither is `visible` computes both to `auto`) -- so the
  // dropdown was silently clipped/mispositioned by that scroll container,
  // rendering as an overlapping mess instead of a clean popover. `position:
  // fixed` with a JS-computed viewport position escapes that ancestor
  // entirely, the same fix pattern used for any dropdown inside a scrollable
  // table.
  menuPosition: { top: number; right: number } | null = null;

  toggleActionsMenu(userId: string, event: Event): void {
    event.stopPropagation();
    if (this.openMenuUserId === userId) {
      this.openMenuUserId = null;
      this.menuPosition = null;
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    // Menu opens toward the reading-appropriate side in RTL: its right edge
    // aligns with the trigger button's own right edge (same visual anchor
    // the old absolute-positioned `left: 0` produced relative to the
    // button-sized wrapper) -- but clamped so it can never render partway
    // off the LEFT edge of the viewport (2026-09-16 follow-up fix). "פעולות"
    // is the trailing table column, which in RTL sits at the physically
    // LEFT edge of the page -- a trigger there has very little room to its
    // own left, so right-anchoring it naively (as the original fix did)
    // pushed the menu's left edge into negative coordinates, clipping it by
    // the browser viewport itself. MENU_MIN_WIDTH mirrors .user-menu's own
    // CSS min-width; VIEWPORT_MARGIN keeps a small gap from the edge.
    const desiredRight = window.innerWidth - rect.right;
    const maxRight = window.innerWidth - PlatformUsersPageComponent.MENU_MIN_WIDTH - PlatformUsersPageComponent.VIEWPORT_MARGIN;
    this.menuPosition = { top: rect.bottom + 4, right: Math.max(PlatformUsersPageComponent.VIEWPORT_MARGIN, Math.min(desiredRight, maxRight)) };
    this.openMenuUserId = userId;
  }

  private static readonly MENU_MIN_WIDTH = 190;
  private static readonly VIEWPORT_MARGIN = 8;

  // Closes the menu on any click outside it -- the menu's own buttons stop
  // propagation on their own click handlers (see template), so this only
  // ever fires for a genuine outside click. Also closes on scroll (page or
  // the table's own horizontal scrollbar) -- a `position: fixed` menu
  // doesn't track its trigger across a scroll, so keeping it open would
  // show it detached from the row it belongs to; closing is simpler and
  // safer than recomputing position on every scroll event.
  @HostListener('document:click')
  @HostListener('window:scroll')
  closeActionsMenu(): void {
    this.openMenuUserId = null;
    this.menuPosition = null;
  }

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.searchQuery = params.get('search') || '';
    const roleId = params.get('roleId');
    if (roleId && /^\d+$/.test(roleId)) this.roleFilter = roleId;
    const userId = params.get('userId');
    if (userId && (/^[0-9a-f-]{36}$/i.test(userId) || /^\d+$/.test(userId))) {
      this.detailRequest = this.platformService.getUser(userId).subscribe({
        next: res => { this.selectedUser = { ...res.user, entities_count: res.entities?.length || 0 }; this.userDetail = res; this.detailLoading = false; },
        error: () => { this.actionError = 'המשתמש המבוקש אינו זמין או שאין הרשאה לצפות בו.'; },
      });
    }
    this.loadRoles();
    this.load();
  }

  load(): void {
    clearTimeout(this.searchTimer); this.request?.unsubscribe();
    const requestId = ++this.requestId; this.error = null;
    if (this.users.length === 0) this.loading = true;
    else this.refreshing = true;

    this.request = this.platformService
      .getUsers({
        search: this.searchQuery.trim() || undefined,
        status: this.activeChip === 'all' ? undefined : this.activeChip,
        roleId: this.roleFilter ? Number(this.roleFilter) : undefined,
        entityId: this.entityFilter,
        superAdminOnly: this.superAdminOnly,
        sortBy: this.sortField,
        sortDir: this.sortDir,
        page: this.page,
        limit: this.limit,
      })
      .subscribe({
        next: (res) => {
          if (requestId !== this.requestId) return;
          if ((this.entityFilter || this.superAdminOnly) && res.adminListVersion !== 1) { this.error = 'נדרשת גרסת שרת תואמת לסינון שנבחר.'; this.loading = false; this.refreshing = false; return; }
          this.advancedListAvailable = res.adminListVersion === 1;
          if (this.advancedListAvailable && this.activeChip === 'super_admin') { this.activeChip = 'all'; this.superAdminOnly = true; }
          if (this.advancedListAvailable && !this.optionsLoaded && this.canViewOrganizations()) this.loadOrganizationOptions();
          this.users = res.users ?? [];
          this.total = res.total ?? 0;
          this.loading = false;
          this.refreshing = false;
        },
        error: (err) => {
          if (requestId !== this.requestId) return;
          this.error = 'לא ניתן לטעון את המשתמשים. נסה שוב.';
          this.loading = false;
          this.refreshing = false;
        },
      });
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

  isSelf(user: PlatformUser): boolean {
    return this.currentUserId !== null && this.currentUserId === String(user.id);
  }

  statusBadge(user: PlatformUser): { label: string; cls: string } {
    if (user.deleted_at) return { label: 'נמחק', cls: 'status-deleted' };
    if (!user.is_active) return { label: 'מושבת', cls: 'status-disabled' };
    return { label: 'פעיל', cls: 'status-active' };
  }

  relativeTime(iso: string | null): string {
    return iso ? relativeTime(iso) : 'טרם התחבר';
  }

  fmtDate(iso: string | null): string {
    return israelDate(iso);
  }

  toggleActive(user: PlatformUser): void {
    this.actionError = null;
    if (user.is_active) {
      this.pendingAction = { type: 'disable', user };
      this.notesInput = '';
      this.noteRequiredError = false;
      return;
    }
    this.actionInProgress = true;
    this.platformService.setUserActive(user.id, true).subscribe({
      next: () => { this.actionInProgress = false; this.load(); },
      error: (err) => {
        this.actionInProgress = false;
        this.actionError = err.error?.error || 'הפעולה נכשלה';
      },
    });
  }

  requestDelete(user: PlatformUser): void {
    this.actionError = null;
    this.pendingAction = { type: 'delete', user };
    this.notesInput = '';
    this.noteRequiredError = false;
  }

  restore(user: PlatformUser): void {
    this.actionError = null;
    this.actionInProgress = true;
    this.platformService.restoreUser(user.id).subscribe({
      next: () => { this.actionInProgress = false; this.load(); },
      error: (err) => {
        this.actionInProgress = false;
        this.actionError = err.error?.error || 'הפעולה נכשלה';
      },
    });
  }

  generateResetLink(user: PlatformUser): void {
    this.actionError = null;
    this.actionInProgress = true;
    this.platformService.generatePasswordResetLink(user.id).subscribe({
      next: (res) => {
        this.actionInProgress = false;
        const url = `${window.location.origin}/reset-password?token=${res.resetToken}`;
        this.resetLinkResult = { url, user };
        this.resetLinkCopied = false;
      },
      error: (err) => {
        this.actionInProgress = false;
        this.actionError = err.error?.error || 'הפעולה נכשלה';
      },
    });
  }

  copyResetLink(): void {
    if (!this.resetLinkResult) return;
    navigator.clipboard.writeText(this.resetLinkResult.url).then(() => {
      this.resetLinkCopied = true;
    });
  }

  closeResetLinkResult(): void {
    this.resetLinkResult = null;
    this.resetLinkCopied = false;
  }

  requestImpersonate(user: PlatformUser): void {
    this.actionError = null;
    this.pendingAction = { type: 'impersonate', user };
    this.notesInput = '';
    this.noteRequiredError = false;
  }

  toggleSuperAdmin(user: PlatformUser): void {
    this.actionError = null;
    this.pendingAction = { type: user.is_super_admin ? 'revokeSuperAdmin' : 'grantSuperAdmin', user };
    this.notesInput = '';
    this.noteRequiredError = false;
  }

  requestPermissionsEdit(user: PlatformUser): void {
    this.actionError = null;
    this.pendingAction = { type: 'setPermissions', user };
    this.pendingPermissions = [...(user.platform_permissions || [])];
    this.notesInput = '';
    this.noteRequiredError = false;
  }

  togglePendingPermission(key: string): void {
    const i = this.pendingPermissions.indexOf(key);
    if (i >= 0) this.pendingPermissions.splice(i, 1);
    else this.pendingPermissions.push(key);
  }

  cancelPendingAction(): void {
    if (this.actionInProgress) return;
    this.pendingAction = null;
    this.notesInput = '';
    this.noteRequiredError = false;
  }

  confirmPendingAction(): void {
    if (!this.pendingAction || this.actionInProgress) return;
    const trimmedNotes = this.notesInput.trim();
    if (!trimmedNotes) {
      this.noteRequiredError = true;
      return;
    }

    const { type, user } = this.pendingAction;
    this.actionInProgress = true;

    if (type === 'disable') {
      this.platformService.setUserActive(user.id, false, trimmedNotes).subscribe({
        next: () => { this.actionInProgress = false; this.pendingAction = null; this.load(); },
        error: (err) => this.failPendingAction(err),
      });
    } else if (type === 'delete') {
      this.platformService.deleteUser(user.id, trimmedNotes).subscribe({
        next: () => { this.actionInProgress = false; this.pendingAction = null; this.load(); },
        error: (err) => this.failPendingAction(err),
      });
    } else if (type === 'impersonate') {
      this.platformService.impersonateUser(user.id, trimmedNotes).subscribe({
        next: (res) => this.startImpersonationSession(res),
        error: (err) => this.failPendingAction(err),
      });
    } else if (type === 'grantSuperAdmin' || type === 'revokeSuperAdmin') {
      this.platformService.setUserSuperAdmin(user.id, type === 'grantSuperAdmin', trimmedNotes).subscribe({
        next: () => { this.actionInProgress = false; this.pendingAction = null; this.load(); },
        error: (err) => this.failPendingAction(err),
      });
    } else if (type === 'setPermissions') {
      this.platformService.setUserPermissions(user.id, this.pendingPermissions, trimmedNotes).subscribe({
        next: () => { this.actionInProgress = false; this.pendingAction = null; this.load(); },
        error: (err) => this.failPendingAction(err),
      });
    }
  }

  private failPendingAction(err: any): void {
    this.actionInProgress = false;
    this.actionError = err.error?.error || 'הפעולה נכשלה';
    this.pendingAction = null;
  }

  private startImpersonationSession(res: { token: string; user: any }): void {
    this.ctx.beginImpersonation(res.token, res.user.full_name || res.user.email);
    localStorage.setItem('user', JSON.stringify(res.user));
    localStorage.setItem('hasEntities', 'false');

    forkJoin({
      entitiesRes: this.entitiesService.getMyEntities().pipe(catchError(() => of({ entities: [] }))),
      ambassadorCampaigns: this.ambassadorService.getMyCampaigns().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ entitiesRes, ambassadorCampaigns }) => {
        const entities = (entitiesRes as any).entities || [];

        if (entities.length > 0) {
          const entity = entities[0];
          localStorage.setItem('currentEntity', JSON.stringify({
            id: entity.id,
            display_name: entity.display_name,
            entity_type: entity.entity_type,
            status: entity.status,
          }));
          this.currentEntityService.currentEntity.set(entity);
          this.currentEntityService.setRole(entity.role);
          localStorage.setItem('hasEntities', 'true');
        }

        this.ctx.initFromLogin({ entities, ambassadorCampaigns: ambassadorCampaigns as any });

        this.actionInProgress = false;
        this.pendingAction = null;

        if (entities.length > 0 || (ambassadorCampaigns as any)?.length) {
          window.location.href = '/campaigns';
        } else {
          window.location.href = '/welcome';
        }
      },
    });
  }

  openCreateAdmin(): void {
    this.showCreateAdmin = true;
    this.createAdminEmail = '';
    this.createAdminFullName = '';
    this.createAdminIsSuperAdmin = false;
    this.createAdminPermissions = [];
    this.createAdminNotes = '';
    this.createAdminError = null;
  }

  closeCreateAdmin(): void {
    this.showCreateAdmin = false;
  }

  toggleCreateAdminPermission(key: string): void {
    const i = this.createAdminPermissions.indexOf(key);
    if (i >= 0) this.createAdminPermissions.splice(i, 1);
    else this.createAdminPermissions.push(key);
  }

  submitCreateAdmin(): void {
    this.createAdminError = null;

    if (!this.createAdminEmail.trim()) {
      this.createAdminError = 'יש להזין אימייל';
      return;
    }
    if (!this.createAdminIsSuperAdmin && this.createAdminPermissions.length === 0) {
      this.createAdminError = 'יש לבחור לפחות הרשאה אחת, או לסמן כסופר אדמין מלא';
      return;
    }

    this.createAdminInProgress = true;
    this.platformService.createAdminUser({
      email: this.createAdminEmail.trim(),
      fullName: this.createAdminFullName.trim() || undefined,
      isSuperAdmin: this.createAdminIsSuperAdmin,
      permissions: this.createAdminPermissions,
      notes: this.createAdminNotes.trim() || undefined,
    }).subscribe({
      next: (res) => {
        this.createAdminInProgress = false;
        this.showCreateAdmin = false;
        const url = `${window.location.origin}/reset-password?token=${res.resetToken}`;
        this.resetLinkResult = { url, user: { full_name: res.user.full_name, email: res.user.email } };
        this.resetLinkCopied = false;
        this.load();
      },
      error: (err) => {
        this.createAdminInProgress = false;
        this.createAdminError = err.error?.error || 'הפעולה נכשלה';
      },
    });
  }
}
