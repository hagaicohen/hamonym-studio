import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignDraft } from '../../services/campaign-studio-state.service';
import { CampaignManagementSidebarComponent } from '../../shared/components/campaign-management-sidebar/campaign-management-sidebar.component';
import { CampaignDashboardStatusComponent } from './sections/campaign-dashboard-status/campaign-dashboard-status.component';
import { CampaignDashboardKpisComponent } from './sections/campaign-dashboard-kpis/campaign-dashboard-kpis.component';
import { CampaignDashboardUpdatesComponent } from './sections/campaign-dashboard-updates/campaign-dashboard-updates.component';
import { CampaignDashboardAttentionComponent } from './sections/campaign-dashboard-attention/campaign-dashboard-attention.component';
import { CampaignDashboardManagementComponent } from './sections/campaign-dashboard-management/campaign-dashboard-management.component';
import { CampaignDashboardFinanceComponent } from './sections/campaign-dashboard-finance/campaign-dashboard-finance.component';

// Architecture reset (2026-08-06, see docs/CAMPAIGN_MANAGEMENT_DASHBOARD_SPEC.md
// "Reset — Mission Control"). This page is now purely a navigation/control
// center — "the place you decide what to edit, not the place you edit."
// No embedded Builder step components, no in-place editing, no shared
// CampaignStudioStateService, no global Save button: this page does one
// read-only fetch (getById) and renders it. Every actual editing capability
// (Rewards/Sponsors/Ambassadors/Registration/Settings/Visibility) is its
// own dedicated page, reached via the sidebar or a card's "›". Updates is
// the one exception that stays inline — it owns its own fetch/save
// independently (see that component), unrelated to this page's draft.
@Component({
  selector: 'app-campaign-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    CampaignManagementSidebarComponent,
    CampaignDashboardStatusComponent,
    CampaignDashboardKpisComponent,
    CampaignDashboardUpdatesComponent,
    CampaignDashboardAttentionComponent,
    CampaignDashboardManagementComponent,
    CampaignDashboardFinanceComponent,
  ],
  templateUrl: './campaign-dashboard-page.component.html',
  styleUrl: './campaign-dashboard-page.component.css',
})
export class CampaignDashboardPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private loader = inject(AppLoaderService);
  private campaignApi = inject(CampaignApiService);

  campaignId = this.route.snapshot.paramMap.get('id') ?? '';
  draft: CampaignDraft | null = null;
  loading = true;
  loadError = '';

  get isOngoing(): boolean { return this.draft?.campaignLifecycle === 'ongoing'; }

  ngOnInit(): void {
    this.loader.hide();
    if (!this.campaignId) {
      this.loading = false;
      this.loadError = 'לא נמצא קמפיין';
      return;
    }
    this.campaignApi.getById(this.campaignId).subscribe({
      next: draft => { this.draft = draft; this.loading = false; },
      error: () => { this.loadError = 'שגיאה בטעינת הקמפיין'; this.loading = false; },
    });
  }
}
