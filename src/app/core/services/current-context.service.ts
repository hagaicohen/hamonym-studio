import { Injectable, signal, computed } from '@angular/core';
import { ActiveContext, RoleType, UserContext, UserRoleGroup } from '../models/user-context.model';
import { isRegistrationDraft, registeredOrganizations } from '../utils/organization-registration-status';
import type { HmIconName } from '../../shared/ui/design-system/icon.component';

// entity-manager's group can hold both nonprofits and businesses (a Partner
// entity, or any entity registered as עוסק פטור/מורשה) — 'מנהל עמותה' is
// only correct for an association, not an umbrella term. The GROUP label
// stays neutral; the ACTIVE context's label is computed per-entity below via
// entityManagerLabel().
const ROLE_META: Record<RoleType, { label: string; icon: HmIconName }> = {
  'entity-manager':   { label: 'הגופים שלי', icon: 'building' },
  'ambassador':       { label: 'שגריר',       icon: 'handshake' },
  'campaign-manager': { label: 'קמפיינר',     icon: 'target' },
  'company':          { label: 'חברה',         icon: 'factory' },
  'donor':            { label: 'תורם',         icon: 'heart' },
};

// The role's icon, by role (not the stored roleIcon value).
export function roleIconName(role: RoleType): HmIconName { return ROLE_META[role]?.icon ?? 'user'; }

// Mirrors organization-registration/config/entity-config.ts's EntityType
// labels, phrased as a role/identity label rather than a form-field label —
// kept as its own small map here (not imported from that feature module) to
// avoid coupling a core service to a specific feature module.
const ENTITY_TYPE_ROLE_LABELS: Record<string, string> = {
  association: 'מנהל עמותה',
  chalatz: 'מנהל חל״צ',
  political_party_new: 'מנהל מפלגה',
  political_party_registered: 'מנהל מפלגה',
  sole_exempt: 'בעל עסק',
  sole_registered: 'בעל עסק',
};

function entityManagerLabel(entityType?: string): string {
  return (entityType && ENTITY_TYPE_ROLE_LABELS[entityType]) || ROLE_META['entity-manager'].label;
}

const ROLE_PRIORITY: RoleType[] = [
  'entity-manager',
  'campaign-manager',
  'ambassador',
  'company',
  'donor',
];

