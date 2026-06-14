import { Component, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { CampaignPreviewComponent } from '../../studio/preview/campaign-preview/campaign-preview.component';
import { StudioUiService } from '../../studio/services/studio-ui.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { PaymentFailedPopupComponent } from '../../shared/components/payment-failed-popup/payment-failed-popup.component';
import { AmbassadorService, Ambassador, AmbassadorPublicInfo } from '../../services/ambassador.service';

@Component({
  selector: 'app-campaign-public-page',
  standalone: true,
  imports: [CommonModule, CampaignPreviewComponent, PaymentFailedPopupComponent],
  templateUrl: './campaign-public-page.component.html',
  styleUrls: ['./campaign-public-page.component.css'],
})
export class CampaignPublicPageComponent implements OnInit {
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);
  private api             = inject(CampaignApiService);
  private state           = inject(CampaignStudioStateService);
  private ui              = inject(StudioUiService);
  private loader          = inject(AppLoaderService);
  private ambassadorSvc   = inject(AmbassadorService);

  isLoading       = true;
  notFound        = false;
  showFailedPopup = false;
  currentAmbassador: Ambassador | null = null;
  ambassadorsList: AmbassadorPublicInfo[] | null = null;

  @HostListener('window:resize')
  onResize(): void { this.syncDevice(); }

  private syncDevice(): void {
    this.ui.setDevice(window.innerWidth <= 768 ? 'mobile' : 'desktop');
  }

  ngOnInit(): void {
    this.syncDevice();
    const slug          = this.route.snapshot.paramMap.get('slug');
    const ambassadorSlug =
      this.route.snapshot.paramMap.get('ambassadorSlug') ??
      this.route.snapshot.queryParamMap.get('a'); // backwards compat

    if (!slug) { this.router.navigate(['/campaigns']); return; }

    if (this.route.snapshot.queryParamMap.get('payment') === 'failed') {
      this.showFailedPopup = true;
      this.router.navigate([], { replaceUrl: true, queryParams: ambassadorSlug ? { a: ambassadorSlug } : {} });
    }

    this.api.getBySlug(slug).subscribe({
      next: (data) => {
        this.state.loadDraft(data);
        this.loader.hide();
        this.isLoading = false;

        // Load ambassador leaderboard
        this.ambassadorSvc.listPublic(slug).subscribe({
          next: list => { this.ambassadorsList = list; },
        });

        if (ambassadorSlug) {
          this.ambassadorSvc.getBySlug(slug, ambassadorSlug).subscribe({
            next: amb => {
              if (amb?.status === 'inactive') {
                this.router.navigate(['/campaigns', slug, 'view'], { replaceUrl: true });
                return;
              }
              this.currentAmbassador = amb;
            },
          });
        }
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
    setTimeout(() => {
      const el = document.querySelector('.hm-donate');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}
