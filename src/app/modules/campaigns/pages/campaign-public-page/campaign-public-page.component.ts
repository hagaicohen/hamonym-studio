import { Component, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { CampaignPreviewComponent } from '../../studio/preview/campaign-preview/campaign-preview.component';
import { StudioUiService } from '../../studio/services/studio-ui.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { PaymentFailedPopupComponent } from '../../shared/components/payment-failed-popup/payment-failed-popup.component';

@Component({
  selector: 'app-campaign-public-page',
  standalone: true,
  imports: [CommonModule, CampaignPreviewComponent, PaymentFailedPopupComponent],
  templateUrl: './campaign-public-page.component.html',
  styleUrls: ['./campaign-public-page.component.css'],
})
export class CampaignPublicPageComponent implements OnInit {
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private api    = inject(CampaignApiService);
  private state  = inject(CampaignStudioStateService);
  private ui     = inject(StudioUiService);
  private loader = inject(AppLoaderService);

  isLoading       = true;
  notFound        = false;
  showFailedPopup = false;

  @HostListener('window:resize')
  onResize(): void { this.syncDevice(); }

  private syncDevice(): void {
    this.ui.setDevice(window.innerWidth <= 768 ? 'mobile' : 'desktop');
  }

  ngOnInit(): void {
    this.syncDevice();
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!slug) { this.router.navigate(['/campaigns']); return; }

    // Show failure popup if redirected back from Cardcom after failure
    if (this.route.snapshot.queryParamMap.get('payment') === 'failed') {
      this.showFailedPopup = true;
      // Clean URL without reloading
      this.router.navigate([], { replaceUrl: true, queryParams: {} });
    }

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

  onRetryPayment(): void {
    this.showFailedPopup = false;
    // The preview component handles opening the checkout modal
    // Scroll to donation section so user can try again
    setTimeout(() => {
      const el = document.querySelector('.hm-donate');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}
