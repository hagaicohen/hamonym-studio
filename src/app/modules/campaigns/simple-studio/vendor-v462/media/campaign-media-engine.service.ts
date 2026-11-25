import { Injectable, Injector, inject } from '@angular/core';
import { MediaBridge, MediaContext } from './media.types';
import { MediaContextService } from './media-context.service';
import { MediaStoreService } from './media-store.service';
import { ImageProcessorService } from './image-processor.service';
import { MediaMigrationService } from './media-migration.service';
import { MediaUploadService } from './media-upload.service';
import { MediaDiagnosticsService } from './media-diagnostics.service';
import { EditorService } from '../core/editor.service';
import { ManagementViewService } from '../management/management-view.service';

/**
 * Starts the Angular media subsystem (store, processor, migration, uploads).
 * Must run after the core engine published its state bridge and before the wizard.
 *
 * `window.hamonymMediaFix` is kept as a thin facade because the core,
 * management and wizard engines are not migrated yet and still call it.
 * Remove it once those engines inject MediaStoreService directly.
 */
@Injectable({ providedIn: 'root' })
export class CampaignMediaEngineService {
  private readonly context = inject(MediaContextService);
  private readonly store = inject(MediaStoreService);
  private readonly processor = inject(ImageProcessorService);
  private readonly migration = inject(MediaMigrationService);
  private readonly uploads = inject(MediaUploadService);
  private readonly diagnostics = inject(MediaDiagnosticsService);
  private readonly editor = inject(EditorService);
  private readonly injector = inject(Injector);
  private started = false;
  /** Completion of startup-only media normalization, for the host's clean baseline. */
  ready: Promise<void> = Promise.resolve();

  start(): void {
    if (this.started) return;
    this.context.attach(this.editor.context as MediaContext);
    this.diagnostics.cacheSize = () => this.store.cache.size;
    this.publishLegacyBridge();
    this.uploads.start();
    this.ready = this.hydrate();
    this.started = true;
  }

  private publishLegacyBridge(): void {
    const bridge: MediaBridge = {
      prepare: () => this.migration.prepare(),
      portableCopy: () => this.migration.portableCopy(),
      read: ref => this.store.read(ref),
      save: data => this.store.save(data),
      src: ref => this.store.src(ref),
      process: (file, kind) => this.processor.process(file, kind),
      safeMarkup: value => this.store.safeMarkup(value),
      cache: this.store.cache,
      diagnostics: () => this.diagnostics.snapshot(),
      downloadDiagnostics: () => this.diagnostics.download(),
      freeLegacyStorage: () => this.migration.freeLegacyStorage()
    };
    (window as Window & { hamonymMediaFix?: MediaBridge }).hamonymMediaFix = bridge;
  }

  /**
   * Startup: migrate inline images once, load every referenced image, and
   * re-render a single time (the first preview was drawn before IndexedDB answered).
   */
  private async hydrate(): Promise<void> {
    try {
      const result = await this.migration.prepare();
      const refs = this.migration.collectRefs();
      for (const ref of refs) await this.store.read(ref);
      if (result.migrated) console.info(`HAMONYM: migrated ${result.migrated} images into independent storage`);
      if (result.migrated || refs.size) {
        const ctx = this.context.ctx;
        ctx.renderPreview();
        if (this.injector.get(ManagementViewService).mode() !== 'design') this.injector.get(ManagementViewService).chooseMode('management');
        else ctx.renderInspector();
      }
    } catch (error) {
      console.error('HAMONYM media initialization failed', error);
    }
  }
}
