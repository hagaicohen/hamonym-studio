import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PlatformService } from '../../services/platform.service';
import { relativeTime } from '../../utils/relative-time';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { EntitiesService } from '../../../../core/services/entities.service';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { AmbassadorService } from '../../../campaigns/services/ambassador.service';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './platform-users-page.component.html',
  styleUrl: './platform-users-page.component.css',
})
export class PlatformUsersPageComponent implements OnInit {
  private platformService = inject(PlatformService);
  private ctx = inject(CurrentContextService);
  private entitiesService = inject(EntitiesService);
  private currentEntityService = inject(CurrentEntityService);
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

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (this.users.length === 0) this.loading = true;
    else this.refreshing = true;

    this.platformService
      .getUsers({
        search: this.searchQuery.trim() || undefined,
        status: this.activeChip === 'all' ? undefined : this.activeChip,
        sortBy: this.sortField,
        sortDir: this.sortDir,
        page: this.page,
        limit: this.limit,
      })
      .subscribe({
        next: (res) => {
          this.users = res.users ?? [];
          this.total = res.total ?? 0;
          this.loading = false;
          this.refreshing = false;
        },
        error: (err) => {
          this.error = err.error?.error || 'שגיאה בטעינת המשתמשים';
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
    if (user.is_super_admin) return { label: 'סופר אדמין', cls: 'status-super-admin' };
    return { label: 'פעיל', cls: 'status-active' };
  }

  relativeTime(iso: string | null): string {
    return iso ? relativeTime(iso) : 'מעולם לא';
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
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
    this.pendingAction = null;
    this.notesInput = '';
    this.noteRequiredError = false;
  }

  confirmPendingAction(): void {
    if (!this.pendingAction) return;
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
          this.currentEntityService.currentRole.set(entity.role);
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
