import { CurrentContextService } from '../../../../core/services/current-context.service';
import { CampaignJoinDialogComponent } from '../../shared/components/campaign-join-dialog/campaign-join-dialog.component';
import { toObservable } from '@angular/core/rxjs-interop';
import { Subscription, filter, map, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { Component, inject, OnInit, OnDestroy, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { CampaignPreviewComponent } from '../../studio/preview/campaign-preview/campaign-preview.component';
import { SimpleStudioPublicPageComponent } from '../../simple-studio/simple-studio-public-page.component';
import { MinimalDonationPageComponent } from '../../shared/components/minimal-donation-page/minimal-donation-page.component';
import { StudioUiService } from '../../studio/services/studio-ui.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { PaymentFailedPopupComponent } from '../../shared/components/payment-failed-popup/payment-failed-popup.component';
import { DonationToastComponent } from '../../shared/components/donation-toast/donation-toast.component';
import { AmbassadorService, Ambassador, AmbassadorMembership, AmbassadorPublicInfo } from '../../services/ambassador.service';
import { DonationService } from '../../services/donation.service';
import { SimpleStudioCheckoutService } from '../../simple-studio/simple-studio-checkout.service';
import { AnalyticsService } from '../../../../core/services/analytics.service';

import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';
import { HmCampaignContentDirective, HmPublicTextPipe, publicText } from '../../../../core/i18n/content-language';
import { CampaignDraft } from '../../services/campaign-studio-state.service';
import { ContentLang, localizeDraft, publicLanguages } from '../../utils/content-i18n';
import { langParam, recallCampaignLanguage, rememberCampaignLanguage } from '../../utils/campaign-language-memory';
import { HmMoneyArgPipe } from '../../../../core/i18n/money';
@Component({
  selector: 'app-campaign-public-page',
  standalone: true,
  imports: [CampaignJoinDialogComponent, SimpleStudioPublicPageComponent, HmMoneyArgPipe, HmCampaignContentDirective, HmPublicTextPipe, HmIconComponent, CommonModule, CampaignPreviewComponent, MinimalDonationPageComponent, PaymentFailedPopupComponent, DonationToastComponent],
  templateUrl: './campaign-public-page.component.html',
  styleUrls: ['./campaign-public-page.component.css'],
})
export class CampaignPublicPageComponent implements OnInit, OnDestroy {
  private readonly studioCheckout = inject(SimpleStudioCheckoutService);
  @ViewChild(DonationToastComponent) private toast!: DonationToastComponent;

  private route           = inject(ActivatedRoute);
  private router          = inject(Router);
  private title           = inject(Title);
  private api             = inject(CampaignApiService);
  // Not private: the template reads state.draft?.id directly to pass as
  // [manageCampaignId] to the Platform Top Strip once canEdit is true.
  state                    = inject(CampaignStudioStateService);
  private ui              = inject(StudioUiService);
  private loader          = inject(AppLoaderService);
  private readonly auth = inject(AuthService);
  private readonly context = inject(CurrentContextService);

  get publicCampaignAccent(): string {
    const layout = this.state.draft.layout;
    return (layout.simpleStudio as { theme?: { primary?: string } } | undefined)?.theme?.primary
      || layout.theme.primaryColor || '#246f65';
  }

  private enterDonorWorkspace(): void {
    if (!this.auth.currentUser() || this.context.active()?.role === 'donor') return;
    this.context.ensureDonorRole();
    this.context.switchContext('donor', null);
  }
  myAmbassador: AmbassadorMembership | null = null;
  ambassadorLookupError = false;
  ambassadorPageError = false;
  private readonly userId$ = toObservable(this.auth.currentUser).pipe(map(user => user?.id), distinctUntilChanged());
  private readonly lifetime = new Subscription();
  private routeRequests = new Subscription();
  private membershipRequest?: Subscription;
  private routeKey?: string;
  private ambassadorRouteRequest?: Subscription;
  ambassadorRoutePending = false;
  ambassadorRouteIssue: 'not-found' | 'failed' | null = null;
  ambassadorLookupReady = true;
  private ambassadorSvc   = inject(AmbassadorService);
  private donationSvc     = inject(DonationService);
  private analytics       = inject(AnalyticsService);
  private readonly t       = publicText();

  // ── Language (bilingual campaign content, D-43 … D-45) ──
  // Hebrew always; English once the manager published a complete English
  // version. `?lang=en` is the stable link to it.
  contentLang: ContentLang = 'he';
  // Each language is named in itself (common.language.*, same in both dictionaries).
  readonly languageNames: Record<ContentLang, string> = { he: 'common.language.he', en: 'common.language.en' };
  languages: ContentLang[] = ['he'];
  private stored: CampaignDraft | null = null;
  private slug = '';

  languageHref(lang: ContentLang): string {
    return this.router.serializeUrl(this.router.createUrlTree([], {
      relativeTo: this.route, queryParams: { lang: lang === 'en' ? 'en' : null }, queryParamsHandling: 'merge',
    }));
  }

  // Switches in place: nothing is reloaded or re-created, so an open checkout
  // keeps what the donor typed, and the live totals keep counting.
  setLanguage(lang: ContentLang, event?: Event): void {
    event?.preventDefault();
    if (lang === this.contentLang || !this.languages.includes(lang)) return;
    this.applyLanguage(lang, false);
    this.router.navigate([], { relativeTo: this.route, queryParams: { lang: lang === 'en' ? 'en' : null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private applyLanguage(lang: ContentLang, initial: boolean): void {
    if (!this.stored) return;
    this.contentLang = lang;
    const view = localizeDraft(this.stored, lang);
    if (!initial) {
      view.currentAmount = this.state.draft.currentAmount;
      view.supportersCount = this.state.draft.supportersCount;
    }
    this.state.loadDraft(view);
    this.state.setStoredVersion(this.stored);
    this.title.setTitle(view.title ? this.t('publicPage.campaignPublic.pageTitle', { title: view.title }) : this.t('publicPage.campaignPreview.hamonym'));
    rememberCampaignLanguage(this.slug, lang, view.title);
  }

  get isAmbassadorMode(): boolean {
    return !!this.myAmbassador && this.myAmbassador.id === this.currentAmbassador?.id;
  }

  get isMinimalFormat(): boolean {
    return this.state.draft?.layout?.pageFormat === 'minimal';
  }

  editingAmbassador: Ambassador | null = null;
  ambassadorEditorLoading = false;
  ambassadorEditorError = '';

  editMyAmbassadorPage(): void {
    if (!this.isAmbassadorMode || !this.currentAmbassador || this.ambassadorEditorLoading) return;
    const id = this.currentAmbassador.id;
    this.ambassadorEditorError = '';
    this.ambassadorEditorLoading = true;
    this.ambassadorSvc.getEditable(id).subscribe({
      next: row => {
        this.ambassadorEditorLoading = false;
        if (this.isAmbassadorMode && this.currentAmbassador?.id === id) this.editingAmbassador = row;
      },
      error: () => {
        this.ambassadorEditorLoading = false;
        this.ambassadorEditorError = 'לא ניתן לטעון את הטופס. נסו שוב.';
      },
    });
  }

  ambassadorEditSaved(row: Ambassador): void {
    this.editingAmbassador = null;
    const previousSlug = this.currentAmbassador?.slug;
    this.currentAmbassador = row;
    this.retryAmbassadorLookup();
    if (previousSlug !== row.slug) {
      void this.router.navigate(['/campaigns', this.slug, row.slug], { queryParamsHandling: 'preserve', replaceUrl: true });
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
  // True when the logged-in visitor manages this campaign's entity — drives
  // the Platform Top Strip's "ניהול הקמפיין" action (2026-10-06 Platform
  // Navigation Cleanup; previously also showed an in-page "back to edit"
  // bar, removed — management now lives only in the Top Strip, never
  // inside the campaign content itself). Deliberately checked via an
  // authenticated API call (reusing getBySlug()'s existing user_entities
  // ownership join), never via a URL flag/query-param/referrer — those
  // could be guessed, bookmarked, or shared, exposing the affordance (even
  // just its existence) to an outside visitor. A stranger's request to the
  // authenticated endpoint below simply 403/404s, so canEdit stays false
  // for them regardless of how they arrived at this URL.
  canEdit         = false;
  currentAmbassador: Ambassador | null = null;
  ambassadorsList: AmbassadorPublicInfo[] | null = null;
  autoOpenJoin    = false;
  minimalJoinOpen = false;

  get minimalAmbassadorActionLabel(): string | null {
    if (this.ownerPreview || this.state.draft.status !== 'published' || !this.ambassadorLookupReady) return null;
    if (!this.myAmbassador) return 'הצטרפו כשגרירים';
    return this.myAmbassador.status === 'active' && this.myAmbassador.id !== this.currentAmbassador?.id
      ? 'לדף השגריר שלי' : null;
  }

  runMinimalAmbassadorAction(): void {
    if (!this.minimalAmbassadorActionLabel) return;
    if (this.myAmbassador) {
      void this.router.navigate(['/campaigns', this.slug, this.myAmbassador.slug]);
    } else {
      this.minimalJoinOpen = true;
    }
  }

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

  celebratingGoal = false;
  readonly goalConfetti = Array.from({ length: 240 }, (_, index) => ({
    left: (index * 37) % 100,
    delay: (index % 10) * 0.09,
    drift: ((index % 7) - 3) * 90,
    color: ['#7c3aed', '#16a34a', '#fbbf24', '#06b6d4', '#ec4899', '#f97316'][index % 6],
  }));
  private goalCelebrationTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly celebratedGoals = new Set<string>();

  get goalAchieved(): boolean {
    const target = this.state.draft.targetAmount ?? 0;
    return target > 0 && (this.state.draft.currentAmount ?? 0) >= target;
  }

  get goalProgressPct(): number {
    const target = this.state.draft.targetAmount ?? 0;
    return target > 0 ? Math.round(((this.state.draft.currentAmount ?? 0) / target) * 100) : 0;
  }

  private celebrateGoalCrossing(previousAmount: number): void {
    const draft = this.state.draft;
    const target = draft.targetAmount ?? 0;
    if (!draft.id || !this.goalAchieved || previousAmount >= target) return;
    const key = `hamonym:goal-celebrated:${draft.id}:${target}`;
    if (this.celebratedGoals.has(key)) return;
    this.celebratedGoals.add(key);
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch { /* The in-memory guard still works when storage is unavailable. */ }
    this.celebratingGoal = true;
    if (this.goalCelebrationTimer) clearTimeout(this.goalCelebrationTimer);
    this.goalCelebrationTimer = setTimeout(() => { this.celebratingGoal = false; }, 4000);
  }

  @HostListener('window:resize')
  onResize(): void { this.syncDevice(); }

  private syncDevice(): void {
    this.ui.setDevice(window.innerWidth <= 768 ? 'mobile' : 'desktop');
  }

  ngOnInit(): void {
    this.syncDevice();
    this.enterDonorWorkspace();
    this.loadRoute();
    this.lifetime.add(this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => this.loadRoute()));
    this.lifetime.add(this.userId$.subscribe(() => {
      this.enterDonorWorkspace();
      this.retryAmbassadorLookup();
    }));
  }

  keepsPublicCampaignMounted(url: string): boolean {
    if (!this.stored || this.isLoading || this.notFound || this.ambassadorPageError || !this.state.draft.layout.simpleStudio) return false;
    const segments = this.router.parseUrl(url).root.children['primary']?.segments;
    if (!segments || segments[0]?.path !== 'campaigns' || segments[1]?.path !== this.slug ||
        (segments.length !== 2 && segments.length !== 3)) return false;
    const tail = segments[2]?.path;
    if (!tail || tail === 'view') return true;
    if (['success', 'edit', 'classic', 'studio', 'simple-studio', 'ambassador-studio', 'create'].includes(tail)) return false;
    // A UUID can also enter the separately guarded management workspace.
    return !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(this.slug);
  }

  private loadRoute(force = false): void {
    const slug          = this.route.snapshot.paramMap.get('slug');
    const ambassadorSlug =
      this.route.snapshot.paramMap.get('ambassadorSlug') ??
      this.route.snapshot.queryParamMap.get('a');

    if (!slug) { this.router.navigate(['/campaigns']); return; }
    const key = JSON.stringify([slug, ambassadorSlug]);
    if (!force && key === this.routeKey) return;
    this.routeKey = key;
    this.enterDonorWorkspace();
    this.ambassadorRouteRequest?.unsubscribe();
    this.ambassadorRoutePending = false;
    this.ambassadorRouteIssue = null;
    if (this.stored && this.slug === slug && !this.isLoading && !this.notFound &&
        !this.ambassadorPageError && this.state.draft.layout.simpleStudio) {
      this.loadAmbassadorRoute(slug, ambassadorSlug, this.state.draft.id, true);
      return;
    }
    this.routeRequests.unsubscribe();
    this.routeRequests = new Subscription();
    this.membershipRequest?.unsubscribe();
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.stored = null;
    this.currentAmbassador = this.myAmbassador = null;
    this.ambassadorLookupReady = false;
    this.ambassadorLookupError = this.ambassadorPageError = false;
    this.isLoading = true;
    this.minimalJoinOpen = false;
    this.canEdit = this.ownerPreview = this.notFound = false;

    if (this.route.snapshot.queryParamMap.get('payment') === 'failed') {
      // Checkout V2 Step 3 (2026-09-26) — same iframe/postMessage bridge as
      // donation-success.component.ts's own doc comment. CardCom's
      // FailedRedirectUrl chain can land here inside the payment iframe;
      // showing the whole campaign page + failed popup squeezed into that
      // small frame would look broken, so signal the parent instead and
      // skip rendering anything here.
      if (window.top !== window.self) {
        window.parent.postMessage({ source: 'hamonym-donation-return', status: 'failed' }, window.location.origin);
        return;
      }
      this.showFailedPopup = true;
      this.router.navigate([], { replaceUrl: true, queryParams: ambassadorSlug ? { a: ambassadorSlug } : {} });
    }

    const sinceParm = this.route.snapshot.queryParamMap.get('since');
    this.autoOpenJoin = this.route.snapshot.queryParamMap.get('join') === 'ambassador';

    this.routeRequests.add(this.api.getBySlugPublic(slug).subscribe({
      next: (data) => {
        this.onCampaignLoaded(data, slug, ambassadorSlug, sinceParm);
        // Normal case (campaign already public): the public call already
        // succeeded, so this ownership check runs silently in the
        // background purely to decide whether to show "back to edit" — it
        // never blocks the page or is shown as an error to a visitor who
        // isn't the manager.
        if (localStorage.getItem('token')) this.checkOwnership(slug);
      },
      error: () => {
        // The true public endpoint 404s whenever the owning entity isn't
        // approved (active) yet — even for the campaign's own manager,
        // who should still be able to preview their own work in progress.
        // Fall back to the authenticated, ownership-scoped lookup (no
        // entity/publish-status restriction) before giving up.
        const token = localStorage.getItem('token');
        if (!token) { this.showNotFound(); return; }

        this.routeRequests.add(this.api.getBySlug(slug).subscribe({
          next: (data) => {
            this.ownerPreview = true;
            this.canEdit       = true;
            this.onCampaignLoaded(data, slug, ambassadorSlug, sinceParm);
          },
          error: () => this.showNotFound(),
        }));
      },
    }));
  }

  // Silent ownership probe for the common case (campaign already public) —
  // reuses getBySlug()'s existing entity_id/user_entities authorization
  // join; a non-manager (or anonymous visitor, though this is only called
  // when a token exists) just gets a 403/404 here and canEdit stays false.
  private checkOwnership(slug: string): void {
    this.routeRequests.add(this.api.getBySlug(slug).subscribe({
      next: () => { this.canEdit = true; },
      error: () => {},
    }));
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
    this.snapshotTakenAt = new Date();
    // lastSeenAt gates which polled donations become toasts — sinceParm
    // (passed from the donation-success page's "back to campaign" link,
    // looking 10 minutes back) lets the donor's own just-completed
    // donation still surface as a toast even though it finished before
    // this page load. snapshotTakenAt (above) still gates the running
    // total separately, so that donation isn't double-counted.
    this.lastSeenAt = sinceParm ? new Date(sinceParm) : this.snapshotTakenAt;
    this.slug = slug;
    this.stored = data;
    this.languages = publicLanguages(data);
    const requested = langParam(this.route.snapshot.queryParamMap.get('lang')) ?? recallCampaignLanguage(slug)?.lang ?? 'he';
    const lang = this.languages.includes(requested) ? requested : 'he';
    // A link to a version that is not available opens Hebrew, without a misleading ?lang=.
    if (requested !== lang && this.route.snapshot.queryParamMap.has('lang')) {
      this.router.navigate([], { relativeTo: this.route, queryParams: { lang: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    this.applyLanguage(lang, true);


    this.analytics.init(data.entityGaMeasurementId);
    this.analytics.trackEvent('campaign_view', {
      campaign_name: data.title,
      campaign_id:   data.id,
    });

    this.retryAmbassadorLookup();
    const render = () => {
      this.loader.hide();
      this.isLoading = false;
      this.studioCheckout.resumeOnPublicPage(this.state.draft);
      this.startLivePolling(slug, sinceParm ?? undefined);
    };
    this.loadAmbassadorRoute(slug, ambassadorSlug, data.id, false, render);
  }

  private loadAmbassadorRoute(
    slug: string, ambassadorSlug: string | null, campaignId: string | undefined,
    preservePage: boolean, render = () => {},
  ): void {
    this.currentAmbassador = null;
    this.ambassadorRoutePending = !!ambassadorSlug;
    if (!ambassadorSlug) { render(); return; }

    this.ambassadorRouteRequest = this.ambassadorSvc.getBySlug(slug, ambassadorSlug, true).subscribe({
      next: ambassador => {
        this.ambassadorRoutePending = false;
        if (!ambassador || ambassador.status !== 'active' || String(ambassador.campaignId) !== String(campaignId)) {
          if (preservePage) this.ambassadorRouteIssue = 'not-found';
          else this.showNotFound();
          return;
        }
        this.currentAmbassador = ambassador;
        render();
      },
      error: () => {
        this.ambassadorRoutePending = false;
        if (preservePage) this.ambassadorRouteIssue = 'failed';
        else {
          this.ambassadorPageError = true;
          this.loader.hide();
          this.isLoading = false;
        }
      },
    });
  }

  retryAmbassadorPage(): void { this.loadRoute(true); }

  retryAmbassadorLookup(): void {
    this.membershipRequest?.unsubscribe();
    const campaign = this.stored;
    const userId = this.auth.currentUser()?.id;
    this.myAmbassador = null;
    this.ambassadorLookupError = false;
    this.ambassadorLookupReady = !userId;
    if (!campaign || !userId) return;

    this.membershipRequest = this.ambassadorSvc.getMyCampaigns(true).subscribe({
      next: campaigns => {
        if (this.stored !== campaign || this.auth.currentUser()?.id !== userId) return;
        const matches = campaigns.filter(row => String(row.id) === String(campaign.id));
        const active = matches.filter(row => row.ambassadorStatus === 'active');
        const membership = active.length === 1 ? active[0] : matches.length === 1 ? matches[0] : undefined;
        if (matches.length && (!membership?.ambassadorId || !membership.ambassadorSlug)) {
          this.ambassadorLookupError = true;
          return;
        }
        this.myAmbassador = membership ? {
          id: membership.ambassadorId, slug: membership.ambassadorSlug, status: membership.ambassadorStatus,
        } : null;
        this.ambassadorLookupReady = true;
      },
      error: () => {
        if (this.stored === campaign && this.auth.currentUser()?.id === userId) this.ambassadorLookupError = true;
      },
    });
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

    this.routeRequests.add(this.donationSvc.getLive(this.pollSlug, since).subscribe({
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
          const previousAmount = this.state.draft.currentAmount ?? 0;
          this.state.bumpRaisedAmount(total, countable.length);
          this.celebrateGoalCrossing(previousAmount);
        }

        for (const item of newItems) {
          this.toast?.add(item);
        }
      },
    }));
  }

  ngOnDestroy(): void {
    this.lifetime.unsubscribe();
    this.ambassadorRouteRequest?.unsubscribe();
    this.routeRequests.unsubscribe();
    this.membershipRequest?.unsubscribe();
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.goalCelebrationTimer) clearTimeout(this.goalCelebrationTimer);
  }

  onRetryPayment(): void {
    this.showFailedPopup = false;
    setTimeout(() => {
      const el = document.querySelector('.hm-donate');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}
