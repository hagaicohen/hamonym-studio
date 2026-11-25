import { CampaignCoreEngineService } from './core/campaign-core-engine.service';
import { CampaignManagementEngineService } from './management/campaign-management-engine.service';
import { CampaignWizardEngineService } from './wizard/campaign-wizard-engine.service';
import { CampaignMediaEngineService } from './media/campaign-media-engine.service';
import { RaceFlowService } from './races/race-flow.service';
import { CampaignCartService } from './cart/campaign-cart.service';
import { RaceRegistrationService } from './races/race-registration.service';
import { CampaignExportService } from './persistence/campaign-export.service';
import { CampaignPersistenceService } from './persistence/campaign-persistence.service';
import { CampaignDocumentService } from './persistence/campaign-document.service';
import { CampaignDraftStorageService } from './persistence/campaign-draft-storage.service';
import { CampaignRuntimeService } from './preview/campaign-runtime.service';
import { CampaignRenderFinalizerService } from './preview/campaign-render-finalizer.service';
import { V209ToolbarService } from './layout/v209-toolbar.service';
import { MiniCarouselService } from './preview/mini-carousel.service';
import { UpdateListService } from './updates/update-list.service';
import { StoryExpandService } from './preview/story-expand.service';
import { PublicPartsService } from './public-page/parts/public-parts.service';
import { PanoramaInlineCarouselService } from './preview/panorama-inline-carousel.service';
import { CarouselRepairService } from './preview/carousel-repair.service';
import { SingleToolbarShellService } from './layout/single-toolbar-shell.service';
import { UnifiedToolbarService } from './layout/unified-toolbar.service';
import { HamonymBrandService } from './brand/hamonym-brand.service';
import { CarouselResetService } from './preview/carousel-reset.service';
import { SaveStatusService } from './persistence/save-status.service';
import { SaveToolbarService } from './persistence/save-toolbar.service';
import { FileInputScrollService } from './media/file-input-scroll.service';
import { WorkspaceResizeService } from './layout/workspace-resize.service';
import { PreviewInteractionsService } from './preview/preview-interactions.service';
import { AfterViewInit, ApplicationRef, Component, ComponentRef, EnvironmentInjector, OnDestroy, createComponent, inject } from '@angular/core';
import { MobileWorkspaceTabsComponent } from './mobile/mobile-workspace-tabs.component';
import { MobileToolsComponent } from './mobile/mobile-tools.component';
import { MobileInspectorCloseComponent } from './mobile/mobile-inspector-close.component';

