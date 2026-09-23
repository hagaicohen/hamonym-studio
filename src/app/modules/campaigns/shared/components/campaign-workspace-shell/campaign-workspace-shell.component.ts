import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { CampaignWorkspaceContextService } from '../../../services/campaign-workspace-context.service';
import { CampaignManagementSidebarComponent } from '../campaign-management-sidebar/campaign-management-sidebar.component';

// Campaign Workspace persistent shell (2026-09-23) -- renders the sidebar
// exactly once per campaigns/:id parent route match, with <router-outlet>
// swapping only the routed child content underneath it. Before this, each
// of the 12 Workspace pages was its own flat top-level route and rendered
// its own sidebar instance, so every click between them fully
// destroyed/recreated the sidebar and tripped the app-wide "entering a new
// route" full-screen loader -- see app.component.ts's workspaceKey().
@Component({
  selector: 'app-campaign-workspace-shell',
  standalone: true,
  imports: [CampaignManagementSidebarComponent, RouterOutlet],
  templateUrl: './campaign-workspace-shell.component.html',
  styleUrl: './campaign-workspace-shell.component.css',
})
export class CampaignWorkspaceShellComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private ctx = inject(CampaignWorkspaceContextService);
  private sub?: Subscription;

  campaignId = '';

  // Reads straight from the shared context signal, so the moment any
  // CampaignDraft-based child page's ensureLoaded() call resolves (or was
  // already cached), the sidebar picks it up too -- no separate fetch here.
  get isOngoing(): boolean { return this.ctx.draft()?.campaignLifecycle === 'ongoing'; }

  ngOnInit(): void {
    // Subscribed, not a one-time snapshot read -- if the campaign id
    // changes without the shell being destroyed (Angular's default
    // RouteReuseStrategy reuses a component when the same route config
    // matches, even with a different :id), the sidebar must not stay
    // stuck showing the previous campaign.
    this.sub = this.route.paramMap.subscribe(params => {
      const id = params.get('id') ?? '';
      if (!id || id === this.campaignId) return;
      this.campaignId = id;
      // Sidebar just falls back to isOngoing=false on error; each child
      // page still fetches (via the same shared context) and surfaces its
      // own load error independently.
      this.ctx.ensureLoaded(id).subscribe({ error: () => {} });
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
