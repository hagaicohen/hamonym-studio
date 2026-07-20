import { Component, OnInit, inject } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { RouterModule } from '@angular/router';

import { Observable, forkJoin } from 'rxjs';

import { EntitiesService } from '../../../../core/services/entities.service';

import { CurrentEntityService } from '../../../../core/services/current-entity.service';

import { CurrentContextService } from '../../../../core/services/current-context.service';

import { AuthService } from '../../../../core/services/auth.service';

import { LucideAngularModule, Pencil, User, Mail, ShieldCheck, KeyRound, Flag, Users, Settings, Eye, EyeOff, Trash2 } from 'lucide-angular';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, LucideAngularModule],
  templateUrl: './settings-page.component.html',
  styleUrls: ['./settings-page.component.css'],
})
export class SettingsPageComponent implements OnInit {
  private entitiesService = inject(EntitiesService);

  private currentEntityService = inject(CurrentEntityService);

  private ctx = inject(CurrentContextService);

  private authService = inject(AuthService);

  readonly PencilIcon = Pencil;
  readonly UserIcon = User;
  readonly MailIcon = Mail;
  readonly ShieldIcon = ShieldCheck;
  readonly KeyIcon = KeyRound;
  readonly FlagIcon = Flag;
  readonly UsersIcon = Users;
  readonly SettingsIcon = Settings;
  readonly EyeIcon = Eye;
  readonly EyeOffIcon = EyeOff;
  readonly TrashIcon = Trash2;

  entities: any[] = [];

  loading = true;

  // ── ACCOUNT ──
  readonly currentUser = this.authService.currentUser;

  get roleLabel(): string {
    return this.ctx.active()?.roleLabel ?? '';
  }

  editingAccount = false;
  nameDraft = '';
  newPassword = '';
  confirmPassword = '';
  accountSaving = false;
  accountError = '';
  accountSuccess = false;

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

  startEditAccount(): void {
    this.nameDraft       = this.currentUser()?.full_name ?? '';
    this.newPassword     = '';
    this.confirmPassword = '';
    this.accountError    = '';
    this.editingAccount  = true;
  }

  cancelEditAccount(): void {
    this.editingAccount = false;
  }

  saveAccount(): void {
    if (this.accountSaving) return;
    this.accountError = '';

    const trimmedName = this.nameDraft.trim();
    if (!trimmedName) {
      this.accountError = 'נא להזין שם מלא';
      return;
    }

    // Password fields are optional — filling them in changes the password,
    // leaving them blank just updates the name.
    const wantsPasswordChange = this.newPassword.length > 0 || this.confirmPassword.length > 0;
    if (wantsPasswordChange) {
      if (this.newPassword.length < 8) {
        this.accountError = 'הסיסמה החדשה חייבת להכיל לפחות 8 תווים';
        return;
      }
      if (this.newPassword !== this.confirmPassword) {
        this.accountError = 'הסיסמאות אינן תואמות';
        return;
      }
    }

    this.accountSaving = true;

    const requests: Observable<unknown>[] = [this.authService.updateProfile(trimmedName)];
    if (wantsPasswordChange) {
      requests.push(this.authService.changePassword(this.newPassword));
    }

    forkJoin(requests).subscribe({
      next: () => {
        this.accountSaving  = false;
        this.editingAccount = false;
        this.accountSuccess = true;
        setTimeout(() => (this.accountSuccess = false), 4000);
      },
      error: (err) => {
        this.accountSaving = false;
        this.accountError  = err?.error?.error || 'שגיאה בשמירה';
      },
    });
  }

  selectEntity(entity: any) {
    this.currentEntityService.currentEntity.set(entity);
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
        return 'יישות';
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
    return this.deleteEntityConfirmText.trim() === (this.deleteEntityTarget?.display_name || '').trim();
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
        this.deleteEntityCardError = err?.error?.error || 'שגיאה במחיקת העמותה';
      },
    });
  }
}
