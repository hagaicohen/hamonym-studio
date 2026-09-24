import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { CurrentContextService } from './current-context.service';
import { EntitiesService } from './entities.service';

@Injectable({
  providedIn: 'root',
})
export class CurrentEntityService {
  currentEntity = signal<any>(null);

  currentRole = signal<string | null>(null);

  private ctx = inject(CurrentContextService);
  private entitiesApi = inject(EntitiesService);

  constructor() {
    const savedEntity = localStorage.getItem('currentEntity');

    const savedRole = localStorage.getItem('currentRole');

    if (savedEntity) {
      this.currentEntity.set(JSON.parse(savedEntity));
    }

    if (savedRole) {
      this.currentRole.set(savedRole);
    }

    // CurrentContextService.active() is the real source of truth for "which
    // entity is the topbar switcher pointing at" — it updates on every
    // switchContext() call. This signal used to only be set once at login and
    // then go stale after switching, so every entity-scoped page (reports,
    // donors, donations, ambassadors, dashboard...) kept querying the old
    // entity. Keep it synced whenever the active entity-manager context changes.
    effect(() => {
      const active = this.ctx.active();
      if (!active || active.role !== 'entity-manager' || !active.context) {
        // The active context stopped being (or never was) a valid
        // entity-manager pointing at a real entity — most commonly because
        // CurrentContextService just discovered the previously-active
        // entity no longer exists (hard-deleted, or — as found during the
        // 2026-09-23 pre-pilot DB cleanup — wiped entirely) and reset
        // `active` accordingly. Without this, a stale entity from an
        // earlier session/localStorage would keep being treated as "the"
        // current entity by every page that reads currentEntity()?.id
        // (per CLAUDE.md's own documented pattern), even after it's gone.
        if (this.currentEntity()) this.clear();
        return;
      }
      if (this.currentEntity()?.id === active.context.id) return;

      this.entitiesApi.getEntityById(active.context.id).subscribe({
        next: (entity) => this.setEntity(entity),
      });
    });
  }

  setEntity(entity: any): void {
    const safeEntity = {
      ...entity,

      logo_data: undefined,

      association_certificate_data: undefined,

      tax_document_data: undefined,
    };

    this.currentEntity.set(safeEntity);

    localStorage.setItem(
      'currentEntity',

      JSON.stringify(safeEntity),
    );
  }

  setRole(role: string): void {
    this.currentRole.set(role);

    localStorage.setItem(
      'currentRole',

      role,
    );
  }

  clear(): void {
    this.currentEntity.set(null);

    this.currentRole.set(null);

    localStorage.removeItem('currentEntity');

    localStorage.removeItem('currentRole');
  }

  roleLabel = computed(() => {
    const role = this.currentRole();

    const entity = this.currentEntity();

    if (!role || !entity) {
      return 'תורם';
    }

    if (role === 'owner') {
      switch (entity.entity_type) {
        case 'association':
          return 'מנהל עמותה';

        case 'chalatz':
          return 'מנהל חל״צ';

        case 'business':
          return 'בעל עסק';

        default:
          return 'מנהל מערכת';
      }
    }

    return 'משתמש';
  });

  statusLabel = computed(() => {
    const entity = this.currentEntity();

    if (!entity) {
      return null;
    }

    switch (entity.status) {
      case 'draft':
        return 'השלמת פרטים';

      case 'pending_review':
        return 'ממתין לאישור';

      case 'active':
        return 'פעיל';

      case 'rejected':
        return 'נדחה';

      case 'changes_requested':
        return 'נדרשים תיקונים';

      case 'suspended':
        return 'מושעה';

      default:
        return entity.status;
    }
  });
}
