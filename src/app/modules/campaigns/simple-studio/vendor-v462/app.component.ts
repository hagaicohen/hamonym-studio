import { ManagementViewService } from './management/management-view.service';
import { EditorService } from './core/editor.service';
import { ManagementControllerService } from './management/management-controller.service';
import { MoneyFieldService } from './core/money-field.service';
import { CampaignWizardEngineService } from './wizard/campaign-wizard-engine.service';
import { CampaignMediaEngineService } from './media/campaign-media-engine.service';
import { CampaignCartService } from './cart/campaign-cart.service';
import { RaceRegistrationService } from './races/race-registration.service';
import { CampaignPersistenceService } from './persistence/campaign-persistence.service';
import { CampaignDocumentService } from './persistence/campaign-document.service';
import { CampaignDraftStorageService } from './persistence/campaign-draft-storage.service';
import { CampaignRenderFinalizerService } from './preview/campaign-render-finalizer.service';
import { UpdateListService } from './updates/update-list.service';
import { PublicPartsService } from './public-page/parts/public-parts.service';
import { StudioToolbarService } from './layout/studio-toolbar.service';
import { FileInputScrollService } from './media/file-input-scroll.service';
import { WorkspaceResizeService } from './layout/workspace-resize.service';
import { AfterViewInit, Component, ElementRef, EnvironmentInjector, HostListener, OnDestroy, ViewChild, inject, isDevMode, signal } from '@angular/core';
import { CollectionBlocksService } from './public-page/collections/collection-blocks.service';
import { MobileWorkspaceTabsComponent } from './mobile/mobile-workspace-tabs.component';
import { MobileToolsComponent } from './mobile/mobile-tools.component';
import { MobileInspectorCloseComponent } from './mobile/mobile-inspector-close.component';
import { HamonymBrandComponent } from './brand/hamonym-brand.component';
import { SingleToolbarControlsComponent } from './layout/single-toolbar-controls.component';
import { UnifiedToolbarComponent } from './layout/unified-toolbar.component';
import { InspectorComponent, InspectorHeadComponent, InspectorTabsComponent } from './inspector/inspector.component';
import { StoryBuilderComponent } from './story-builder/story-builder.component';
import { SectionTreeComponent } from './tree/section-tree.component';
import { EditPencilComponent } from './preview/edit-pencil.component';
import { PreviewSelectionService } from './preview/preview-selection.service';

