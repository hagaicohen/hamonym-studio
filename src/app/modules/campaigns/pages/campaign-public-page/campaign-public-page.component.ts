import { Component, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { CampaignPreviewComponent } from '../../studio/preview/campaign-preview/campaign-preview.component';
import { StudioUiService } from '../../studio/services/studio-ui.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

@Component({
  selector: 'app-campaign-public-page',
  standalone: true,
  imports: [CommonModule, CampaignPreviewComponent],
  templateUrl: './campaign-public-page.component.html',
  styleUrls: ['./campaign-public-page.component.css'],
})
export class CampaignPublicPageComponent implements OnInit {
  private route     = inject(ActivatedRoute);
  private router    = inject(Router);
  private api       = inject(CampaignApiService);
  private state     = inject(CampaignStudioStateService);
  private ui        = inject(StudioUiService);
  private loader    = inject(AppLoaderService);

  isLoading = true;
  notFound  = false;

  @HostListener('window:resize')
  onResize(): void { this.syncDevice(); }

  private syncDevice(): void {
    this.ui.setDevice(window.innerWidth <= 768 ? 'mobile' : 'desktop');
  }

  ngOnInit(): void {
    this.syncDevice();
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!slug) { this.router.navigate(['/campaigns']); return; }

    this.api.getBySlug(slug).subscribe({
      next: (data) => {
        this.state.loadDraft(data);
        this.loader.hide();
        this.isLoading = false;
      },
      error: () => {
        this.loader.hide();
        this.notFound  = true;
        this.isLoading = false;
      },
    });
  }
}
