import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule, ChartColumn, Megaphone, TrendingUp, TriangleAlert } from 'lucide-angular';
import { CampaignPerformanceReportComponent } from './tabs/campaign-performance-report/campaign-performance-report.component';
import { MarketingReportComponent } from './tabs/marketing-report/marketing-report.component';
import { TrendsReportComponent } from './tabs/trends-report/trends-report.component';
import { FailuresReportComponent } from './tabs/failures-report/failures-report.component';

type ReportTab = 'campaigns' | 'marketing' | 'trends' | 'failures';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, CampaignPerformanceReportComponent, MarketingReportComponent, TrendsReportComponent, FailuresReportComponent],
  templateUrl: './reports-page.component.html',
  styleUrls: ['./reports-page.component.css', '../../shared/reports-shared.css'],
})
export class ReportsPageComponent {
  readonly ChartColumnIcon = ChartColumn;
  readonly MegaphoneIcon   = Megaphone;
  readonly TrendingUpIcon  = TrendingUp;
  readonly TriangleAlertIcon = TriangleAlert;

  private route = inject(ActivatedRoute);

  activeTab = signal<ReportTab>('campaigns');
  campaignId = this.route.snapshot.queryParamMap.get('campaignId') || undefined;

  setTab(tab: ReportTab): void {
    this.activeTab.set(tab);
  }
}
