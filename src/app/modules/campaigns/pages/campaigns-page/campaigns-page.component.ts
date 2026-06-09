import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { LucideAngularModule, Trash2 } from 'lucide-angular';

@Component({
  selector: 'app-campaigns-page',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './campaigns-page.component.html',
  styleUrls: ['./campaigns-page.component.css'],
})
export class CampaignsPageComponent implements OnInit {
  viewMode: 'grid' | 'list' = 'grid';
  campaigns: any[] = [];
  isLoading  = true;
  deletingId: string | null = null;

  readonly TrashIcon = Trash2;

  private router      = inject(Router);
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

  deleteCampaign(event: Event, id: string, title: string): void {
    event.stopPropagation();
    const name = title || 'קמפיין זה';
    if (!confirm(`האם אתה בטוח שברצונך למחוק את "${name}"?\n\nפעולה זו אינה ניתנת לביטול.`)) return;
    this.deletingId = id;
    this.campaignApi.delete(id).subscribe({
      next: () => {
        this.campaigns  = this.campaigns.filter(c => c.id !== id);
        this.deletingId = null;
      },
      error: () => { this.deletingId = null; },
    });
  }

  createCampaign(): void {
    this.router.navigate(['/campaigns/create']);
  }

  editCampaign(id: string): void {
    this.router.navigate(['/campaigns', id, 'edit']);
  }

  viewCampaign(slug: string): void {
    this.router.navigate(['/campaigns', slug, 'view']);
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
    return Math.min(100, Math.round(((campaign.currentAmount ?? 0) / campaign.targetAmount) * 100));
  }

  daysRemaining(endDate: string): number {
    if (!endDate) return 0;
    const diff = new Date(endDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
}
