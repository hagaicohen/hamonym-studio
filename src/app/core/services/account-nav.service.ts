import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

// Shared by PlatformTopStripComponent (desktop "כניסה / אזור אישי") and
// CampaignPreviewComponent's mobile nav drawer (2026-09-28) — a logged-in
// visitor reaching either is always a donor viewing a public campaign page
// (entity managers/admins don't browse it while authenticated as
// themselves), so both send them straight to their donation history.
@Injectable({ providedIn: 'root' })
export class AccountNavService {
  private router = inject(Router);

  goToAccount(): void {
    this.router.navigate([localStorage.getItem('token') ? '/my-donations' : '/login']);
  }
}
