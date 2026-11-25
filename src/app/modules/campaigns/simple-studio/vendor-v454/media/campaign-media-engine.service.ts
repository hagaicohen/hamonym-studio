import { Injectable, inject } from '@angular/core';
import { MediaBridge, MediaContext } from './media.types';
import { MediaContextService } from './media-context.service';
import { MediaStoreService } from './media-store.service';
import { ImageProcessorService } from './image-processor.service';
import { MediaMigrationService } from './media-migration.service';
import { MediaDomPatchService } from './media-dom-patch.service';
import { MediaUploadService } from './media-upload.service';
import { MediaDiagnosticsService } from './media-diagnostics.service';

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
  private readonly domPatch = inject(MediaDomPatchService);
  private readonly uploads = inject(MediaUploadService);
  private readonly diagnostics = inject(MediaDiagnosticsService);
  private started = false;

  start(): void {
    if (this.started) return;
    const context = (window as Window & { hamAngularMediaContext?: MediaContext }).hamAngularMediaContext;
    if (!context || typeof context.readState !== 'function') {
      throw new Error('Media engine cannot start before the campaign context is ready');
    }
    this.context.attach(context);
    this.diagnostics.cacheSize = () => this.store.cache.size;
    this.publishLegacyBridge();
    this.uploads.start();
    this.domPatch.start();
    void this.hydrate();
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
      patchMedia: root => this.domPatch.patch(root),
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
        if (document.querySelector('.workspace.hu-management-mode')) document.querySelector<HTMLElement>('[data-hu-mode="management"]')?.click();
        else ctx.renderInspector();
      }
      this.domPatch.schedule();
    } catch (error) {
      console.error('HAMONYM media initialization failed', error);
    }
  }
}
