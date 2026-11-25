import { EnvironmentInjector, Injectable, Provider, createEnvironmentInjector, inject } from '@angular/core';
// Generated (v4.56): every Studio service, provided again in each Studio session's injector (studio-session.ts).
// A service listed here gets a new instance per mount, destroyed with AppComponent (Router-safe remount).
import { CampaignCartService } from '../cart/campaign-cart.service';
import { CartStoreService } from '../cart/cart-store.service';
import { CampaignStateService } from '../core/campaign-state.service';
import { EditorService } from '../core/editor.service';
import { MoneyFieldService } from '../core/money-field.service';
import { ManagementControllerService } from '../management/management-controller.service';
import { InspectorService } from '../inspector/inspector.service';
import { WideEditorService } from '../inspector/wide-editor';
import { WorkspaceResizeService } from '../layout/workspace-resize.service';
import { CalendarService } from '../management/calendar/calendar.service';
import { ContentStateService } from '../management/content/content-state.service';
import { RewardPreviewService } from '../management/content/reward-preview.component';
import { ManagementCommandsService } from '../management/management-commands.service';
import { ManagementEditService } from '../management/management-edit.service';
import { ManagementInputService } from '../management/management-input.service';
import { ManagementModelService } from '../management/management-model.service';
import { ManagementViewService } from '../management/management-view.service';
import { CampaignMediaEngineService } from '../media/campaign-media-engine.service';
import { FileInputScrollService } from '../media/file-input-scroll.service';
import { ImageProcessorService } from '../media/image-processor.service';
import { MediaContextService } from '../media/media-context.service';
import { MediaDiagnosticsService } from '../media/media-diagnostics.service';
import { MediaMigrationService } from '../media/media-migration.service';
import { MediaStoreService } from '../media/media-store.service';
import { MediaUploadService } from '../media/media-upload.service';
import { CampaignDocumentService } from '../persistence/campaign-document.service';
import { CampaignDraftStorageService } from '../persistence/campaign-draft-storage.service';
import { CampaignExportService } from '../persistence/campaign-export.service';
import { CampaignPersistenceService } from '../persistence/campaign-persistence.service';
import { StudioToolbarService } from '../layout/studio-toolbar.service';
import { PreviewSelectionService } from '../preview/preview-selection.service';
import { CampaignHistoryService } from '../preview/campaign-history.service';
import { CampaignRenderFinalizerService } from '../preview/campaign-render-finalizer.service';
import { CampaignCardsService } from '../public-page/campaign-cards.service';
import { CardMediaService } from '../public-page/cards/card-media.service';
import { CollectionBlocksService } from '../public-page/collections/collection-blocks.service';
import { PublicPartsService } from '../public-page/parts/public-parts.service';
import { StorySlidesService } from '../public-page/parts/story-slides.service';
import { RaceRegistrationService } from '../races/race-registration.service';
import { RaceStateService } from '../races/race-state.service';
import { StoryBuilderService } from '../story-builder/story-builder.service';
import { SectionTreeService } from '../tree/section-tree.service';
import { UpdateListService } from '../updates/update-list.service';
import { CampaignWizardEngineService } from '../wizard/campaign-wizard-engine.service';
import { WizardService } from '../wizard/wizard.service';
export const STUDIO_SERVICES = [CampaignCartService, CartStoreService, CampaignStateService, EditorService, MoneyFieldService, ManagementControllerService, InspectorService, WideEditorService, WorkspaceResizeService, CalendarService, ContentStateService, RewardPreviewService, ManagementCommandsService, ManagementEditService, ManagementInputService, ManagementModelService, ManagementViewService, CampaignMediaEngineService, FileInputScrollService, ImageProcessorService, MediaContextService, MediaDiagnosticsService, MediaMigrationService, MediaStoreService, MediaUploadService, CampaignDocumentService, CampaignDraftStorageService, CampaignExportService, CampaignPersistenceService, StudioToolbarService, PreviewSelectionService, CampaignHistoryService, CampaignRenderFinalizerService, CampaignCardsService, CardMediaService, CollectionBlocksService, PublicPartsService, StorySlidesService, RaceRegistrationService, RaceStateService, StoryBuilderService, SectionTreeService, UpdateListService, CampaignWizardEngineService, WizardService];

/**
 * The Studio session's injector: every Studio service, new per mount. AppComponent provides it, and forwards each
 * service to it (`STUDIO_PROVIDERS`), so the components of its template and the components the services create with
 * this injector share one instance of each service.
 */
@Injectable()
export class StudioScope {
  readonly injector = createEnvironmentInjector(STUDIO_SERVICES, inject(EnvironmentInjector), 'HAMONYM Studio session');
}
export const STUDIO_PROVIDERS: Provider[] = [StudioScope, ...STUDIO_SERVICES.map(service => ({ provide: service, useFactory: () => inject(StudioScope).injector.get(service) }))];
