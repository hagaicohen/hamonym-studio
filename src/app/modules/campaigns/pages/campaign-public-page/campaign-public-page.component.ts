import { Component, inject, OnInit, OnDestroy, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { CampaignPreviewComponent } from '../../studio/preview/campaign-preview/campaign-preview.component';
import { StudioUiService } from '../../studio/services/studio-ui.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { PaymentFailedPopupComponent } from '../../shared/components/payment-failed-popup/payment-failed-popup.component';
import { DonationToastComponent } from '../../shared/components/donation-toast/donation-toast.component';
import { AmbassadorService, Ambassador, AmbassadorPublicInfo } from '../../services/ambassador.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { DonationService } from '../../services/donation.service';
import { AnalyticsService } from '../../../../core/services/analytics.service';

@Component({
  selector: 'app-campaign-public-page',
  standalone: true,
  imports: [CommonModule, CampaignPreviewComponent, PaymentFailedPopupComponent, DonationToastComponent],
  templateUrl: './campaign-public-page.component.html',
  styleUrls: ['./campaign-public-page.component.css'],
})
export class CampaignPublicPageComponent implements OnInit, OnDestroy {
  @ViewChild(DonationToastComponent) private toast!: DonationToastComponent;

  private route           = inject(ActivatedRoute);
  private router          = inject(Router);
  private title           = inject(Title);
  private api             = inject(CampaignApiService);
  private state           = inject(CampaignStudioStateService);
  private ui              = inject(StudioUiService);
  private loader          = inject(AppLoaderService);
  private ambassadorSvc   = inject(AmbassadorService);
  private ctx             = inject(CurrentContextService);
  private donationSvc     = inject(DonationService);
  private analytics       = inject(AnalyticsService);

  get isAmbassadorMode(): boolean {
    return this.ctx.active()?.role === 'ambassador';
  }

  editMyAmbassadorPage(): void {
    if (this.currentAmbassador?.campaignId) {
      this.router.navigate(['/campaigns', this.currentAmbassador.campaignId, 'ambassador-studio']);
    }
  }

  isLoading       = true;
  notFound        = false;
  showFailedPopup = false;
  // True when the page loaded via the authenticated owner-scoped fallback
  // below, not the true public endpoint — happens when the campaign is
  // published but the owning entity isn't approved (active) yet, so
  // anonymous visitors can't see it, but the manager themselves should
  // still be able to preview their own work in progress.
  ownerPreview    = false;
  currentAmbassador: Ambassador | null = null;
  ambassadorsList: AmbassadorPublicInfo[] | null = null;
  autoOpenJoin    = false;

  private pollSlug    = '';
  private pollLookback = '';
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  // Snapshot moment of the current_amount we loaded — the live-poll lookback
  // window (used for toasts) can reach further back than this and re-surface
  // a donation already baked into that snapshot, so only items newer than
  // this are added to the running total to avoid double-counting it.
  private snapshotTakenAt = new Date();
  // High-water mark of the latest completed_at already processed by a poll —
  // advances only forward, so re-querying an overlapping window (see
  // pollLive) can never re-count or re-toast the same donation twice.
  private lastSeenAt = new Date();

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
      this.route.snapshot.queryParamMap.get('a');

    if (!slug) { this.router.navigate(['/campaigns']); return; }

    if (this.route.snapshot.queryParamMap.get('payment') === 'failed') {
      this.showFailedPopup = true;
      this.router.navigate([], { replaceUrl: true, queryParams: ambassadorSlug ? { a: ambassadorSlug } : {} });
    }

    const sinceParm = this.route.snapshot.queryParamMap.get('since');
    this.autoOpenJoin = this.route.snapshot.queryParamMap.get('join') === 'ambassador';

    this.api.getBySlugPublic(slug).subscribe({
      next: (data) => this.onCampaignLoaded(data, slug, ambassadorSlug, sinceParm),
      error: () => {
        // The true public endpoint 404s whenever the owning entity isn't
        // approved (active) yet — even for the campaign's own manager,
        // who should still be able to preview their own work in progress.
        // Fall back to the authenticated, ownership-scoped lookup (no
        // entity/publish-status restriction) before giving up.
        const token = localStorage.getItem('token');
        if (!token) { this.showNotFound(); return; }

        this.api.getBySlug(slug).subscribe({
          next: (data) => {
            this.ownerPreview = true;
            this.onCampaignLoaded(data, slug, ambassadorSlug, sinceParm);
          },
          error: () => this.showNotFound(),
        });
      },
    });
  }

  private showNotFound(): void {
    this.loader.hide();
    this.notFound  = true;
    this.isLoading = false;
  }

  private onCampaignLoaded(data: any, slug: string, ambassadorSlug: string | null, sinceParm: string | null): void {
    // The page never set its own title, so on arrival from the
    // donation-success page the browser tab kept showing "תודה על
    // תרומתך — X" indefinitely — Angular doesn't reset <title> on
    // navigation by itself.
    this.title.setTitle(data.title ? `${data.title} — המונים` : 'המונים');
    this.snapshotTakenAt = new Date();
    this.lastSeenAt      = this.snapshotTakenAt;
    this.state.loadDraft(data);
    this.loader.hide();
    this.isLoading = false;

    this.analytics.init(data.entityGaMeasurementId);
    this.analytics.trackEvent('campaign_view', {
      campaign_name: data.title,
      campaign_id:   data.id,
    });

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

    this.startLivePolling(slug, sinceParm ?? undefined);
  }

  private startLivePolling(slug: string, since?: string): void {
    this.pollSlug     = slug;
    // since param passed from success page; default 5-min lookback for fresh viewers
    this.pollLookback = since ?? new Date(Date.now() - 5 * 60_000).toISOString();
    this.pollInterval = setInterval(() => this.pollLive(), 5000);
  }

  private pollLive(): void {
    const since = this.pollLookback;
    // Overlap each window a few seconds past the poll interval: since is
    // advanced client-side before the request round-trips, a donation that
    // completes in that gap must not permanently fall between two
    // non-overlapping windows. lastSeenAt (below) dedupes the overlap.
    this.pollLookback = new Date(Date.now() - 8000).toISOString();

    this.donationSvc.getLive(this.pollSlug, since).subscribe({
      next: items => {
        const newItems = items.filter(item => item.completedAt > this.lastSeenAt);
        if (newItems.length === 0) return;

        this.lastSeenAt = newItems.reduce(
          (max, item) => (item.completedAt > max ? item.completedAt : max),
          this.lastSeenAt,
        );

        // Items already reflected in the initial snapshot (possible when
        // `since` looks further back than page load, e.g. the default
        // lookback or the ?since= from the success-page redirect) are still
        // shown as toasts, but must not be added to the total again.
        const countable = newItems.filter(item => item.completedAt > this.snapshotTakenAt);
        if (countable.length > 0) {
          const total = countable.reduce((sum, item) => sum + item.amount, 0);
          this.state.bumpRaisedAmount(total, countable.length);
        }

        for (const item of newItems) {
          this.toast?.add(item);
        }
      },
    });
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  onRetryPayment(): void {
    this.showFailedPopup = false;
    setTimeout(() => {
      const el = document.querySelector('.hm-donate');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}
