import { AfterViewInit, Component, ComponentRef, EmbeddedViewRef, EnvironmentInjector, OnDestroy, TemplateRef, ViewChild, ViewContainerRef, ViewEncapsulation, createEnvironmentInjector, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { STUDIO_SLUG, StudioSlugCheck, validCampaignSlug } from './studio-slug';
import { isoDate, parseIsoDate } from './vendor-v462/management/management-model.service';
import { UploadService } from '../../../core/services/upload.service';
import { AuthService } from '../../../core/services/auth.service';
import { MediaStoreService, isMediaRef } from './vendor-v462/media/media-store.service';
import { CampaignApiService } from '../services/campaign-api.service';
import { CampaignDraft, CampaignStudioStateService } from '../services/campaign-studio-state.service';
import { CurrentContextService } from '../../../core/services/current-context.service';
import { AppLoaderService } from '../../../core/services/app-loader.service';
import { EntitiesService } from '../../../core/services/entities.service';
import { ToastService } from '../../../core/services/toast.service';
import { AppComponent as StudioComponent } from './vendor-v462/app.component';
import { CampaignDraftStorageService, HamDraftStorageBridge } from './vendor-v462/persistence/campaign-draft-storage.service';
import { CampaignStateService } from './vendor-v462/core/campaign-state.service';
import { blankCampaign } from './vendor-v462/core/campaign-defaults';
import { StudioToolbarService } from './vendor-v462/layout/studio-toolbar.service';
import { ManagementViewService } from './vendor-v462/management/management-view.service';
import { CampaignMediaEngineService } from './vendor-v462/media/campaign-media-engine.service';
import { WizardService } from './vendor-v462/wizard/wizard.service';
import { PublicationCheck, PublicationState, STUDIO_PUBLICATION, StudioPublication } from './vendor-v462/management/pages/publication-checks.component';
import { CampaignPublicationService } from '../services/campaign-publication.service';
import { STUDIO_CHECKOUT } from './studio-checkout';
import { bindStudioCommerce, studioCommerce } from './studio-commerce';
import { SimpleStudioCheckoutService } from './simple-studio-checkout.service';

class PublicationValidationError extends Error {
  constructor(message: string, readonly notified = false) { super(message); }
}

@Component({
  selector: 'app-simple-studio-page',
  standalone: true,
  host: { 'data-hamonym-editor': 'simple-studio-v4.62' },
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./simple-studio-toolbar.css'],
  styles: [`
    app-simple-studio-page {
      display: flex;
      flex-direction: column;
      position: fixed;
      top: var(--header-height, 72px);
      inset-inline: 0;
      bottom: 0;
      z-index: 1;
      contain: layout paint;
      isolation: isolate;
      overflow: hidden;
    }
    app-simple-studio-page[data-hamonym-editor] > app-root { display: contents; }
    app-simple-studio-page[data-hamonym-editor] .top { flex-shrink: 0; }
    app-simple-studio-page[data-hamonym-editor] .workspace {
      flex: 1 1 0 !important;
      height: auto !important;
      min-height: 0 !important;
    }
    app-simple-studio-page[data-hamonym-editor] .workspace > .stage > .stage-foot { display: none !important; }
    app-simple-studio-page[data-hamonym-editor] .workspace > .stage > .canvas {
      min-height: 0 !important;
      overflow: auto !important;
    }
    app-simple-studio-page[data-hamonym-editor] .canvas > #preview.mobile { flex-shrink: 0; }
    body.hamonym-simple-studio-active #hwWizard .hw-app {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
      min-height: 0 !important;
    }
    body.hamonym-simple-studio-active #hwWizard .hw-layout {
      flex: 1 1 0 !important;
      height: auto !important;
      min-height: 0 !important;
    }
    body.hamonym-simple-studio-active #hwWizard .hw-preview-mount {
      flex: 1 1 0 !important; min-height: 0 !important; overflow-y: auto !important;
    }
    body.hamonym-simple-studio-active #hwWizard .hw-preview-note,
    body.hamonym-simple-studio-active #hwWizard .ham-angular-wizard-header { display: none !important; }
    body.hamonym-simple-studio-active #hwWizard,
    body.hamonym-simple-studio-active > .ham-wide-backdrop {
      top: var(--header-height, 72px) !important;
      height: calc(100dvh - var(--header-height, 72px)) !important;
    }
    [data-hamonym-studio-controls] { display: contents; }
    [data-hamonym-studio-controls] .ham-host-save,
    [data-hamonym-studio-controls] .ham-host-finish {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      min-width: 40px; height: 40px; box-sizing: border-box; padding: 0 10px;
      border: 1px solid #dce3e8; border-radius: 8px; background: white; color: #243b47;
      font: 600 12px Heebo, sans-serif; white-space: nowrap; cursor: pointer;
    }
    [data-hamonym-studio-controls] svg { width: 18px; height: 18px; flex-shrink: 0; }
    [data-hamonym-save][data-ham-save-state="saving"] { cursor: progress; }
    [data-hamonym-save][data-ham-save-state="saving"] svg { animation: ham-host-save-spin .85s linear infinite; }
    @keyframes ham-host-save-spin { to { transform: rotate(360deg); } }
    [data-hamonym-save][data-ham-save-state="saved"] { color: #23734a; border-color: #b5dbc5; background: #f2faf5; }
    [data-hamonym-save][data-ham-save-state="failed"] { color: #b42318; border-color: #f3b4ae; background: #fff5f4; }
    .ham-studio-exit-dialog { width: min(460px, calc(100vw - 32px)); border: 1px solid #dce3e8; border-radius: 16px; padding: 24px; color: #243b47; background: white; box-shadow: 0 20px 60px #0f172a33; }
    .ham-studio-exit-dialog::backdrop { background: #0f172a66; }
    .ham-studio-exit-dialog h2 { margin: 0 0 8px; font-size: 19px; }
    .ham-studio-exit-dialog p { margin: 0 0 16px; font-size: 13px; line-height: 1.7; }
    .ham-studio-exit-dialog label { display: grid; gap: 6px; font-size: 13px; }
    .ham-studio-exit-dialog input { width: 100%; height: 36px; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 10px; font: inherit; }
    .ham-studio-exit-dialog .ham-exit-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
    .ham-studio-exit-dialog button { min-height: 36px; border: 1px solid #dce3e8; border-radius: 8px; padding: 0 12px; background: white; color: #243b47; font: inherit; font-size: 12px; cursor: pointer; }
    .ham-studio-exit-dialog .ham-exit-save { background: #6d3bd1; border-color: #6d3bd1; color: #fff; }
    .ham-publication-dialog .ham-exit-save { background: #20775e; border-color: #20775e; }
    .ham-publication-url { display: block; font-size: 12px; overflow-wrap: anywhere; user-select: text; }
    .ham-studio-exit-dialog .ham-exit-discard { color: #b42318; }
    .ham-studio-exit-dialog button:disabled { opacity: .6; cursor: wait; }
    .ham-studio-exit-dialog .ham-exit-error { margin-top: 12px; color: #b42318; font-size: 12px; }
  `],
  template: `@if (message) { <p dir="rtl" role="status">{{ message }}</p> }
    <ng-container #studio />
    <ng-template #toolbarIcon let-path let-label="label"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="path" /></svg>@if (label) { <span>{{ label }}</span> }</ng-template>
    <ng-template #campaignIdentity><div class="ham-host-identity" dir="rtl">
      @if (toolbarCampaignImage(); as image) { <img class="ham-host-avatar" [src]="image" alt="" (error)="failedAvatarUrl = image" /> }
      <div class="ham-host-identity-text">
        <div class="ham-host-identity-title"><strong [title]="toolbarCampaignName()">{{ toolbarCampaignName() }}</strong>@if (wizardToolbarActive) { <span class="ham-host-status">{{ toolbarCampaignStatus() }}</span> }</div>
        <small>{{ wizardToolbarActive ? 'שלב יצירת הקמפיין' : toolbarCampaignSubtitle() }}</small>
      </div>
    </div></ng-template>
    <ng-template #exitAction><span data-hamonym-studio-controls>
        <button type="button" class="ham-host-save" data-hamonym-save
          [attr.data-hamonym-wizard-save]="wizardToolbarActive ? '' : null"
          [title]="saveTooltip()" [attr.aria-label]="saveTooltip()"
          [attr.aria-busy]="saveButtonState() === 'saving'"
          [disabled]="saveDisabled()"
          [attr.data-ham-save-state]="saveButtonState()" (click)="saveDraft()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            @for (path of saveIconPaths(); track $index) { <path [attr.d]="path" /> }
            @if (saveButtonState() === 'failed') { <circle cx="12" cy="12" r="9" /> }
          </svg>
          @if (saveLabel()) { <span aria-live="polite">{{ saveLabel() }}</span> }
        </button>
      </span><span data-hamonym-studio-controls class="ham-host-navigation">
      <button type="button" class="ham-host-finish" data-hamonym-finish-editing (click)="exit()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m13 5 7 7-7 7M20 12H4" /></svg>
        <span>סיום עריכה</span>
      </button>
    </span></ng-template>
    <ng-template #publicationDialog>
      @let publication = publicationDialogState();
      <dialog class="ham-studio-exit-dialog ham-publication-dialog" dir="rtl" aria-labelledby="publication-confirm-title" (cancel)="$event.preventDefault(); cancelPublicationConfirmation()">
        <h2 id="publication-confirm-title">לפרסם את הקמפיין עכשיו?</h2>
        <p><strong>{{ publicationCampaignName() }}</strong></p>
        <span class="ham-publication-url" dir="ltr">{{ publication.publicUrl }}</span>
        @if (publication.error) { <p class="ham-exit-error" role="alert">{{ publication.error }}</p> }
        <div class="ham-exit-actions">
          <button class="ham-exit-save" type="button" [disabled]="publication.publishing || publication.loading" [attr.aria-busy]="publication.publishing" (click)="confirmStudioPublication()">{{ publication.publishing ? 'מפרסם…' : 'אישור ופרסום' }}</button>
          <button type="button" [disabled]="publication.publishing" (click)="cancelPublicationConfirmation()">ביטול</button>
        </div>
      </dialog>
    </ng-template>
    <ng-template #exitDialog><dialog class="ham-studio-exit-dialog" dir="rtl"
      aria-labelledby="ham-exit-title" (cancel)="$event.preventDefault(); continueEditing()">
      <h2 id="ham-exit-title">לשמור לפני סיום העריכה?</h2>
      <p>יש שינויים שטרם נשמרו לשרת. אפשר לשמור ולסיים, להמשיך לערוך או לצאת ללא שמירה.</p>
      @if (needsCampaignName()) {
        <label>שם הקמפיין
          <input data-hamonym-exit-name [value]="exitName" (input)="exitName = $any($event.target).value"
            [disabled]="exitSaving" autocomplete="off" required />
        </label>
      }
      @if (exitError) { <div class="ham-exit-error" role="alert">{{ exitError }}</div> }
      <div class="ham-exit-actions">
        <button type="button" class="ham-exit-save" data-hamonym-save-exit (click)="saveAndExit()" [disabled]="exitSaving">{{ exitSaving ? 'שומר…' : 'שמור וסיים' }}</button>
        <button type="button" data-hamonym-continue-editing autofocus (click)="continueEditing()" [disabled]="exitSaving">המשך עריכה</button>
        <button type="button" class="ham-exit-discard" data-hamonym-discard-exit (click)="discardAndExit()" [disabled]="exitSaving">צא ללא שמירה</button>
      </div>
    </dialog></ng-template>`,
})
export class SimpleStudioPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('studio', { read: ViewContainerRef, static: true }) private host!: ViewContainerRef;
  @ViewChild('exitAction', { static: true }) private exitAction!: TemplateRef<unknown>;
  @ViewChild('exitDialog', { static: true }) private exitDialog!: TemplateRef<unknown>;
  @ViewChild('publicationDialog', { static: true }) private publicationDialog!: TemplateRef<unknown>;
  private publicationConfirmationView?: EmbeddedViewRef<unknown>;
  private publicationConfirmationElement?: HTMLDialogElement;
  @ViewChild('campaignIdentity', { static: true }) private campaignIdentity!: TemplateRef<unknown>;
  @ViewChild('toolbarIcon', { static: true }) private toolbarIcon!: TemplateRef<unknown>;
  private readonly api = inject(CampaignApiService);
  private readonly publicCheckout = inject(SimpleStudioCheckoutService);
  private readonly publisher = inject(CampaignPublicationService);
  private readonly uploads = inject(UploadService);
  private readonly auth = inject(AuthService);
  private readonly uploadedHeroImages = new Map<string, string>();
  private readonly environment = inject(EnvironmentInjector);
  private publicationInjector?: EnvironmentInjector;
  private publicationOperation?: Promise<void>;
  private publicationSlugCheck?: StudioSlugCheck;
  private publicationEntity: { status?: string; cardcom_connection_status?: string } | null = null;
  private readonly publicationState = signal<PublicationState>({ loading: false, publishing: false, status: '', checks: [], canPublish: false, publicUrl: '', error: '' });
  private readonly publication: StudioPublication = {
    state: this.publicationState.asReadonly(),
    refresh: () => this.refreshPublication(),
    saveAndRefresh: () => this.refreshPublication(true),
    publish: () => this.requestPublicationConfirmation(),
    openCheck: check => this.openPublicationCheck(check),
    copyUrl: async () => {
      const url = this.publicationState().publicUrl;
      if (!url) return;
      try { await navigator.clipboard.writeText(url); this.toasts.show('success', 'הקישור הועתק'); }
      catch { this.toasts.show('warning', 'לא ניתן להעתיק אוטומטית', 'אפשר לסמן ולהעתיק את הכתובת המוצגת.'); }
    },
  };
  private readonly entities = inject(EntitiesService);
  private readonly toasts = inject(ToastService);
  private saveErrorToast?: number;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly context = inject(CurrentContextService);
  private readonly loader = inject(AppLoaderService);
  private readonly platformState = inject(CampaignStudioStateService);
  private studioState?: CampaignStateService;
  private studioRef?: ComponentRef<StudioComponent>;
  private previousStorage?: HamDraftStorageBridge;
  private adapter?: HamDraftStorageBridge;
  private toolbar?: StudioToolbarService;
  private actionsView?: EmbeddedViewRef<unknown>;
  private sharedToolbar?: HTMLElement;
  private identityView?: EmbeddedViewRef<unknown>;
  private wizardDemoAction?: HTMLElement;
  private wizardCommands: HTMLElement[] = [];
  private wizardCommandOwner?: Element;
  private toolbarAvailability?: ReturnType<typeof effect>;
  private toolbarObserver?: MutationObserver;
  wizardToolbarActive = false;
  private campaign!: CampaignDraft;
  private organizationName = '';
  failedAvatarUrl = '';
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private baselineDocument = '';
  private cleanFingerprint = '';
  private initialized = false;
  private remoteRequested = false;
  private saveError = '';
  private readonly saveSucceeded = signal(false);
  private saveFeedbackTimer?: ReturnType<typeof setTimeout>;
  private recoveryKey = '';
  private exitView?: EmbeddedViewRef<unknown>;
  private exitElement?: HTMLDialogElement;
  private exitDecision?: Promise<boolean>;
  private resolveExit?: (allow: boolean) => void;
  exitName = '';
  exitError = '';
  exitSaving = false;
  private localDocument = '';
  private sheet?: HTMLLinkElement;
  private exportStyles?: HTMLStyleElement;
  private destroyed = false;
  message = '';

  private readonly beforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.hasUnsavedChanges() || this.publicationState().publishing) { event.preventDefault(); event.returnValue = ''; }
  };

  async ngAfterViewInit(): Promise<void> {
    this.loader.show('');
    try {
      const id = this.route.snapshot.paramMap.get('id');
      if (id) {
        this.campaign = await firstValueFrom(this.api.getById(id));
      } else {
        const active = this.context.active();
        if (active?.role !== 'entity-manager' || !active.context?.id) throw new Error('יש לבחור ארגון ליצירת קמפיין');
        this.platformState.reset();
        const organization = await firstValueFrom(this.entities.getEntityById(active.context.id));
        this.organizationName = organization.display_name || organization.legal_name || '';
        this.campaign = { ...this.platformState.draft, entityId: active.context.id,
          managerName: this.auth.currentUser()?.full_name || '',
          entityLogo: organization.logo_url || undefined };
      }
      if (this.destroyed) return;
      const studioDocument = structuredClone(this.campaign.layout.simpleStudio ?? this.initialDocument(!!id)) as Record<string, any>;
      studioDocument['management'] ??= {};
      studioDocument['management'].funding ??= {};
      studioDocument['management'].funding.start ||= this.campaign.startDate?.slice(0, 10) || isoDate(new Date());
      studioDocument['management'].funding.duration ??= this.campaign.campaignLifecycle || (this.campaign.endDate ? 'one-time' : 'ongoing');
      // A later editor must never replace the original responsible manager.
      const campaignInfo = studioDocument['content']?.campaignInfo;
      if (campaignInfo && this.campaign.managerName) campaignInfo.manager = this.campaign.managerName;
      if (!id && campaignInfo) {
        campaignInfo.photo = this.auth.currentUser()?.picture || '';
        studioDocument['management'].managerSource = 'account';
      }
      this.localDocument = JSON.stringify(studioDocument);

      await this.loadStyles();
      if (this.destroyed) return;
      this.previousStorage = window.hamAngularDraftStorage;
      document.body.classList.add('hamonym-simple-studio-active');
      // v4.62 provides its services per component/session. Bind that exact
      // storage instance before Angular runs Studio's ngAfterViewInit.
      this.publicationInjector = createEnvironmentInjector([
        { provide: STUDIO_PUBLICATION, useValue: this.publication },
        { provide: STUDIO_CHECKOUT, useValue: {
          preview: true,
          enabled: () => this.campaign.status === 'published',
          submit: (entries: import('./vendor-v462/cart/cart.types').CartEntry[], donor: import('../services/donation.service').DonationPayload['donor']) => this.publicCheckout.continueOnPublicPage(this.campaign, entries, donor),
        } },
        { provide: STUDIO_SLUG, useValue: {
          check: (value: string) => this.checkCampaignSlug(value),
          locked: () => !!this.campaign.publishedAt || this.campaign.status === 'published',
          current: () => { this.studioState?.revision(); return this.studioState ? this.documentSlug(this.studioState.current) : this.campaign.slug || ''; },
          change: (value: string) => this.studioState?.change(() => {
            if (this.campaign.publishedAt || this.campaign.status === 'published') return;
            this.studioState!.current.content.share.url = this.router.serializeUrl(this.router.createUrlTree(['/campaigns', value]));
          }, false),
        } },
      ], this.environment);
      this.studioRef = this.host.createComponent(StudioComponent, { environmentInjector: this.publicationInjector });
      this.studioState = this.studioRef.injector.get(CampaignStateService);
      this.toolbar = this.studioRef.injector.get(StudioToolbarService);
      this.studioRef.injector.get(CampaignDraftStorageService).start();
      const local = window.hamAngularDraftStorage!;
      this.recoveryKey = `hamonym-simple-studio:${id ?? crypto.randomUUID()}`;
      const adapter: HamDraftStorageBridge = {
        persistent: local.persistent,
        getItem: key => key === 'hamonym-studio-v01' ? this.localDocument : local.getItem(key),
        setItem: (key, value) => {
          if (key === 'hamonym-studio-v01') {
            local.setItem(this.recoveryKey, value);
            this.localDocument = value;
          } else local.setItem(key, value);
        },
        requestRemoteSave: () => { bindStudioCommerce(this.studioState!.current, this.campaign); this.remoteRequested = true; },
        shouldSaveRemote: () => {
          const requested = this.remoteRequested && this.initialized;
          this.remoteRequested = false;
          return requested;
        },
        setItemAsync: (key, value) => {
          if (key !== 'hamonym-studio-v01') return Promise.resolve();
          // Each immutable snapshot waits for its predecessor, including failed saves.
          this.pending++;
          const save = this.queue.then(() => this.save(value));
          this.queue = save.catch(() => {});
          return save.finally(() => {
            this.pending--;
            this.syncPublicationSaveCheck();
            if (!this.saveError && !this.destroyed) void this.refreshPublication();
          });
        },
      };
      this.adapter = adapter;
      window.hamAngularDraftStorage = adapter;
      window.addEventListener('beforeunload', this.beforeUnload);
      this.studioRef.changeDetectorRef.detectChanges();
      if (document.documentElement.dataset['hamBridgeReady'] !== 'true') throw new Error('הפעלת Studio נכשלה');
      const studioElement = this.studioRef.location.nativeElement as HTMLElement;
      const wizardElement = document.getElementById('hwWizard');
      studioElement.inert = true;
      if (wizardElement) wizardElement.inert = true;
      // Include synchronous defaults and asynchronous media migrations in the
      // loaded baseline, before the user can edit. None of these writes is remote.
      await this.studioRef.injector.get(CampaignMediaEngineService).ready;
      if (this.destroyed) return;
      await this.prepareExportStyles();
      if (this.destroyed) return;
      this.studioRef.instance.editor.decoratePreview(render => () => {
        const result = render();
        this.capturePreviewAppearance();
        return result;
      });
      this.capturePreviewAppearance();
      this.baselineDocument = JSON.stringify(this.studioState.current);
      this.cleanFingerprint = this.fingerprint(this.studioState.current);
      this.initialized = true;
      this.toolbar.saveState.set('idle');
      studioElement.inert = false;
      if (wizardElement) wizardElement.inert = false;
      this.placeToolbarActions();
      // The wizard is a body-level Angular component. Follow its mount/unmount
      // so the same host actions stay in the currently visible editing toolbar.
      this.toolbarObserver = new MutationObserver(() => this.placeToolbarActions());
      this.toolbarObserver.observe(document.body, { childList: true });
      this.message = '';
      this.loader.forceHide();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'טעינת הקמפיין נכשלה';
      this.loader.forceHide();
      this.studioRef?.destroy();
    }
  }

  private initialDocument(existing: boolean): Record<string, unknown> {
    const doc = blankCampaign();
    const draft = this.campaign;
    doc.content.hero.title = draft.title;
    if (draft.slug) doc.content.share.url = this.router.serializeUrl(this.router.createUrlTree(['/campaigns', draft.slug]));
    doc.content.hero.subtitle = draft.shortDescription;
    doc.content.hero.image = draft.coverImageUrl ?? '';
    doc.content.hero.video = draft.videoUrl ?? '';
    doc.content.hero.orgLogo = draft.campaignLogoUrl ?? draft.entityLogo ?? '';
    doc.content.hero.showOrgLogo = !!doc.content.hero.orgLogo;
    if (!existing) {
      doc.content.hero.logoAnchor = 'bottom-right';
      doc.content.hero.logoBelowText = false;
      doc.content.hero.logoWidth = 64;
      doc.content.hero.logoWidthMobile = 48;
      doc.content.hero.logoResponsive = true;
    }
    doc.content.title.title = draft.title;
    doc.content.title.subtitle = draft.shortDescription;
    doc.content.title.description = draft.layout.projectDescription ?? '';
    doc.content.stats.goal = draft.targetAmount;
    doc.content.campaignInfo.endAt = draft.endDate ?? '';
    doc.content.campaignInfo.category = draft.category ?? '';
    doc.content.campaignInfo.manager = draft.managerName ?? '';
    doc.content.donate.boxAmounts = [...draft.suggestedAmounts];
    doc.management = {
      entryWizard: { step: -1, status: existing ? 'complete' : 'draft', version: 2 },
      campaignKind: draft.layout.pageFormat === 'minimal' ? 'simple' : 'donation',
      modules: Object.fromEntries(['rewards', 'races', 'sponsors', 'ambassadors', 'updates', 'donors', 'comments'].map(key => [key, { items: [] }])),
    };
    doc.content.rewards.items=draft.offerings.map(row=>({businessId:row.id,name:row.title,description:row.description,amount:row.minimumAmount,stockEnabled:row.stock!==null,quantity:row.stock || 0,image:row.imageUrl || '',recommended:!!row.featured}));
    doc.management.modules.races.items=draft.registrationOptions.map(row=>({businessId:row.id,businessUid:row.uid || row.id,title:row.title,description:row.description,price:row.price}));
    return doc;
  }

  private async save(value: string): Promise<void> {
    const document = JSON.parse(value) as Record<string, unknown>;
    if (!this.campaignName(document)) {
      this.warnMissingName();
      throw new Error('יש לתת שם לקמפיין לפני השמירה.');
    }
    if (this.saveFeedbackTimer) clearTimeout(this.saveFeedbackTimer);
    this.saveSucceeded.set(false);
    try {
      const slug = this.documentSlug(document);
      const slugCheck = await this.checkCampaignSlug(slug);
      if (!slugCheck.available) throw new PublicationValidationError(slugCheck.message);
      const content = (document as Record<string, any>)['content'];
      const goal = Number(content?.stats?.goal);
      const hero = content?.hero;
      const business: Partial<CampaignDraft> = { title: this.campaignName(document) };
      const funding = (document as Record<string, any>)['management']?.funding;
      if (!parseIsoDate(funding?.start)) throw new PublicationValidationError('יש לבחור תאריך התחלה לקמפיין.');
      business.startDate = funding.start;
      business.campaignLifecycle = funding.duration === 'ongoing' ? 'ongoing' : 'one-time';
      business.endDate = business.campaignLifecycle === 'ongoing' ? '' : String(content?.campaignInfo?.endAt || '').slice(0, 10);
      if (business.endDate && business.endDate < business.startDate!) throw new PublicationValidationError('תאריך הסיום אינו יכול להיות לפני תאריך ההתחלה.');
      if (content?.stats?.goal !== undefined && Number.isFinite(goal) && goal >= 0) business.targetAmount = goal;
      if (hero?.mediaType === 'video' && hero.video) { business.videoUrl = hero.video; business.heroType = 'video'; }
      if (typeof hero?.image === 'string' && hero.image) {
        let image = hero.image;
        if (isMediaRef(image)) {
          const cached = this.uploadedHeroImages.get(image);
          if (cached) image = cached;
          else {
            const media = await this.studioRef!.injector.get(MediaStoreService).read(image);
            if (!media) throw new Error('תמונת הפתיחה אינה זמינה במכשיר הזה. יש לבחור אותה מחדש ולשמור לפני הפרסום.');
            const blob = media instanceof Blob ? media : await (await fetch(media)).blob();
            const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'webp';
            const url = await firstValueFrom(this.uploads.upload(new File([blob], `campaign-hero.${extension}`, { type: blob.type }), 'campaigns'));
            if (!/^https?:\/\//i.test(url)) throw new Error('לא התקבלה כתובת תקינה לתמונת הפתיחה מהשרת.');
            this.uploadedHeroImages.set(image, url);
            image = url;
          }
        }
        business.coverImageUrl = image;
        if (hero.mediaType !== 'video') business.heroType = 'image';
        // Persist a portable media URL; keep the live/local snapshot intact until save succeeds.
        hero.image = image;
      }
      if (!this.campaign.id) {
        const name = this.campaignName(document);
        if (!name) throw new Error('יש להזין שם קמפיין לפני שמירה לשרת. הטיוטה נשמרה במכשיר בלבד.');
        this.campaign = await firstValueFrom(this.api.create(this.campaign.entityId!, {
          ...this.campaign,
          ...business,
          ...studioCommerce(document, this.campaign),
          title: name,
          slug,
          layout: { ...this.campaign.layout, simpleStudio: document },
        }));
        // Keep the mounted editor, selection and history; only replace its URL.
        history.replaceState(history.state, '', `/campaigns/${this.campaign.id}/simple-studio`);
      } else {
        this.campaign = await firstValueFrom(this.api.saveSimpleStudio(this.campaign.id, this.campaign.layout, document, slug, business));
      }
      this.baselineDocument = value;
      this.cleanFingerprint = this.fingerprint(JSON.parse(value));
      this.saveError = '';
      this.placeToolbarActions();
      if (this.saveErrorToast) this.toasts.dismiss(this.saveErrorToast);
      this.saveErrorToast = undefined;
      this.toasts.show('success', 'הקמפיין נשמר בהצלחה.', 'השינויים נשמרו בשרת.');
      this.saveSucceeded.set(true);
      this.saveFeedbackTimer = setTimeout(() => this.saveSucceeded.set(false), 1200);
    } catch (error) {
      const response = error as { error?: { error?: string; message?: string }; message?: string };
      this.saveError = response.error?.error ?? response.error?.message ?? response.message ?? 'שמירה לשרת נכשלה';
      if (this.saveErrorToast) this.toasts.dismiss(this.saveErrorToast);
      this.saveErrorToast = this.toasts.show(error instanceof PublicationValidationError ? 'warning' : 'error', 'הקמפיין לא נשמר לשרת', `${this.saveError} השינויים נשמרו בעורך.`);
      throw new Error(this.saveError);
    }
  }

  private loadStyles(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sheet = document.createElement('link');
      this.sheet.rel = 'stylesheet';
      this.sheet.href = '/simple-studio/v462/styles.css';
      this.sheet.onload = () => resolve();
      this.sheet.onerror = () => reject(new Error('טעינת עיצוב Studio נכשלה'));
      document.head.append(this.sheet);
    });
  }

  private hasUnsavedChanges(): boolean {
    const current = this.studioState?.peek();
    return this.pending > 0 || (this.initialized && !!current && this.fingerprint(current) !== this.cleanFingerprint);
  }

  private fingerprint(document: Record<string, any>): string {
    const content = structuredClone(document);
    // Wizard position is navigation state, not campaign content or design.
    if (content.management) delete content.management.entryWizard;
    return JSON.stringify(content, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  }

  private campaignName(document: Record<string, any>): string {
    return String(document.content?.hero?.title ?? '').trim();
  }

  private documentSlug(document: Record<string, any>): string {
    const url = String(document['content']?.share?.url || '').split(/[?#]/)[0];
    const parts = url.split('/').filter(Boolean);
    const value = parts.at(-1) === 'view' ? parts.at(-2) : parts.at(-1);
    if (!value || value === 'demo') return this.campaign.slug || '';
    try { return decodeURIComponent(value); } catch { return ''; }
  }

  private async checkCampaignSlug(value: string): Promise<StudioSlugCheck> {
    if (!validCampaignSlug(value)) return { available: false, message: 'הכתובת חייבת לכלול 3–70 אותיות או ספרות ומקפים, ללא רווחים או מקפים כפולים.' };
    if ((this.campaign.publishedAt || this.campaign.status === 'published') && value !== this.campaign.slug) return { available: false, message: 'לא ניתן לשנות כתובת של קמפיין שכבר פורסם.' };
    const available = await firstValueFrom(this.api.checkSlugAvailable(value, this.campaign.id));
    if (available) return { available: true, message: 'הכתובת פנויה' };
    const base = value.slice(0, 60).replace(/-+$/, '');
    for (let suffix = 2; suffix <= 6; suffix++) {
      const suggestion = `${base}-${suffix}`;
      if (await firstValueFrom(this.api.checkSlugAvailable(suggestion, this.campaign.id))) return { available: false, message: 'הכתובת כבר בשימוש', suggestion };
    }
    return { available: false, message: 'הכתובת כבר בשימוש. יש לבחור כתובת אחרת.' };
  }

  private updatePublicationChecks(authorized: boolean): void {
    const draft = this.campaign;
    const checks = this.publisher.checks(draft, this.publicationEntity, authorized);
    const slugCheck = checks.find(check => check.id === 'slug')!;
    if (this.publicationSlugCheck?.available !== true) { slugCheck.complete = false; slugCheck.detail = this.publicationSlugCheck?.message || slugCheck.detail; }
    checks.push({ id: 'payment', label: 'בדיקת חיבור הסליקה הארגוני', complete: this.publicationEntity?.cardcom_connection_status === 'success', required: false, detail: this.publicationEntity?.cardcom_connection_status === 'success' ? 'בדיקת החיבור הארגוני האחרונה הצליחה. הפעלת התרומה נבדקת בשרת בזמן התשלום.' : 'אין כאן אישור לחיבור ארגוני מאומת. השרת בוחר תשתית ארגונית או תשתית פלטפורמה בעת תרומה; זה אינו חסם פרסום במסלול הקיים.', action: 'organization' });
    this.publicationState.update(state => ({ ...state, loading: false, status: draft.status, checks,
      canPublish: draft.status !== 'published' && checks.every(check => !check.required || check.complete),
      publicUrl: this.publicationSlugCheck?.available === true ? this.publisher.url(draft) : '',
    }));
    this.syncPublicationSaveCheck();
  }

  private syncPublicationSaveCheck(): void {
    this.publisher.setUnsaved(this.campaign.id, this.hasUnsavedChanges() || !!this.saveError || this.pending > 0);
    const complete = !!this.campaign.id && !this.hasUnsavedChanges() && !this.saveError && !this.studioFieldsNeedSave();
    const slugChanged = !!this.studioState && this.documentSlug(this.studioState.current) !== this.campaign.slug;
    const detail = this.pending ? 'השמירה לשרת מתבצעת. יש להמתין לסיומה.'
      : this.saveError ? `${this.saveError} יש לשמור בהצלחה לפני הפרסום.`
      : slugChanged ? 'כתובת הקמפיין השתנתה. יש לבדוק את זמינותה בפרטי הקמפיין ולשמור לפני הפרסום.'
      : complete ? 'כל השינויים נשמרו בשרת.' : 'יש לשמור את השינויים בשרת לפני הפרסום.';
    this.publicationState.update(state => {
      const checks = state.checks.map(check => check.id === 'saved' ? { ...check, complete, detail, action: slugChanged ? 'identity' as const : 'save' as const } : check);
      return { ...state, checks, canPublish: !!checks.length && !state.loading && !state.error && state.status !== 'published' && checks.every(check => !check.required || check.complete) };
    });
  }

  private studioFieldsNeedSave(): boolean {
    if (!this.studioState) return false;
    const document = this.studioState.current;
    const content = document.content;
    const hero = content?.hero;
    const image = typeof hero?.image === 'string' ? hero.image : '';
    const goal = Number(content?.stats?.goal);
    const funding = document.management?.funding;
    const endDate = funding?.duration === 'ongoing' ? '' : String(content?.campaignInfo?.endAt || '').slice(0, 10);
    return this.campaignName(document) !== this.campaign.title || this.documentSlug(document) !== this.campaign.slug
      || (!!funding?.start && funding.start !== this.campaign.startDate?.slice(0, 10))
      || (!!funding?.duration && (funding.duration !== this.campaign.campaignLifecycle || endDate !== (this.campaign.endDate?.slice(0, 10) || '')))
      || (content?.stats?.goal !== undefined && Number.isFinite(goal) && goal >= 0 && goal !== this.campaign.targetAmount)
      || (hero?.mediaType === 'video' && !!hero.video && (hero.video !== this.campaign.videoUrl || this.campaign.heroType !== 'video'))
      || (!!image && (this.uploadedHeroImages.get(image) || image) !== this.campaign.coverImageUrl);
  }

  private async loadPublicationContext(): Promise<void> {
    this.publicationState.update(state => ({ ...state, loading: true, canPublish: false, error: '' }));
    if (this.campaign.id) this.campaign = await firstValueFrom(this.api.getById(this.campaign.id));
    try { this.publicationSlugCheck = await this.checkCampaignSlug(this.campaign.slug || ''); }
    catch { this.publicationSlugCheck = { available: false, message: 'לא ניתן לאמת את זמינות הכתובת. יש לבדוק שוב או לערוך אותה בפרטי הקמפיין.' }; }
    this.publicationEntity = this.campaign.entityId ? await firstValueFrom(this.entities.getEntityById(this.campaign.entityId)) : null;
    if (!this.destroyed) this.updatePublicationChecks(!!this.campaign.id);
  }

  private async saveBeforePublication(): Promise<void> {
    while (this.pending > 0) await this.queue;
    if (!this.initialized || !this.studioState) throw new PublicationValidationError('יש להמתין לסיום טעינת הקמפיין.');
    if (this.hasUnsavedChanges() || this.saveError || !this.campaign.id || this.studioFieldsNeedSave()) {
      if (!this.campaignName(this.studioState.current)) { this.warnMissingName(); throw new PublicationValidationError('יש לתת שם ולשמור את הקמפיין לפני הפרסום.', true); }
      this.saveDraft(true);
      const result = await this.studioState.lastSave;
      while (this.pending > 0) await this.queue;
      if (!result.ok || this.saveError) throw new Error(this.saveError || result.message);
      if (this.hasUnsavedChanges()) throw new PublicationValidationError('יש שינויים נוספים שטרם נשמרו. יש לשמור ולבדוק שוב.');
    }
    if (!this.campaign.id) throw new PublicationValidationError('יש לשמור טיוטה בשרת לפני הפרסום.');
  }

  private publicationError(error: unknown): string {
    const response = error as { status?: number; error?: { error?: string; message?: string }; message?: string };
    const message = response.error?.error || response.error?.message || response.message || 'הפעולה לא הושלמה. יש לבדוק את החיבור ולנסות שוב.';
    if (response.status === 401 || response.status === 403 || message === 'Unauthorized') return 'השרת לא אישר הרשאה לפעולה. יש להתחבר עם חשבון מורשה.';
    if (message === 'Campaign is locked') return 'הקמפיין נעול לפרסום ולעריכה.';
    if (message === 'Entity is not approved to fundraise yet') return 'הארגון עדיין אינו מאושר לגיוס.';
    return message;
  }

  private async refreshPublication(save = false): Promise<void> {
    if (this.publicationState().publishing || this.publicationState().loading) return;
    this.publicationState.update(state => ({ ...state, loading: true, canPublish: false }));
    try {
      if (save) await this.saveBeforePublication();
      while (this.pending > 0) await this.queue;
      await this.loadPublicationContext();
    } catch (error) {
      if (this.destroyed) return;
      const message = this.publicationError(error);
      this.publicationState.update(state => ({ ...state, loading: false, canPublish: false, error: message,
        checks: state.checks.map(check => check.id === 'permission' ? { ...check, complete: false, detail: 'לא ניתן לאמת כרגע את ההרשאה מול השרת.' } : check),
      }));
      if (!(error instanceof PublicationValidationError && error.notified)) this.toasts.show(error instanceof PublicationValidationError ? 'warning' : 'error', 'לא ניתן לבדוק מוכנות לפרסום', message);
    }
  }

  publicationDialogState(): PublicationState { return this.publicationState(); }
  publicationCampaignName(): string { return this.campaign.title; }
  private async requestPublicationConfirmation(): Promise<void> {
    const state = this.publicationState();
    if (this.publicationConfirmationView || state.publishing || state.loading || state.status === 'published') return;
    if (!state.canPublish || state.error) {
      this.toasts.show('warning', 'נדרשות השלמות לפני הפרסום', state.error || state.checks.find(check => check.required && !check.complete)?.detail || 'יש לבדוק מחדש את תנאי הפרסום.');
      return;
    }
    this.publicationConfirmationView = this.host.createEmbeddedView(this.publicationDialog);
    this.publicationConfirmationView.detectChanges();
    this.publicationConfirmationElement = this.publicationConfirmationView.rootNodes.find(node => node instanceof HTMLDialogElement);
    this.publicationConfirmationElement!.showModal();
  }
  cancelPublicationConfirmation(): void {
    if (!this.publicationState().publishing) this.closePublicationConfirmation();
  }
  private closePublicationConfirmation(): void {
    this.publicationConfirmationElement?.close();
    this.publicationConfirmationView?.destroy();
    this.publicationConfirmationView = undefined;
    this.publicationConfirmationElement = undefined;
  }
  async confirmStudioPublication(): Promise<void> {
    if (this.publicationState().publishing || this.publicationState().loading) return;
    await this.publishCampaign();
    if (this.publicationState().status === 'published') this.closePublicationConfirmation();
  }

  private async publishCampaign(): Promise<void> {
    if (this.publicationOperation || this.publicationState().publishing || this.publicationState().loading) return;
    const operation = this.runPublication();
    this.publicationOperation = operation;
    try { await operation; } finally { if (this.publicationOperation === operation) this.publicationOperation = undefined; }
  }

  private async runPublication(): Promise<void> {
    this.publicationState.update(state => ({ ...state, publishing: true, error: '' }));
    const progress = this.toasts.show('info', 'מפרסם את הקמפיין…', 'ממתין לאישור השרת.');
    try {
      await this.saveBeforePublication();
      // Share the existing save queue: later draft saves cannot race the status update.
      const publish = this.queue.then(async () => {
        await this.loadPublicationContext();
        if (this.campaign.status === 'published') return;
        if (!this.publicationState().canPublish) throw new PublicationValidationError(this.publicationState().checks.find(check => check.required && !check.complete)?.detail || this.publicationState().error || 'תנאי הפרסום טרם אושרו מול השרת. יש לבדוק מחדש.');
        const result = await firstValueFrom(this.api.publish(this.campaign.id!));
        if (result?.status !== 'published') throw new Error('לא התקבל אישור פרסום מהשרת. יש לרענן את הבדיקה לפני ניסיון נוסף.');
        this.campaign = { ...this.campaign, status: result.status, publishedAt: result.published_at ?? this.campaign.publishedAt };
        this.updatePublicationChecks(true);
        this.toasts.show('success', 'הקמפיין פורסם בהצלחה', 'השרת אישר את הפרסום. ניתן לפתוח את דף הקמפיין.');
      });
      this.queue = publish.catch(() => {});
      await publish;
    } catch (error) {
      const message = this.publicationError(error);
      try { await this.loadPublicationContext(); } catch { /* Keep the original rejection visible if refreshing also fails. */ }
      if (this.publicationState().status === 'published') {
        this.toasts.show('success', 'הקמפיין פורסם', 'הסטטוס אושר בקריאה חוזרת מהשרת.');
        return;
      }
      const authorizationFailed = message === 'השרת לא אישר הרשאה לפעולה. יש להתחבר עם חשבון מורשה.' || message === 'הקמפיין נעול לפרסום ולעריכה.';
      this.publicationState.update(state => ({ ...state, loading: false, canPublish: false, error: message,
        checks: state.checks.map(check => (authorizationFailed && check.id === 'permission') || ((this.hasUnsavedChanges() || this.saveError) && check.id === 'saved') ? { ...check, complete: false, detail: message } : check),
      }));
      if (!(error instanceof PublicationValidationError && error.notified)) this.toasts.show(error instanceof PublicationValidationError ? 'warning' : 'error', 'הפרסום לא הושלם', message);
    } finally {
      this.toasts.dismiss(progress);
      this.publicationState.update(state => ({ ...state, publishing: false }));
    }
  }

  private openPublicationCheck(check: PublicationCheck): void {
    if (['title', 'hero', 'slug'].includes(check.id) || (check.id === 'saved' && this.studioState && !this.campaignName(this.studioState.current))) {
      this.studioRef?.injector.get(ManagementViewService).goPage('identity');
      return;
    }
    if (check.id === 'target' || check.id === 'dates') {
      this.studioRef?.injector.get(ManagementViewService).goPage('fundraising');
      return;
    }
    if (check.action === 'identity') { this.studioRef?.injector.get(ManagementViewService).goPage('identity'); return; }
    if (check.action === 'save' || (!this.campaign.id && check.action !== 'organization')) { void this.refreshPublication(true); return; }
    if (check.action === 'organization' && this.campaign.entityId) void this.router.navigate(['/settings/entities', this.campaign.entityId]);
    else if (check.action) void this.router.navigate(['/campaigns', this.campaign.id, check.action === 'legacy' ? 'classic' : 'settings']);
  }

  private capturePreviewAppearance(): void {
    const preview = document.getElementById('preview');
    if (!preview || !preview.classList.contains('desktop')) return;
    // Export already clones this exact rendered node. Carry its resolved shell
    // styles with it, instead of allowing the export envelope to replace them.
    const style = getComputedStyle(preview);
    const properties = ['background-color', 'border', 'border-width', 'border-style', 'border-radius', 'box-shadow', 'padding', 'font-family', 'font-size', 'line-height', 'color'];
    const transition = preview.style.getPropertyValue('transition');
    const priority = preview.style.getPropertyPriority('transition');
    preview.style.setProperty('transition', 'none', 'important');
    preview.style.setProperty('--ham-public-preview-width', `${preview.getBoundingClientRect().width}px`);
    if (transition) preview.style.setProperty('transition', transition, priority);
    else preview.style.removeProperty('transition');
    for (const property of properties) preview.style.setProperty(`--ham-public-preview-${property}`, style.getPropertyValue(property));
  }

  private async prepareExportStyles(): Promise<void> {
    // The existing exporter copies <style> elements. Include the loaded campaign
    // CSS (including its local @import) so the new document has identical rules
    // immediately, rather than depending on loading its stylesheet links again.
    const inline = (sheet: CSSStyleSheet): string => Array.from(sheet.cssRules, rule => {
      if (rule instanceof CSSImportRule && rule.styleSheet) {
        try { return inline(rule.styleSheet); } catch { return rule.cssText; }
      }
      return rule.cssText;
    }).join('\n');
    if (!this.sheet?.sheet) return;
    const styles = await Promise.all(Array.from(document.styleSheets)
      .filter(sheet => !sheet.disabled)
      .map(async sheet => {
        try { return inline(sheet); } catch {
          // Google font sheets are cross-origin CSSOM resources. Preserve their
          // existing @font-face declarations too, so the export uses the same font.
          if (sheet.href?.startsWith('https://fonts.googleapis.com/')) {
            try {
              const response = await fetch(sheet.href, { signal: AbortSignal.timeout(3000), credentials: 'omit' });
              if (response.ok) return await response.text();
            } catch { /* The existing font <link> remains the fallback. */ }
          }
          return '';
        }
      }));
    if (this.destroyed) return;
    let css = styles.join('\n');
    const font = String(this.studioState!.current['theme']?.font || 'Heebo');
    const fontRules = (css.match(/@font-face\s*\{[^}]*\}/g) || []).filter(rule =>
      rule.match(/font-family:\s*([^;]+);/)?.[1].replace(/["']/g, '').trim() === font);
    const fontUrls = new Set(fontRules.flatMap(rule => Array.from(rule.matchAll(/url\(["']?([^\s)'";]+)["']?\)/g), match => match[1])));
    const embeddedFonts = await Promise.all(Array.from(fontUrls, async url => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3000), credentials: 'omit', cache: 'force-cache' });
        if (!response.ok) return null;
        const blob = await response.blob();
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        return [url, data] as const;
      } catch { return null; }
    }));
    for (const entry of embeddedFonts) if (entry) css = css.split(entry[0]).join(entry[1]);
    if (this.destroyed) return;
    this.exportStyles = document.createElement('style');
    this.exportStyles.textContent = css;
    document.head.appendChild(this.exportStyles);
    // Disabled is a CSSOM property, not serialized HTML: no duplicate rules in
    // the editor; the export's ordinary <style> copy is active in the new page.
    this.exportStyles.sheet!.disabled = true;
  }

  private placeToolbarActions(): void {
    document.getElementById('hamStandaloneFallback')?.style.setProperty('background', '#fff', 'important');
    const studioRoot = this.studioRef?.location.nativeElement as HTMLElement | undefined;
    if (!studioRoot) return;
    if (!this.sharedToolbar) {
      this.sharedToolbar = studioRoot.querySelector<HTMLElement>('header.top') ?? undefined;
      this.sharedToolbar?.addEventListener('click', this.syncWizardToolbar);
      this.sharedToolbar?.addEventListener('pointerup', this.syncWizardToolbar);
      if (this.sharedToolbar) {
        this.installToolbarIcons(this.sharedToolbar);
        this.toolbarAvailability = effect(() => {
          this.studioState!.revision();
          untracked(() => this.syncPublicationSaveCheck());
          for (const [id, enabled] of [['undoBtn', this.studioState!.canUndo()], ['redoBtn', this.studioState!.canRedo()]] as const) {
            const button = this.sharedToolbar!.querySelector<HTMLButtonElement>(`#${id}`);
            if (button) button.disabled = !enabled;
          }
          this.sharedToolbar!.toggleAttribute('data-hamonym-simple', this.toolbar!.simple());
        }, { injector: this.host.injector, allowSignalWrites: true });
      }
    }
    const toolbar = this.sharedToolbar;
    if (!toolbar) return;
    const wizardRoot = document.querySelector<HTMLElement>('#hwWizard .hw-app');
    const parent = wizardRoot ?? studioRoot;
    // Move the same Angular view, retaining its component instances and handlers.
    // The body observer restores it even when the wizard's parent was removed.
    if (toolbar.parentElement !== parent) parent.insertBefore(toolbar, parent.firstChild);
    this.wizardToolbarActive = !!wizardRoot;
    toolbar.id = 'hamonymStudioToolbar';
    toolbar.setAttribute('data-hamonym-shared-toolbar', '');
    toolbar.toggleAttribute('data-hamonym-wizard', !!wizardRoot);
    toolbar.toggleAttribute('data-hamonym-unsaved', !this.campaign.id);
    toolbar.toggleAttribute('data-hamonym-simple', this.toolbar?.simple() === true);
    const shell = toolbar.querySelector('.ham-v157-shell')!;
    const identity = toolbar.querySelector('.ham-v209-right')!;
    const tools = toolbar.querySelector('.ham-v209-left')!;
    const modes = toolbar.querySelector('.ham-v157-navigation');
    if (modes && modes.parentElement !== shell) shell.insertBefore(modes, tools);
    if (modes) {
      (modes as HTMLElement).inert = !!wizardRoot;
      modes.setAttribute('aria-hidden', String(!!wizardRoot));
    }
    this.identityView ??= this.host.createEmbeddedView(this.campaignIdentity);
    this.identityView.rootNodes.forEach(node => { if (node.parentNode !== identity) identity.prepend(node); });
    const target = toolbar.querySelector('.top-actions')!;
    this.actionsView ??= this.host.createEmbeddedView(this.exitAction);
    this.actionsView.detectChanges();
    this.actionsView.rootNodes.forEach(node => {
      const destination = node instanceof HTMLElement && node.classList.contains('ham-host-navigation') ? shell : target;
      if (node.parentNode !== destination) destination.appendChild(node);
    });
    this.identityView.detectChanges();
    // Retain the wizard's contextual demo-edit command in the existing overflow menu.
    const demoAction = wizardRoot?.querySelector<HTMLElement>('[data-hw-demo-existing]');
    if (demoAction && demoAction !== this.wizardDemoAction) {
      this.wizardDemoAction?.remove();
      this.wizardDemoAction = demoAction;
      demoAction.setAttribute('data-hamonym-wizard-command', '');
      toolbar.querySelector('.ham-v297-more-menu')?.appendChild(demoAction);
    } else if (!wizardRoot) {
      this.wizardDemoAction?.remove();
      this.wizardDemoAction = undefined;
    }
    if (this.wizardCommandOwner !== (wizardRoot ?? undefined)) {
      this.wizardCommands.forEach(command => command.remove());
      this.wizardCommands = [];
      this.wizardCommandOwner = wizardRoot ?? undefined;
    }
    if (wizardRoot && !this.wizardCommands.length) {
      this.wizardCommands = Array.from(wizardRoot.querySelectorAll<HTMLElement>('.hw-preview-actions button[data-ham-demo-kind], .hw-preview-actions [data-ham-quick-reset]'));
      for (const command of this.wizardCommands) {
        command.setAttribute('data-hamonym-wizard-command', '');
        if (command.hasAttribute('data-ham-quick-reset')) this.setToolbarIcon(command, 'M3 11a9 9 0 1 1 3 7M3 4v7h7', 'איפוס וחזרה לאשף');
        toolbar.querySelector('.ham-v297-more-menu')?.appendChild(command);
      }
    } else if (!wizardRoot) {
      this.wizardCommands.forEach(command => command.remove());
      this.wizardCommands = [];
    }
  }

  private installToolbarIcons(toolbar: HTMLElement): void {
    const icons: [string, string, string?][] = [
      ['#undoBtn', 'm9 4-5 5 5 5M4 9h9a7 7 0 0 1 0 14'],
      ['#redoBtn', 'm15 4 5 5-5 5M20 9h-9a7 7 0 0 0 0 14'],
      ['.ham-template-top', 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', 'בחירת תבנית'],
      ['[data-hu-mode="management"]', 'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01', 'ניהול תוכן'],
      ['[data-hu-mode="design"]', 'm16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5', 'עיצוב'],
      ['[data-hu-mode="publish"]', 'm3 9 14-5v16L3 15V9ZM17 9h4v6h-4M5 16l2 6h4l-2-5', 'פרסום'],
      ['.ham-layout-menu-icon', 'M3 4h18v16H3zM3 9h18M10 9v11'],
      ['.ham-v297-menu-icon', 'M4 5h16M4 12h16M4 19h16'],
      ['.ham-v297-more > summary', 'M5 12h.01M12 12h.01M19 12h.01'],
    ];
    for (const [selector, path, label] of icons) {
      toolbar.querySelectorAll(selector).forEach(target => {
        this.setToolbarIcon(target, path, label);
      });
    }
    const label = toolbar.querySelector('.ham-v209-label');
    if (label) label.textContent = 'בחירת תבנית';
  }

  private setToolbarIcon(target: Element, path: string, label?: string): void {
    const view = this.host.createEmbeddedView(this.toolbarIcon, { $implicit: path, label });
    view.detectChanges();
    target.replaceChildren(...view.rootNodes);
  }

  toolbarCampaignName(): string { return this.studioState ? this.campaignName(this.studioState.current) || 'קמפיין חדש' : 'קמפיין חדש'; }
  toolbarCampaignStatus(): string { return this.campaign?.status === 'published' ? 'פורסם' : 'טיוטה'; }
  toolbarCampaignSubtitle(): string {
    const active = this.context.active();
    const organization = this.campaign?.entityName || this.organizationName || (active?.context?.id === this.campaign?.entityId ? active?.context?.name : '');
    return [organization, this.toolbarCampaignStatus()].filter(Boolean).join(' · ');
  }
  toolbarCampaignImage(): string {
    if (this.wizardToolbarActive || !this.studioState) return '';
    const image = this.studioState.current['content']?.hero?.image || this.campaign?.coverImageUrl;
    const url = this.studioRef?.instance.editor.photoSrc(image) || '';
    return url === this.failedAvatarUrl ? '' : url;
  }
  private readonly syncWizardToolbar = (event: Event): void => {
    if (event.type === 'click' && event.target instanceof Element && event.target.closest('[data-hamonym-wizard-command]')) {
      const menu = this.sharedToolbar?.querySelector<HTMLDetailsElement>('.ham-v297-more');
      if (menu) menu.open = false;
    }
    if (this.wizardToolbarActive) queueMicrotask(() => {
      if (!this.destroyed && this.wizardToolbarActive) this.studioRef!.injector.get(WizardService).refreshPreview();
    });
  };

  saveDisabled(): boolean { return !this.initialized || this.saveButtonState() === 'saving' || (!this.hasUnsavedChanges() && !this.saveError); }
  private warnMissingName(): void {
    this.toasts.show('warning', 'לא ניתן לשמור עדיין', 'יש לתת שם לקמפיין לפני השמירה.');
  }
  saveDraft(force = false): void {
    if (!this.initialized || this.saveButtonState() === 'saving' || (!force && this.saveDisabled())) return;
    if (!this.campaignName(this.studioState!.current)) { this.warnMissingName(); return; }
    bindStudioCommerce(this.studioState!.current, this.campaign);
    this.remoteRequested = true;
    this.toolbar?.saveState.set('saving');
    this.studioState!.persist();
  }
  saveButtonState(): 'idle' | 'saving' | 'saved' | 'failed' {
    if (this.pending > 0 || this.studioState?.saving()) return 'saving';
    if (this.saveError) return 'failed';
    if (!this.campaign?.id || this.hasUnsavedChanges()) return 'idle';
    return this.saveSucceeded() ? 'saved' : 'idle';
  }
  saveIconPaths(): string[] { return this.toolbar ? this.toolbar.saveIcons[this.saveButtonState()] : []; }
  saveTooltip(): string {
    const state = this.saveButtonState();
    return state === 'saving' ? 'שומר שינויים לשרת…'
      : state === 'failed' ? `${this.saveError} — לחצו לניסיון חוזר`
      : state === 'saved' ? 'השינויים נשמרו לשרת'
      : this.campaign?.id ? 'שמירת שינויים' : 'שמירת טיוטה';
  }
  saveLabel(): string {
    const state = this.saveButtonState();
    return state === 'saving' ? 'שומר…' : state === 'failed' ? 'ניסיון חוזר' : state === 'saved' ? 'נשמר' : '';
  }

  exit(): void { void this.router.navigate(['/campaigns']); }

  async leave(_url: string): Promise<boolean> {
    if (this.publicationOperation) await this.publicationOperation;
    while (this.pending > 0) await this.queue;
    if (!this.hasUnsavedChanges()) return true;
    if (this.exitDecision) return this.exitDecision;
    this.exitName = this.campaignName(this.studioState!.current);
    this.exitError = this.saveError;
    this.exitDecision = new Promise<boolean>(resolve => { this.resolveExit = resolve; });
    this.exitView = this.host.createEmbeddedView(this.exitDialog);
    this.exitView.detectChanges();
    this.exitElement = this.exitView.rootNodes.find(node => node instanceof HTMLDialogElement);
    this.exitElement!.showModal();
    return this.exitDecision;
  }

  needsCampaignName(): boolean { return !this.campaign?.id; }

  private finishExit(allow: boolean): void {
    const resolve = this.resolveExit;
    this.resolveExit = undefined;
    this.exitDecision = undefined;
    this.exitElement?.close();
    this.exitView?.destroy();
    this.exitView = undefined;
    this.exitElement = undefined;
    resolve?.(allow);
  }

  continueEditing(): void { if (!this.exitSaving) this.finishExit(false); }

  async saveAndExit(): Promise<void> {
    if (this.exitSaving) return;
    if (this.needsCampaignName()) {
      const name = this.exitName.trim();
      if (!name) {
        this.exitError = 'יש להזין שם קמפיין לפני השמירה.';
        this.exitElement?.querySelector<HTMLInputElement>('input')?.focus();
        return;
      }
      this.studioState!.change(() => {
        const content = this.studioState!.current['content'];
        const oldName = content.hero.title;
        content.hero.title = name;
        if (!content.title.title || content.title.title === oldName) content.title.title = name;
      }, false);
    }
    this.exitSaving = true;
    this.exitError = '';
    try {
      this.saveDraft();
      const result = await this.studioState!.lastSave;
      while (this.pending > 0) await this.queue;
      if (!result.ok || this.saveError) throw new Error(this.saveError || result.message);
      if (this.hasUnsavedChanges()) throw new Error('יש שינויים נוספים שטרם נשמרו. נסו לשמור שוב.');
      this.exitSaving = false;
      this.finishExit(true);
    } catch (error) {
      this.exitSaving = false;
      this.exitError = error instanceof Error ? error.message : 'השמירה נכשלה. אפשר לנסות שוב או להמשיך לערוך.';
    }
  }

  discardAndExit(): void {
    if (this.exitSaving || this.pending > 0) return;
    this.studioState!.replace(JSON.parse(this.baselineDocument));
    this.studioState!.clearHistory();
    this.localDocument = this.baselineDocument;
    try { localStorage.removeItem(this.recoveryKey); } catch { /* storage may be unavailable */ }
    this.saveError = '';
    this.studioRef!.instance.editor.render();
    this.publisher.setUnsaved(this.campaign.id, false);
    this.finishExit(true);
  }

  ngOnDestroy(): void {
    this.closePublicationConfirmation();
    this.destroyed = true;
    if (this.saveFeedbackTimer) clearTimeout(this.saveFeedbackTimer);
    this.finishExit(false);
    this.toolbarObserver?.disconnect();
    this.toolbarAvailability?.destroy();
    this.sharedToolbar?.removeEventListener('click', this.syncWizardToolbar);
    this.sharedToolbar?.removeEventListener('pointerup', this.syncWizardToolbar);
    if (this.studioRef && !this.studioRef.hostView.destroyed) this.studioRef.destroy();
    this.publicationInjector?.destroy();
    document.body.classList.remove('hamonym-simple-studio-active');
    this.sheet?.remove();
    this.exportStyles?.remove();
    if (this.previousStorage) window.hamAngularDraftStorage = this.previousStorage;
    else if (window.hamAngularDraftStorage === this.adapter) delete window.hamAngularDraftStorage;
    window.removeEventListener('beforeunload', this.beforeUnload);
  }
}