/**
 * MIGRATION BRIDGE — do not remodel the original UI in this step.
 * The original HTML requires selectors such as `body > .top`; therefore it is
 * mounted as *direct children of body*, not inside an Angular component host.
 * The legacy core is still imperative DOM code, now bundled via Angular DI.
 *
 * FUTURE BACKEND-READ / BACKEND-WRITE: adapt original state and save actions
 * to CampaignDraft / CampaignApiService in the real HAMONYM repository.
 * No production backend requests are added by this bridge.
 *
 * WARNING: This is a compatibility migration, NOT yet an idiomatic Angular
 * component rewrite. Future iterations can take ownership block by block.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  template: `<span id="ham-bridge-status" role="status">טוען את HAMONYM Simple Studio…</span>`,
  styles: [':host{display:none}']
})
export class AppComponent implements AfterViewInit, OnDestroy {
  private readonly publicParts = inject(PublicPartsService);
  // Angular-owned behavior formerly implemented by legacy scripts 006, 026, 044–047.
  private mobileTabs?: ComponentRef<MobileWorkspaceTabsComponent>;
  private mobileTools?: ComponentRef<MobileToolsComponent>;
  private mobileInspectorClose?: ComponentRef<MobileInspectorCloseComponent>;
  private mobileInspectorCloseHost?: HTMLButtonElement;
  private readonly syncMobileInspectorClose = (): void => {
    // The legacy inspector's CSS is dynamically injected and may override class selectors.
    // An inline important rule ensures the mobile-only control never leaks into desktop.
    const host = this.mobileInspectorCloseHost;
    if (!host) return;
    if (window.matchMedia('(max-width: 767px)').matches) {
      host.style.removeProperty('display');
    } else {
      host.style.setProperty('display', 'none', 'important');
    }
  };

  private readonly onLegacyMoreClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const menu = target.closest('details.top .ham-top-more, .top .ham-top-more') as HTMLDetailsElement | null;
    if (menu && target.closest('[data-ham-demo-load]')) menu.open = false;
    else if (!menu) document.querySelectorAll<HTMLDetailsElement>('.top .ham-top-more[open]').forEach(el => el.open = false);
  };

  // Former legacy 041.js: navigation remains wired to the same existing tabs.
  private readonly onPublicHeaderNavClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const item = target.closest<HTMLButtonElement>('#preview .header-dropdown button');
    if (!item) return;
    const preview = document.getElementById('preview');
    const dropdown = item.closest<HTMLElement>('.header-dropdown');
    if (!preview || !dropdown) return;
    const names: Record<string,string> = {
      'סיפור':'story','הסיפור':'story','תשורות':'rewards','תורמים':'donors',
      'שגרירים':'ambassadors','תגובות':'comments','עדכונים':'updates',
      'חסויות':'sponsors','שותפים':'sponsors'
    };
    const key = item.dataset['navTarget'] || names[item.textContent?.trim() || ''];
    if (!key) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // v4.53: the header renders its closed dropdown (its toggle's label was always 'פתיחת תפריט').
    this.publicParts.header?.closeMenu();
    const mobile = preview.querySelector<HTMLElement>(`.ham-mobile-tabs [data-ham-mobile-tab="${key}"]`);
    if (mobile) {
      mobile.click();
      mobile.closest<HTMLElement>('.ham-mobile-content')?.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    const desktop = preview.querySelector<HTMLElement>(`.ham-panorama-tabs [data-ham-panorama-tab="${key}"]`);
    if (desktop) {
      desktop.click();
      desktop.closest<HTMLElement>('.ham-panorama-tabs')?.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    const section = preview.querySelector<HTMLElement>(`[data-part="${key}"]`);
    if(section) section.scrollIntoView({behavior:'smooth',block:'start'});
    else preview.querySelector<HTMLElement>(`.nav-component [data-nav-target="${key}"]`)?.click();
  };
  private readonly onPublicHeaderNavEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    const preview = document.getElementById('preview');
    const menu = preview?.querySelector<HTMLElement>('.header-dropdown');
    if (menu && !menu.hidden) this.publicParts.header?.closeMenu();
  };

  // Replaces v0.1.147 updates sorting popover (legacy 025.js).
  private closeUpdatesSortMenus():void {
    document.querySelectorAll<HTMLElement>('#preview .ham-updates-stable-sort .ham-custom-sort-pop').forEach(menu => {
      menu.hidden = true;
      menu.previousElementSibling?.setAttribute('aria-expanded','false');
    });
  }
  private readonly onUpdatesSortClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const toggle = target.closest<HTMLElement>('#preview [data-ham-stable-sort-toggle]');
    if (toggle) {
      event.preventDefault();event.stopImmediatePropagation();
      const menu = toggle.nextElementSibling as HTMLElement | null;
      if (!menu) return;
      const shouldShow = menu.hidden;
      this.closeUpdatesSortMenus();
      menu.hidden = !shouldShow;
      toggle.setAttribute('aria-expanded',String(shouldShow));
      return;
    }
    const option = target.closest<HTMLElement>('#preview [data-ham-stable-sort-value]');
    if (option) {
      event.preventDefault();event.stopImmediatePropagation();
      const select = option.closest('.ham-updates-controls')?.querySelector<HTMLSelectElement>('[data-ham-update-sort]');
      if (select) {
        select.value = option.dataset['hamStableSortValue'] || '';
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }
      option.parentElement?.querySelectorAll<HTMLElement>('[data-ham-stable-sort-value]').forEach(el => el.setAttribute('aria-selected',String(el===option)));
      this.closeUpdatesSortMenus();
      return;
    }
    if (!target.closest('#preview .ham-updates-stable-sort')) this.closeUpdatesSortMenus();
  };
  private readonly onUpdatesSortEscape = (event: KeyboardEvent):void => {
    if (event.key === 'Escape') this.closeUpdatesSortMenus();
  };

  // Replaces legacy 002.js, fitting the real editor toolbar height.
  private topResizeObserver?: ResizeObserver;
  private readonly fitWorkspaceTop = ():void => {
    const workspace = document.querySelector<HTMLElement>('.workspace');
    if (!workspace) return;
    const height = Math.max(0,Math.ceil(workspace.getBoundingClientRect().top));
    document.documentElement.style.setProperty('--ham-workspace-top',`${height}px`);
  };
  private startWorkspaceSizing():void {
    this.fitWorkspaceTop();
    window.addEventListener('resize',this.fitWorkspaceTop,{passive:true});
    if ('ResizeObserver' in window) {
      this.topResizeObserver = new ResizeObserver(this.fitWorkspaceTop);
      document.querySelectorAll('.top,#huToolbar').forEach(el => this.topResizeObserver?.observe(el));
    }
    document.fonts?.ready?.then(this.fitWorkspaceTop).catch(() => {});
  }

  // Replaces the small toolbar-readiness relocation shim (legacy 040.js).
  private readonly arrangeReadiness = ():void => {
    const top = document.querySelector<HTMLElement>('body>.top.ham-v157-ready');
    const manager = document.getElementById('huManager');
    const progress = top?.querySelector<HTMLElement>('.ham-v157-progress-group');
    if (!top || !manager || !progress) return;
    if (progress.parentNode !== manager) {
      progress.classList.add('ham-v207-readiness');
      manager.insertBefore(progress,manager.firstChild);
    }
    top.classList.add('ham-v207-flat');
  };


  private mountMobileControls(): void {
    const workspace = document.querySelector<HTMLElement>('.workspace');
    if (!workspace || this.mobileTabs) return;
    const tabs = document.createElement('nav');
    tabs.className = 'ham-mobile-workspace-tabs';
    tabs.setAttribute('aria-label','מעבר בין מסכי העריכה');
    workspace.parentNode?.insertBefore(tabs,workspace);
    this.mobileTabs = createComponent(MobileWorkspaceTabsComponent,{environmentInjector:this.environmentInjector,hostElement:tabs});
    this.appRef.attachView(this.mobileTabs.hostView);
    this.mobileTabs.changeDetectorRef.detectChanges();

    const bar = workspace.querySelector<HTMLElement>('.stage-toolbar');
    if (bar) {
      const host = document.createElement('button');
      host.type = 'button';
      host.className = 'ham-mobile-tools-button';
      host.setAttribute('aria-label','הצג או הסתר כלי תצוגה');
      bar.appendChild(host);
      this.mobileTools = createComponent(MobileToolsComponent,{environmentInjector:this.environmentInjector,hostElement:host});
      this.appRef.attachView(this.mobileTools.hostView);
      this.mobileTools.changeDetectorRef.detectChanges();
    }

    const inspector = workspace.querySelector<HTMLElement>(':scope > .inspector');
    if (inspector) {
      const host = document.createElement('button');
      host.type = 'button';
      host.className = 'ham-v279-sheet-close ham-angular-mobile-close';
      host.setAttribute('aria-label','סגור מאפיינים וחזור לתצוגה');
      inspector.appendChild(host);
      this.mobileInspectorCloseHost = host;
      this.syncMobileInspectorClose();
      window.addEventListener('resize', this.syncMobileInspectorClose);
      this.mobileInspectorClose = createComponent(MobileInspectorCloseComponent,{environmentInjector:this.environmentInjector,hostElement:host});
      this.mobileInspectorClose.instance.close.subscribe(() => this.mobileTabs?.instance.choose('preview'));
      this.appRef.attachView(this.mobileInspectorClose.hostView);
      this.mobileInspectorClose.changeDetectorRef.detectChanges();
    }
  }

  private loadOptionalFonts(): void {
    // Former legacy 006.js. Optional asynchronous font loading must not block UI.
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.media = 'print';
    link.href = 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&family=Assistant:wght@400;500;600;700;800&family=Rubik:wght@400;500;600;700;800&family=Noto+Sans+Hebrew:wght@400;500;600;700;800&family=Alef:wght@400;700&family=Arimo:wght@400;500;600;700&display=swap';
    link.addEventListener('load', () => link.media='all', {once:true});
    document.head.appendChild(link);
  }

  constructor(private appRef: ApplicationRef, private environmentInjector: EnvironmentInjector, private previewInteractions: PreviewInteractionsService, private workspaceResize: WorkspaceResizeService, private fileInputScroll: FileInputScrollService, private brand: HamonymBrandService, private carouselReset: CarouselResetService, private carouselRepair: CarouselRepairService, private panoramaInlineCarousel: PanoramaInlineCarouselService, private saveStatus: SaveStatusService, private saveToolbar: SaveToolbarService, private unifiedToolbar: UnifiedToolbarService, private singleToolbarShell: SingleToolbarShellService, private storyExpand: StoryExpandService, private miniCarousel: MiniCarouselService, private updateList: UpdateListService, private v209Toolbar: V209ToolbarService, private campaignFinalizer: CampaignRenderFinalizerService, private campaignRuntime: CampaignRuntimeService, private draftStorage: CampaignDraftStorageService, private campaignDocument: CampaignDocumentService, private campaignPersistence: CampaignPersistenceService, private campaignExport: CampaignExportService, private raceRegistration: RaceRegistrationService, private campaignCart: CampaignCartService, private raceFlow: RaceFlowService, private mediaEngine: CampaignMediaEngineService, private wizardEngine: CampaignWizardEngineService, private managementEngine: CampaignManagementEngineService, private campaignCore: CampaignCoreEngineService) {
    document.addEventListener('click', this.onLegacyMoreClick);
    document.addEventListener('click', this.onUpdatesSortClick, true);
    document.addEventListener('keydown', this.onUpdatesSortEscape);
    document.addEventListener('click', this.onPublicHeaderNavClick, true);
    document.addEventListener('keydown', this.onPublicHeaderNavEscape, true);
  }


  ngOnDestroy(): void {
    this.brand.ngOnDestroy();
    this.carouselReset.ngOnDestroy();
    this.carouselRepair.ngOnDestroy();
    this.panoramaInlineCarousel.ngOnDestroy();
    this.saveStatus.ngOnDestroy();
    this.saveToolbar.ngOnDestroy();
    this.unifiedToolbar.ngOnDestroy();
    this.campaignFinalizer.ngOnDestroy();
    this.campaignRuntime.ngOnDestroy();
    this.draftStorage.ngOnDestroy();
    this.campaignDocument.ngOnDestroy();
    this.campaignPersistence.ngOnDestroy();
    this.campaignExport.ngOnDestroy();
    this.v209Toolbar.ngOnDestroy();
    this.singleToolbarShell.ngOnDestroy();
    this.storyExpand.ngOnDestroy();
    this.miniCarousel.ngOnDestroy();
    this.updateList.ngOnDestroy();
    this.previewInteractions.ngOnDestroy();
    this.workspaceResize.ngOnDestroy();
    this.fileInputScroll.ngOnDestroy();
    this.topResizeObserver?.disconnect();
    window.removeEventListener('resize',this.fitWorkspaceTop);
    window.removeEventListener('resize', this.syncMobileInspectorClose);
    document.removeEventListener('click', this.onLegacyMoreClick);
    document.removeEventListener('click', this.onUpdatesSortClick, true);
    document.removeEventListener('keydown', this.onUpdatesSortEscape);
    document.removeEventListener('click', this.onPublicHeaderNavClick, true);
    document.removeEventListener('keydown', this.onPublicHeaderNavEscape, true);
    for (const component of [this.mobileInspectorClose,this.mobileTools,this.mobileTabs]) {
      if(component) {this.appRef.detachView(component.hostView);component.destroy();}
    }
  }

  async ngAfterViewInit(): Promise<void> {
    let startupPhase = 'loading markup';
    // Guard against accidentally starting the imperative compatibility runtime twice.
    if (document.documentElement.dataset.hamBridgeReady === 'true') return;
    try {
      const path = 'assets/legacy/';
      const markupResponse = await fetch(path + 'original-body.html');
      if (!markupResponse.ok) {
        throw new Error('Failed to load the original HTML shell.');
      }
      const markup = await markupResponse.text();
      if (!markup.includes('class="top"') || !markup.includes('class="workspace"')) {
        throw new Error('The HAMONYM editor HTML shell is incomplete.');
      }
      const dom = document.createElement('template');
      dom.innerHTML = markup;
      // Content is trusted local HTML from the project itself, not user input.
      document.body.appendChild(dom.content);
      // Preserve original DOM/CSS while starting core through Angular DI.
      // Legacy core is temporarily a TypeScript compatibility implementation.
      startupPhase = 'starting persistence services';
      this.draftStorage.start();
      this.campaignDocument.start();
      this.campaignPersistence.start();
      this.campaignExport.start();
      this.campaignRuntime.start();
      // The original 000 engine now starts through Angular dependency injection.
      // Order remains core -> management -> media -> wizard -> public finalizer.
      startupPhase = 'starting campaign core';
      this.campaignCore.start();
      if (!(window as any).hamAngularMediaContext?.readState) {
        throw new Error('Campaign core did not publish its state bridge');
      }
      startupPhase = 'starting management, media and wizard';
      this.managementEngine.start();
      this.mediaEngine.start();
      this.wizardEngine.start();
      this.campaignCart.start();
      this.raceRegistration.start();
      this.campaignFinalizer.start();
      this.raceFlow.start();
      // Controllers initialize immediately when DOM is ready; if it is still
      // loading, their native one-shot DOMContentLoaded handlers will fire.
      // Never replay browser lifecycle events globally: doing so duplicates
      // unrelated listeners and can trigger multiple render/upload handlers.
      startupPhase = 'starting UI controllers';
      this.carouselReset.start();
      this.brand.start();
      this.saveStatus.start();
      this.saveToolbar.start();
      this.singleToolbarShell.start();
      this.v209Toolbar.start();
      this.unifiedToolbar.start();
      this.previewInteractions.start();
      this.storyExpand.start();
      this.miniCarousel.start();
      this.updateList.start();
      this.panoramaInlineCarousel.start();
      this.carouselRepair.start();
      this.workspaceResize.start();
      this.fileInputScroll.start();
      this.mountMobileControls();
      this.startWorkspaceSizing();
      this.loadOptionalFonts();
      startupPhase = 'finalizing editor initialization';
      this.arrangeReadiness();
      this.arrangeReadiness();
      document.documentElement.dataset.hamBridgeReady = 'true';
      document.getElementById('ham-bridge-status')?.remove();
    } catch (error) {
      document.documentElement.dataset.hamBridgeReady = 'error';
      console.error(`[HAMONYM Angular bridge] Failed during ${startupPhase}`, error);
      const warning = document.createElement('div');
      warning.setAttribute('role', 'alert');
      warning.dir = 'rtl';
      const message = document.createElement('span');
      message.textContent = `שגיאה בהפעלת העורך (${startupPhase}). פרטים ב־Console. `;
      warning.appendChild(message);
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'טען מחדש';
      retry.style.cssText = 'margin-inline-start:12px;padding:5px 10px;cursor:pointer';
      retry.addEventListener('click', () => window.location.reload());
      warning.appendChild(retry);
      warning.style.cssText = 'position:fixed;top:12px;left:12px;background:#fff3f3;color:#831b1b;padding:16px;z-index:999999';
      document.body.appendChild(warning);
    }
  }

}