import { StudioSession, studioAdopt, studioListen } from './core/studio-session';
import { STUDIO_PROVIDERS, StudioScope } from './core/studio-services';
/**
 * The HAMONYM Simple Studio. Its template is the editor's shell (formerly `assets/legacy/original-body.html`, fetched
 * and appended to <body>): the toolbar, the workspace (tree, preview, inspector), the template modal, the Story
 * Builder and the toast. The host is `display: contents`, so the shell lays out as before; the legacy CSS's
 * `body > .top` selectors are `app-root > .top` (same specificity).
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [HamonymBrandComponent, SingleToolbarControlsComponent, UnifiedToolbarComponent, MobileWorkspaceTabsComponent, MobileToolsComponent, MobileInspectorCloseComponent, InspectorHeadComponent, InspectorTabsComponent, InspectorComponent, StoryBuilderComponent, SectionTreeComponent, EditPencilComponent],
  templateUrl: './app.component.html',
  providers: STUDIO_PROVIDERS,
  styles: [':host{display:contents}']
})
export class AppComponent implements AfterViewInit, OnDestroy {
  /**
   * v4.56: one Studio session per mount (Router-safe). The session scopes the document / window listeners, timers,
   * body / head nodes and globals the Studio adds (core/studio-session.ts); the child injector gives every Studio
   * service a new instance per mount (core/studio-services.ts), destroyed in ngOnDestroy.
   */
  private readonly session = StudioSession.begin(inject(ElementRef).nativeElement as HTMLElement);
  private readonly studio: EnvironmentInjector = inject(StudioScope).injector;
  private readonly environmentInjector = this.studio;
  private readonly workspaceResize = this.studio.get(WorkspaceResizeService);
  private readonly fileInputScroll = this.studio.get(FileInputScrollService);
  readonly toolbar = this.studio.get(StudioToolbarService);
  readonly previewSel = this.studio.get(PreviewSelectionService);
  @ViewChild('importFile', { static: true }) set importFile(ref: ElementRef<HTMLInputElement>) { this.toolbar.importInput = ref.nativeElement; }
  /** The hidden demo button loads the demo kind last requested (`window.hamDemoKind`). */
  requestedDemo(): 'donation' | 'race' { return (window as any).hamDemoKind === 'race' ? 'race' : 'donation'; }
  private readonly updateList = this.studio.get(UpdateListService);
  private readonly campaignFinalizer = this.studio.get(CampaignRenderFinalizerService);
  private readonly draftStorage = this.studio.get(CampaignDraftStorageService);
  private readonly campaignDocument = this.studio.get(CampaignDocumentService);
  private readonly campaignPersistence = this.studio.get(CampaignPersistenceService);
  private readonly raceRegistration = this.studio.get(RaceRegistrationService);
  private readonly campaignCart = this.studio.get(CampaignCartService);
  private readonly mediaEngine = this.studio.get(CampaignMediaEngineService);
  private readonly wizardEngine = this.studio.get(CampaignWizardEngineService);
  private readonly management = this.studio.get(ManagementControllerService);
  readonly managementView = this.studio.get(ManagementViewService);
  readonly editor = this.studio.get(EditorService);
  private readonly moneyFields = this.studio.get(MoneyFieldService);
  private readonly publicParts = this.studio.get(PublicPartsService);
  // The mobile controls (legacy 044–047) are in the template.
  @ViewChild('mobileTabs', { static: true }) mobileTabs!: MobileWorkspaceTabsComponent;
  private readonly narrow = window.matchMedia('(max-width: 767px)');
  /** The inspector's mobile close button never shows on desktop (an inline important rule, as before). */
  readonly mobileCloseStyle = signal<string | null>(null);
  private readonly syncMobileInspectorClose = (): void => {
    this.mobileCloseStyle.set(this.narrow.matches ? null : 'display: none !important;');
  };

  /** Integration events (window): open the large editor, a block in it, or ask for design mode. */
  @HostListener('window:hamonym:open-design-studio') openDesignStudio(): void { this.editor.openDesignStudio(); }
  @HostListener('window:hamonym:open-component-editor', ['$event']) openComponentEditor(event: Event): void { this.management.onOpenComponentEditor(event); }
  @HostListener('window:hamonym:request-design-mode', ['$event']) requestDesignMode(event: Event): void { this.management.onRequestDesignMode(event); }
  /** Window size: the donate buttons, the mobile close button and the workspace top (v4.62: one Angular listener). */
  @HostListener('window:resize') resized(): void { this.syncMobileInspectorClose(); this.editor.syncDonationCtas(); if (this.sized) this.fitWorkspaceTop(); }
  private sized = false;

  /** The toolbar's "⋯" menu closes on a click outside it. */
  @HostListener('document:click', ['$event']) closeMoreMenu(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('.top .ham-top-more')) return;
    document.querySelectorAll<HTMLDetailsElement>('.top .ham-top-more[open]').forEach(el => el.open = false);
  }

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
    this.sized = true;
    if ('ResizeObserver' in window) {
      this.topResizeObserver = new ResizeObserver(this.fitWorkspaceTop);
      document.querySelectorAll('.top,#huToolbar').forEach(el => this.topResizeObserver?.observe(el));
    }
    document.fonts?.ready?.then(this.fitWorkspaceTop).catch(() => {});
  }

  private loadOptionalFonts(): void {
    // Former legacy 006.js. Optional asynchronous font loading must not block UI.
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.media = 'print';
    link.href = 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&family=Assistant:wght@400;500;600;700;800&family=Rubik:wght@400;500;600;700;800&family=Noto+Sans+Hebrew:wght@400;500;600;700;800&family=Alef:wght@400;700&family=Arimo:wght@400;500;600;700&display=swap';
    link.addEventListener('load', () => link.media='all', {once:true});
    document.head.appendChild(studioAdopt(link));
  }

  constructor() {
    this.syncMobileInspectorClose();
  }


  ngOnDestroy(): void {
    this.topResizeObserver?.disconnect();
    // The services' own ngOnDestroy (components they created, observers, globals), then what the session recorded.
    this.studio.destroy();
    this.session.end();
  }

  ngAfterViewInit(): void {
    let startupPhase = 'starting persistence services';
    // Guard against accidentally starting the Studio twice in one document.
    if (document.documentElement.dataset.hamBridgeReady === 'true') return;
    try {
      this.draftStorage.start();
      this.campaignDocument.start();
      this.campaignPersistence.start();
      // Order remains core -> management -> media -> wizard -> public finalizer.
      startupPhase = 'starting the editor';
      this.editor.start();
      this.moneyFields.start();
      startupPhase = 'starting management, media and wizard';
      this.management.start();
      this.mediaEngine.start();
      this.wizardEngine.start();
      this.campaignCart.start();
      this.raceRegistration.start();
      this.campaignFinalizer.start();
      startupPhase = 'starting UI controllers';
      this.toolbar.start();
      document.body.classList.add('ham-v297-toolbar-ready');
      this.updateList.start();
      this.workspaceResize.start();
      this.fileInputScroll.start();
      this.mobileTabs.attach();
      this.startWorkspaceSizing();
      this.loadOptionalFonts();
      // Test hook for the parity / lifecycle harnesses (tools/): development builds only, removed with the session.
      if (isDevMode()) (window as any).__hamStudio = { context: this.editor.context, carousel: (root: Element) => (this.studio.get(CollectionBlocksService) as any).carousel(root) };
      document.documentElement.dataset.hamBridgeReady = 'true';
    } catch (error) {
      document.documentElement.dataset.hamBridgeReady = 'error';
      console.error(`[HAMONYM Studio] Failed during ${startupPhase}`, error);
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
      document.body.appendChild(studioAdopt(warning));
    }
  }

}