const STORAGE_KEY = 'currentContext_v1';
export const ENTITY_PREFERENCES_KEY = 'organizationPreferences_v1';
const ROLES_KEY   = 'userRoles_v1';
const SUPER_ADMIN_KEY = 'isSuperAdmin';
const ADMIN_MODE_KEY = 'adminMode';
const IMPERSONATOR_TOKEN_KEY = 'impersonatorToken';
const IMPERSONATOR_NAME_KEY = 'impersonatorName';
const PLATFORM_PERMISSIONS_KEY = 'platformPermissions';

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

  // Scoped-admin access list (e.g. ['campaigns']) — irrelevant once isSuperAdmin is
  // true, since a full super admin already has every section.
  readonly platformPermissions = signal<string[]>(this._loadSavedPermissions());

  setPlatformPermissions(value: string[]): void {
    this.platformPermissions.set(value);
    localStorage.setItem(PLATFORM_PERMISSIONS_KEY, JSON.stringify(value));
  }

  hasPlatformSection(section: string): boolean {
    return this.isSuperAdmin() || this.platformPermissions().includes(section);
  }

  // True while a super admin is driving the app as another user (Impersonation).
  readonly impersonating = signal<boolean>(!!localStorage.getItem(IMPERSONATOR_TOKEN_KEY));
  readonly impersonatorName = signal<string | null>(localStorage.getItem(IMPERSONATOR_NAME_KEY));

  beginImpersonation(newToken: string, impersonatorName: string): void {
    const currentToken = localStorage.getItem('token');
    if (currentToken) localStorage.setItem(IMPERSONATOR_TOKEN_KEY, currentToken);
    localStorage.setItem(IMPERSONATOR_NAME_KEY, impersonatorName);
    localStorage.setItem('token', newToken);
    this.impersonating.set(true);
    this.impersonatorName.set(impersonatorName);
    this.setSuperAdmin(false);
    this.setAdminMode(false);
  }

  // Restores the super admin's original token. Returns it so the caller can
  // decide where to navigate (the users-page component does the actual redirect).
  endImpersonation(): string | null {
    const original = localStorage.getItem(IMPERSONATOR_TOKEN_KEY);
    localStorage.removeItem(IMPERSONATOR_TOKEN_KEY);
    localStorage.removeItem(IMPERSONATOR_NAME_KEY);
    this.impersonating.set(false);
    this.impersonatorName.set(null);
    if (original) localStorage.setItem('token', original);
    this.setSuperAdmin(true);
    this.setAdminMode(true);
    return original;
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

  // Donation history may arrive after login navigation; enrich roles without
  // resetting the selected organization or other identities.
  ensureDonorRole(): void {
    if (this.roles().some(group => group.role === 'donor')) return;
    const groups: UserRoleGroup[] = [...this.roles(), { role: 'donor', ...ROLE_META.donor, contexts: [] }];
    this.roles.set(groups);
    localStorage.setItem(ROLES_KEY, JSON.stringify(groups));
    if (!this.active()) this._setDefault(groups);
  }

  /**
   * Called after login. Builds role groups from real API data.
   * entities: result of getMyEntities() — the user's entity-manager contexts.
   * Future: ambassadorCampaigns, campaignManagerCampaigns, isDonor.
   */
  initFromLogin(params: {
    entities?: Array<{ id: string; display_name: string; legal_name?: string; entity_type?: string; status?: string }>;
    ambassadorCampaigns?: Array<{ id: string; name: string }>;
    campaignManagerCampaigns?: Array<{ id: string; name: string }>;
    isDonor?: boolean;
  }): void {
    const groups: UserRoleGroup[] = [];
    // Incomplete registrations are never selectable contexts.
    params = { ...params, entities: registeredOrganizations(params.entities ?? []) };

    if (params.entities?.length) {
      const m = ROLE_META['entity-manager'];
      groups.push({
        role: 'entity-manager',
        label: m.label,
        icon: m.icon,
        // display_name is only filled in step 2 of the registration wizard —
        // an entity that only completed step 1 would otherwise show up with
        // a blank name in the topbar identity switcher.
        contexts: params.entities.map((e) => ({
          id: e.id,
          name: e.display_name || e.legal_name || 'ללא שם',
          entityType: e.entity_type,
        })),
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

    // Restore last active context if it still exists, otherwise pick highest-priority.
    // Checking the ROLE alone used to be enough to restore — but a role can
    // survive (e.g. 'entity-manager' still exists because the user owns a
    // DIFFERENT entity) while the specific saved context.id was deleted out
    // from under it (hard-deleted entity, or — as found during the 2026-09-23
    // pre-pilot DB cleanup — the whole group disappearing because the user's
    // only entities were wiped). Restoring it anyway left `active` pointing at
    // a dead id that every entity-scoped page/service (CurrentEntityService,
    // dashboard, donations, reports...) then queried forever, since nothing
    // else ever re-validates it against the server.
    let saved = this._loadSaved();
    const preferred = this.preferredEntityId();
    const preferredContext = groups.find(g => g.role === 'entity-manager')?.contexts.find(c => c.id === preferred);
    if (preferredContext && (!saved || saved.role === 'entity-manager')) {
      saved = { role: 'entity-manager', roleLabel: entityManagerLabel(preferredContext.entityType), roleIcon: ROLE_META['entity-manager'].icon, context: preferredContext };
    }
    const savedRole = saved?.role;
    const savedId = saved?.context?.id;
    const savedGroup = groups.find((g) => g.role === savedRole);
    const savedContextStillValid = !savedId || !!savedGroup?.contexts.some((c) => c.id === savedId);
    if (saved && savedGroup && savedContextStillValid) {
      if (saved.context) saved = { ...saved, context: savedGroup.contexts.find(c => c.id === saved!.context!.id)! };
      this.active.set(saved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } else {
      this.active.set(null);
      localStorage.removeItem(STORAGE_KEY);
      this._setDefault(groups);
    }
  }

  // Called right after an entity is deleted — the deleted entity must not
  // keep showing up under "התפקידים שלי" until the next full login refetches
  // roles from the server. Removes it from the entity-manager group's
  // contexts (dropping the whole group if it was the last one), and if the
  // active context was pointing at it, falls back to the next available
  // role/context (or clears active entirely if none remain).
  removeEntityContext(entityId: string): void {
    const groups = this.roles()
      .map((g) => g.role === 'entity-manager'
        ? { ...g, contexts: g.contexts.filter((c) => c.id !== entityId) }
        : g)
      .filter((g) => g.role !== 'entity-manager' || g.contexts.length > 0);

    this.roles.set(groups);
    localStorage.setItem(ROLES_KEY, JSON.stringify(groups));

    const a = this.active();
    if (a?.role === 'entity-manager' && a.context?.id === entityId) {
      this.active.set(null);
      localStorage.removeItem(STORAGE_KEY);
      this._setDefault(groups);
    }
  }

  // Counterpart to removeEntityContext() — needed when a NEW entity is
  // created mid-session (e.g. AI campaign-creation flow creating an
  // organization on the fly) and has to become switchable/active immediately,
  // without waiting for the next full login to re-fetch getMyEntities().
  addEntityContext(entity: { id: string; display_name?: string; legal_name?: string; entity_type?: string; status?: string }): void {
    if (isRegistrationDraft(entity)) return;
    const groups = this.roles();
    const idx = groups.findIndex((g) => g.role === 'entity-manager');
    const contextEntry = { id: entity.id, name: entity.display_name || entity.legal_name || 'ללא שם', entityType: entity.entity_type };

    const next = idx >= 0
      ? groups.map((g, i) => (i === idx ? { ...g, contexts: [...g.contexts.filter(c => c.id !== entity.id), contextEntry] } : g))
      : [...groups, { role: 'entity-manager' as RoleType, ...ROLE_META['entity-manager'], contexts: [contextEntry] }];

    this.roles.set(next);
    localStorage.setItem(ROLES_KEY, JSON.stringify(next));
  }

  switchContext(role: RoleType, contextId: string | null): void {
    const group = this.roles().find((g) => g.role === role);
    if (!group) return;
    const context = contextId
      ? (group.contexts.find((c) => c.id === contextId) ?? null)
      : null;
    if (contextId && !context) return;
    if (role === 'entity-manager' && !context) return;
    const m = ROLE_META[role];
    const roleLabel = role === 'entity-manager' ? entityManagerLabel(context?.entityType) : m.label;
    const next: ActiveContext = { role, roleLabel, roleIcon: m.icon, context };
    this.active.set(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (role === 'entity-manager' && context) {
      try {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        if (user?.id != null) {
          const preferences = JSON.parse(localStorage.getItem(ENTITY_PREFERENCES_KEY) || '{}');
          preferences[String(user.id)] = context.id;
          localStorage.setItem(ENTITY_PREFERENCES_KEY, JSON.stringify(preferences));
        }
      } catch { /* A corrupt preference never prevents an authorized switch. */ }
    }
  }

  private preferredEntityId(): string | null {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      return user?.id != null ? JSON.parse(localStorage.getItem(ENTITY_PREFERENCES_KEY) || '{}')[String(user.id)] ?? null : null;
    } catch { return null; }
  }

  private _setDefault(groups: UserRoleGroup[]): void {
    for (const role of ROLE_PRIORITY) {
      const g = groups.find((gr) => gr.role === role);
      if (g) {
        const m = ROLE_META[role];
        const context = g.contexts[0] ?? null;
        const roleLabel = role === 'entity-manager' ? entityManagerLabel(context?.entityType) : m.label;
        const next: ActiveContext = { role, roleLabel, roleIcon: m.icon, context };
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

  private _loadSavedPermissions(): string[] {
    try {
      const s = localStorage.getItem(PLATFORM_PERMISSIONS_KEY);
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  }
}
