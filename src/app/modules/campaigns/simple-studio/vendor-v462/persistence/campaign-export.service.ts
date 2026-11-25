import { Injectable, Injector, OnDestroy, inject } from '@angular/core';
import { openStandaloneCampaign } from './standalone-export';
import { CollectionBlocksService } from '../public-page/collections/collection-blocks.service';
import { studioAdopt } from '../core/studio-session';
import { EditorService } from '../core/editor.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Owns the downloaded campaign JSON artifact. The legacy media pipeline still
 * prepares the portable payload before calling this service; the data format,
 * MIME type, indentation, and original filename are intentionally preserved.
 */
@Injectable({ providedIn: 'root' })
export class CampaignExportService implements OnDestroy {
  private readonly injector = inject(Injector);
  private readonly collections = inject(CollectionBlocksService);
  /** The editor, resolved when an export runs. */
  private editor(): EditorService { return this.injector.get(EditorService); }

  /** v4.61: the standalone public page (new tab, in-page fallback, or `HAMONYM-Campaign-Preview.html`), moved from the core. */
  openStandalone(downloadOnly = false): void {
    const editor = this.editor();
    openStandaloneCampaign({
      doc: () => editor.context.readState(), device: () => editor.device(), setDevice: (d: string) => editor.setDeviceOnly(d as 'mobile' | 'desktop'),
      renderPreview: () => editor.renderPreview(), collections: this.collections,
      cart: () => (window as any).hamUnifiedCart?.exportCart?.() || [], adopt: <T extends Node>(node: T) => studioAdopt(node)
    }, downloadOnly);
  }

  download(portable: unknown): void {
    // Serialize first: if a circular object is passed, no URL or anchor leaks.
    const json = JSON.stringify(portable, null, 2);
    if (json === undefined) throw new Error('לא ניתן לייצא קמפיין ריק');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = 'hamonym-campaign.json';
      link.click();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    // Preserve the original delay to allow the browser to initiate download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ngOnDestroy(): void { /* nothing published */ }
}
