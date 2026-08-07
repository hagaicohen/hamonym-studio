import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule, ChartColumn, Megaphone, TrendingUp, TriangleAlert } from 'lucide-angular';
import { CampaignPerformanceReportComponent } from './tabs/campaign-performance-report/campaign-performance-report.component';
import { MarketingReportComponent } from './tabs/marketing-report/marketing-report.component';
import { TrendsReportComponent } from './tabs/trends-report/trends-report.component';
import { FailuresReportComponent } from './tabs/failures-report/failures-report.component';
import { DateRangePickerComponent } from '../../../../shared/components/date-range-picker/date-range-picker.component';
import { CampaignApiService } from '../../../campaigns/services/campaign-api.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { CampaignManagementSidebarComponent } from '../../../campaigns/shared/components/campaign-management-sidebar/campaign-management-sidebar.component';

type ReportTab = 'campaigns' | 'marketing' | 'trends' | 'failures';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, CampaignPerformanceReportComponent, MarketingReportComponent, TrendsReportComponent, FailuresReportComponent, DateRangePickerComponent, CampaignManagementSidebarComponent],
  templateUrl: './reports-page.component.html',
  styleUrls: ['./reports-page.component.css', '../../shared/reports-shared.css'],
})
export class ReportsPageComponent implements OnInit {
  readonly ChartColumnIcon = ChartColumn;
  readonly MegaphoneIcon   = Megaphone;
  readonly TrendingUpIcon  = TrendingUp;
  readonly TriangleAlertIcon = TriangleAlert;

  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  private campaignApi = inject(CampaignApiService);
  private loader       = inject(AppLoaderService);

  activeTab = signal<ReportTab>('campaigns');

  // Two entry points: /campaigns/:id/reports (campaign-scoped — Workspace
  // sidebar's own route) and /reports?campaignId= (entity-wide, pre-filters
  // just the "ביצועי קמפיינים" tab). See registrations-page.component.ts for
  // the identical pattern this was copied from.
  campaignScoped = !!this.route.snapshot.paramMap.get('id');
  campaignId = this.route.snapshot.paramMap.get('id') || this.route.snapshot.queryParamMap.get('campaignId') || undefined;
  campaignTitle: string | null = null;
  isOngoing = false;

  ngOnInit(): void {
    if (this.campaignScoped) this.loader.forceHide();

    if (this.campaignId) {
      this.campaignApi.getById(this.campaignId).subscribe({
        next: (draft) => { this.campaignTitle = draft.title; this.isOngoing = draft.campaignLifecycle === 'ongoing'; },
        error: () => { this.campaignTitle = 'קמפיין זה'; },
      });
    }
  }

  back(): void { this.router.navigate(['/campaigns', this.campaignId, 'dashboard']); }

  setTab(tab: ReportTab): void {
    this.activeTab.set(tab);
  }
}
