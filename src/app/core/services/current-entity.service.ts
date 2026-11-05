import { Injectable, signal, computed, inject, effect, untracked } from '@angular/core';
import { CurrentContextService } from './current-context.service';
import { EntitiesService } from './entities.service';
import { defer, map, Observable, throwError } from 'rxjs';

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
      try { this.currentEntity.set(JSON.parse(savedEntity)); }
      catch { localStorage.removeItem('currentEntity'); }
    }

    if (savedRole) {
      this.currentRole.set(savedRole);
    }

    effect((onCleanup) => {
      const active = this.ctx.active();
      untracked(() => {
        if (active?.role !== 'entity-manager' || !active.context) {
          this.clear();
          return;
        }
        if (this.currentEntity()?.id === active.context.id) return;
        // Do not expose data from the preceding organization while loading.
        this.clear();
        const subscription = this.entitiesApi.getEntityById(active.context.id).subscribe({
          next: entity => {
            if (this.ctx.isActiveContext('entity-manager', active.context!.id) && entity.id === active.context!.id) {
              this.setEntity(entity);
              this.setRole(entity.role || 'member');
            }
          },
          error: () => this.clear(),
        });
        onCleanup(() => subscription.unsubscribe());
      });
    }, { allowSignalWrites: true });
  }

  /** Server authorization precedes changing either of the shared contexts. */
  selectEntity(entityId: string): Observable<any> {
    return defer(() => {
      if (!this.ctx.roles().some(g => g.role === 'entity-manager' && g.contexts.some(c => c.id === entityId))) {
        return throwError(() => new Error('Entity access denied'));
      }
      return this.entitiesApi.getEntityById(entityId).pipe(map(entity => {
        if (entity.id !== entityId) throw new Error('Entity response mismatch');
        this.ctx.addEntityContext(entity);
        this.ctx.switchContext('entity-manager', entityId);
        this.setEntity(entity);
        this.setRole(entity.role || 'member');
        return entity;
      }));
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
