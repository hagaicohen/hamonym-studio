import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccountNavService } from '../../services/account-nav.service';

// Permanent Hamonym platform chrome (2026-09-28) — NOT a Campaign Studio
// block: not editable, removable, reorderable, or affected by campaign
// colors, and never stored in campaign configuration. Deliberately a plain,
// stateless component (no campaign-derived @Input()s) — nothing about it
// can vary per campaign by design. Mounted once at the top of each real
// page-root component (CampaignPublicPageComponent, PartnerPublicPageComponent,
// the Studio builder's own preview panel) rather than in a shared wrapper,
// since no single shell currently sits above all of those — see each
// mount site's own comment for why that placement can't double-render.
//
// Account access ("כניסה / אזור אישי", 2026-09-28) lives here rather than
// in the campaign nav below it — it's a platform/account action, not a
// campaign action. goToAccount() is shared via AccountNavService rather
// than duplicated, since CampaignPreviewComponent's own mobile nav drawer
// still needs the identical behavior and this component must not depend on
// CampaignPreviewComponent just to reuse one method.
@Component({
  selector: 'app-platform-top-strip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './platform-top-strip.component.html',
  styleUrl: './platform-top-strip.component.css',
})
export class PlatformTopStripComponent {
  private accountNav = inject(AccountNavService);

  // Logged-in visitors get "אזור אישי" + a quiet "התנתקות" link (not
  // "כניסה / אזור אישי", which is misleading once already signed in) —
  // 2026-09-29. Logout stays a small secondary link next to it, not a
  // dominant control: this remains a public campaign page, not an admin
  // toolbar.
  get isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }

  goToAccount(): void {
    this.accountNav.goToAccount();
  }

  logout(): void {
    this.accountNav.logout();
  }
}
