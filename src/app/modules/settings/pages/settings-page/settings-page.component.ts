import { Component, inject } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { RouterModule } from '@angular/router';

import { Observable, forkJoin } from 'rxjs';

import { CurrentContextService } from '../../../../core/services/current-context.service';

import { AuthService } from '../../../../core/services/auth.service';

import { LucideAngularModule, Pencil, User, Mail, ShieldCheck, KeyRound } from 'lucide-angular';

// 2026-09-28 — the entities/organizations section ("הישויות שלי") was moved
// out of this page into its own top-level "ארגונים" nav item/route (see
// MyOrganizationsPageComponent) — an organization is a primary workspace
// object, not a system setting. This page now only owns account settings.
@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, LucideAngularModule],
  templateUrl: './settings-page.component.html',
  styleUrls: ['./settings-page.component.css'],
})
export class SettingsPageComponent {
  private ctx = inject(CurrentContextService);

  private authService = inject(AuthService);

  readonly PencilIcon = Pencil;
  readonly UserIcon = User;
  readonly MailIcon = Mail;
  readonly ShieldIcon = ShieldCheck;
  readonly KeyIcon = KeyRound;

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
}
