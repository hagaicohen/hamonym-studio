import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

// Shared by PlatformTopStripComponent (desktop "כניסה / אזור אישי"/"אזור
// אישי"+"התנתקות") and CampaignPreviewComponent's mobile nav drawer
// (2026-09-28) — a logged-in visitor reaching either is always a donor
// viewing a public campaign page (entity managers/admins don't browse it
// while authenticated as themselves), so both send them straight to their
// donation history.
@Injectable({ providedIn: 'root' })
export class AccountNavService {
  private router = inject(Router);
  private auth   = inject(AuthService);

  goToAccount(): void {
    this.router.navigate([localStorage.getItem('token') ? '/my-donations' : '/login']);
  }

  // Delegates to AuthService.logout() — the app's one canonical logout
  // (2026-09-29, same method the authenticated topbar and idle-timeout use)
  // rather than a lighter-weight token clear invented just for this button.
  // It clears the full session and hard-redirects to /login, so the
  // owner-preview banner/CTA disappear simply because the user is no
  // longer authenticated when the page reloads.
  logout(): void {
    this.auth.logout();
  }
}
