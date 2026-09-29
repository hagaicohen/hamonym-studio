import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { EntitiesService } from '../../../../core/services/entities.service';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';

import { LucideAngularModule, Flag, Users, Settings, Eye, EyeOff, Trash2 } from 'lucide-angular';

// Promoted out of SettingsPageComponent (2026-09-28, "הישויות שלי" ->
// "ארגונים" main-nav item) — an organization/nonprofit is a primary
// workspace object, not a system setting. This is the SAME data/actions
// that used to live inside the Settings page's entities section, moved
// verbatim (getMyEntities, hide/unhide, delete-with-confirm, manage link to
// the existing /settings/entities/:id page which is unchanged). Only the
// entry point and user-facing terminology changed — no business logic.
@Component({
  selector: 'app-my-organizations-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, LucideAngularModule],
  templateUrl: './my-organizations-page.component.html',
  styleUrls: ['./my-organizations-page.component.css'],
})
export class MyOrganizationsPageComponent implements OnInit {
  private entitiesService = inject(EntitiesService);
  private currentEntityService = inject(CurrentEntityService);
  private ctx = inject(CurrentContextService);

  readonly FlagIcon = Flag;
  readonly UsersIcon = Users;
  readonly SettingsIcon = Settings;
  readonly EyeIcon = Eye;
  readonly EyeOffIcon = EyeOff;
  readonly TrashIcon = Trash2;

  entities: any[] = [];
  loading = true;

  ngOnInit(): void {
    const currentEntity = this.currentEntityService.currentEntity();

    if (currentEntity) {
      this.entities = [currentEntity];
      this.loading = false;
    }

    this.entitiesService.getMyEntities().subscribe({
      next: (res) => {
        this.entities = res.entities || [];
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
      },
    });
  }

  selectEntity(entity: any) {
    this.currentEntityService.currentEntity.set(entity);
  }

  // display_name is only filled in step 2 of the registration wizard — an
  // entity that only completed step 1 would otherwise show a blank name.
  entityName(entity: any): string {
    return entity?.display_name || entity?.legal_name || 'ללא שם';
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'active':
        return 'פעילה';
      case 'draft':
        return 'הגדרה לא הושלמה';
      case 'pending_review':
        return 'ממתינה לאישור';
      default:
        return '';
    }
  }

  getEntityTypeLabel(type: string): string {
    switch (type) {
      case 'association':
        return 'עמותה';
      case 'chalatz':
        return 'חל״צ';
      case 'political_party_registered':
        return 'מפלגה';
      case 'sole_registered':
        return 'עוסק מורשה';
      default:
        return 'ארגון';
    }
  }

  // ── HIDE / UNHIDE FROM CARD ──
  hidingEntityId: string | null = null;

  toggleEntityCardVisibility(event: Event, entity: any): void {
    event.stopPropagation();
    event.preventDefault();
    if (this.hidingEntityId) return;

    const nextHidden = !entity.is_hidden;
    this.hidingEntityId = entity.id;

    this.entitiesService.setVisibility(entity.id, nextHidden).subscribe({
      next: () => {
        entity.is_hidden = nextHidden;
        this.hidingEntityId = null;
      },
      error: () => {
        this.hidingEntityId = null;
      },
    });
  }

  // ── DELETE FROM CARD ──
  deleteEntityTarget: any = null;
  deleteEntityConfirmText = '';
  isDeletingEntityCard = false;
  deleteEntityCardError = '';

  get deleteEntityCardConfirmValid(): boolean {
    return this.deleteEntityConfirmText.trim() === this.entityName(this.deleteEntityTarget).trim();
  }

  openDeleteEntityCardModal(event: Event, entity: any): void {
    event.stopPropagation();
    event.preventDefault();
    this.deleteEntityTarget = entity;
    this.deleteEntityConfirmText = '';
    this.deleteEntityCardError = '';
  }

  closeDeleteEntityCardModal(): void {
    this.deleteEntityTarget = null;
  }

  confirmDeleteEntityCard(): void {
    if (!this.deleteEntityCardConfirmValid || this.isDeletingEntityCard || !this.deleteEntityTarget) return;

    this.isDeletingEntityCard = true;
    const entityId = this.deleteEntityTarget.id;
    this.entitiesService.deleteEntity(entityId).subscribe({
      next: () => {
        this.entities = this.entities.filter((e) => e.id !== entityId);
        this.ctx.removeEntityContext(entityId);
        if (this.currentEntityService.currentEntity()?.id === entityId) {
          this.currentEntityService.setEntity(null);
        }
        this.isDeletingEntityCard = false;
        this.deleteEntityTarget = null;
      },
      error: (err) => {
        this.isDeletingEntityCard = false;
        this.deleteEntityCardError = err?.error?.error || 'שגיאה במחיקת הארגון';
      },
    });
  }
}
