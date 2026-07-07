import { Injectable, signal, computed } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CurrentEntityService {
  currentEntity = signal<any>(null);

  currentRole = signal<string | null>(null);

  constructor() {
    const savedEntity = localStorage.getItem('currentEntity');

    const savedRole = localStorage.getItem('currentRole');

    if (savedEntity) {
      this.currentEntity.set(JSON.parse(savedEntity));
    }

    if (savedRole) {
      this.currentRole.set(savedRole);
    }
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

      default:
        return entity.status;
    }
  });
}
