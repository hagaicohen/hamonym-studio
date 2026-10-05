import { Component, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AccountNavService } from '../../services/account-nav.service';

// Permanent Hamonym platform chrome (2026-09-28) — NOT a Campaign Studio
// block: not editable, removable, reorderable, or affected by campaign
// colors, and never stored in campaign configuration. Mounted once at the
// top of each real page-root component (CampaignPublicPageComponent,
// PartnerPublicPageComponent, the Studio builder's own preview panel)
// rather than in a shared wrapper, since no single shell currently sits
// above all of those — see each mount site's own comment for why that
// placement can't double-render.
//
// Account access ("כניסה / אזור אישי", 2026-09-28) lives here rather than
// in the campaign nav below it — it's a platform/account action, not a
// campaign action. goToAccount() is shared via AccountNavService rather
// than duplicated, since CampaignPreviewComponent's own mobile nav drawer
// still needs the identical behavior and this component must not depend on
// CampaignPreviewComponent just to reuse one method.
//
// Contextual "ניהול הקמפיין" (2026-10-06 Platform Navigation Cleanup) — the
// one campaign-derived @Input() this component takes. It deliberately does
// NOT compute ownership itself (no HTTP call, no duplicated permission
// logic): the caller passes the campaign id only once it already knows,
// via the EXISTING authorization truth it already had to check anyway
// (campaign-public-page.component.ts's `canEdit`, itself the same
// user_entities-backed check campaignEditorGuard uses), that the current
// viewer may manage this campaign. Presence of a non-null id IS the
// permission signal — there is no separate boolean to keep in sync with it.
@Component({
  selector: 'app-platform-top-strip',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './platform-top-strip.component.html',
  styleUrl: './platform-top-strip.component.css',
})
export class PlatformTopStripComponent {
  private accountNav = inject(AccountNavService);

  @Input() manageCampaignId: string | null = null;

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
