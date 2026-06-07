import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AppLoaderService }   from '../../../../core/services/app-loader.service';
import { CampaignApiService } from '../../services/campaign-api.service';

@Component({
  selector: 'app-campaigns-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaigns-page.component.html',
  styleUrls: ['./campaigns-page.component.css'],
})
export class CampaignsPageComponent implements OnInit {
  viewMode: 'grid' | 'list' = 'grid';
  campaigns: any[] = [];
  isLoading = true;

  private router      = inject(Router);
  private loader      = inject(AppLoaderService);
  private campaignApi = inject(CampaignApiService);

  private readonly fundingLabels: Record<string, string> = {
    'flexible':       'גיוס גמיש',
    'all-or-nothing': 'הכל או כלום',
    'recurring':      'הוראות קבע',
    'matching':       "מאצ'ינג",
  };

  ngOnInit(): void {
    this.campaignApi.list().subscribe({
      next: (data) => { this.campaigns = data; this.isLoading = false; },
      error: ()    => { this.isLoading = false; },
    });
  }

  createCampaign(): void {
    this.loader.show('טוען את אשף יצירת הקמפיין...');
    setTimeout(() => {
      this.router.navigate(['/campaigns/create']);
      this.loader.hide();
    }, 900);
  }

  editCampaign(id: string): void {
    this.router.navigate(['/campaigns', id, 'edit']);
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft:     'טיוטה',
      published: 'פעיל',
      paused:    'מושהה',
      ended:     'הסתיים',
    };
    return labels[status] ?? status;
  }

  fundingLabel(type: string): string {
    return this.fundingLabels[type] ?? type;
  }

  progressPercent(campaign: any): number {
    if (!campaign.targetAmount) return 0;
    return Math.min(100, Math.round(((campaign.raisedAmount ?? 0) / campaign.targetAmount) * 100));
  }

  daysRemaining(endDate: string): number {
    if (!endDate) return 0;
    const diff = new Date(endDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
}
