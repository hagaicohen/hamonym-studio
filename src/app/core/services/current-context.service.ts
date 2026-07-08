import { Injectable, signal, computed } from '@angular/core';
import { ActiveContext, RoleType, UserContext, UserRoleGroup } from '../models/user-context.model';

const ROLE_META: Record<RoleType, { label: string; icon: string }> = {
  'entity-manager':   { label: 'מנהל עמותה', icon: '🏢' },
  'ambassador':       { label: 'שגריר',       icon: '🤝' },
  'campaign-manager': { label: 'קמפיינר',     icon: '🎯' },
  'company':          { label: 'חברה',         icon: '🏭' },
  'donor':            { label: 'תורם',         icon: '💛' },
};

const ROLE_PRIORITY: RoleType[] = [
  'entity-manager',
  'campaign-manager',
  'ambassador',
  'company',
  'donor',
];

const STORAGE_KEY = 'currentContext_v1';
const ROLES_KEY   = 'userRoles_v1';
const SUPER_ADMIN_KEY = 'isSuperAdmin';
const ADMIN_MODE_KEY = 'adminMode';

@Injectable({ providedIn: 'root' })
export class CurrentContextService {
  readonly roles = signal<UserRoleGroup[]>(this._loadSavedRoles());

  readonly active = signal<ActiveContext | null>(this._loadSaved());

  // Independent of role/context switching — a super admin keeps this true
  // regardless of which entity context is active.
  readonly isSuperAdmin = signal<boolean>(localStorage.getItem(SUPER_ADMIN_KEY) === 'true');

  setSuperAdmin(value: boolean): void {
    this.isSuperAdmin.set(value);
    localStorage.setItem(SUPER_ADMIN_KEY, String(value));
  }

  // Set only via the dedicated /admin entry point. While true, the sidebar shows
  // only the platform section — entity/ambassador roles are hidden, not revoked.
  readonly adminMode = signal<boolean>(localStorage.getItem(ADMIN_MODE_KEY) === 'true');

  setAdminMode(value: boolean): void {
    this.adminMode.set(value);
    localStorage.setItem(ADMIN_MODE_KEY, String(value));
  }

  readonly hasMultipleOptions = computed(() => {
    const groups = this.roles();
    const total = groups.reduce((sum, g) => sum + Math.max(g.contexts.length, 1), 0);
    return total > 1;
  });

  isActiveContext(role: RoleType, contextId: string | null): boolean {
    const a = this.active();
    if (!a) return false;
    return a.role === role && (a.context?.id ?? null) === contextId;
  }

  /**
   * Called after login. Builds role groups from real API data.
   * entities: result of getMyEntities() — the user's entity-manager contexts.
   * Future: ambassadorCampaigns, campaignManagerCampaigns, isDonor.
   */
  initFromLogin(params: {
    entities?: Array<{ id: string; display_name: string }>;
    ambassadorCampaigns?: Array<{ id: string; name: string }>;
    campaignManagerCampaigns?: Array<{ id: string; name: string }>;
    isDonor?: boolean;
  }): void {
    const groups: UserRoleGroup[] = [];

    if (params.entities?.length) {
      const m = ROLE_META['entity-manager'];
      groups.push({
        role: 'entity-manager',
        label: m.label,
        icon: m.icon,
        contexts: params.entities.map((e) => ({ id: e.id, name: e.display_name })),
      });
    }

    if (params.campaignManagerCampaigns?.length) {
      const m = ROLE_META['campaign-manager'];
      groups.push({
        role: 'campaign-manager',
        label: m.label,
        icon: m.icon,
        contexts: params.campaignManagerCampaigns,
      });
    }

    if (params.ambassadorCampaigns?.length) {
      const m = ROLE_META['ambassador'];
      groups.push({
        role: 'ambassador',
        label: m.label,
        icon: m.icon,
        contexts: params.ambassadorCampaigns,
      });
    }

    if (params.isDonor) {
      const m = ROLE_META['donor'];
      groups.push({ role: 'donor', label: m.label, icon: m.icon, contexts: [] });
    }

    this.roles.set(groups);
    localStorage.setItem(ROLES_KEY, JSON.stringify(groups));

    // Restore last active context if it still exists, otherwise pick highest-priority
    const saved = this._loadSaved();
    if (saved && groups.some((g) => g.role === saved.role)) {
      this.active.set(saved);
    } else {
      this._setDefault(groups);
    }
  }

  switchContext(role: RoleType, contextId: string | null): void {
    const group = this.roles().find((g) => g.role === role);
    if (!group) return;
    const context = contextId
      ? (group.contexts.find((c) => c.id === contextId) ?? null)
      : null;
    const m = ROLE_META[role];
    const next: ActiveContext = { role, roleLabel: m.label, roleIcon: m.icon, context };
    this.active.set(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  private _setDefault(groups: UserRoleGroup[]): void {
    for (const role of ROLE_PRIORITY) {
      const g = groups.find((gr) => gr.role === role);
      if (g) {
        const m = ROLE_META[role];
        const next: ActiveContext = { role, roleLabel: m.label, roleIcon: m.icon, context: g.contexts[0] ?? null };
        this.active.set(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return;
      }
    }
  }

  private _loadSaved(): ActiveContext | null {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }

  private _loadSavedRoles(): UserRoleGroup[] {
    try {
      const s = localStorage.getItem(ROLES_KEY);
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  }
}
