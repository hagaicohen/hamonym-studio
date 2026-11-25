import { Injectable, OnDestroy } from '@angular/core';

export interface HamCampaignExportBridge {
  download(portable: unknown): void;
}

declare global {
  interface Window { hamAngularCampaignExport?: HamCampaignExportBridge; }
}

/**
 * Owns the downloaded campaign JSON artifact. The legacy media pipeline still
 * prepares the portable payload before calling this service; the data format,
 * MIME type, indentation, and original filename are intentionally preserved.
 */
@Injectable({ providedIn: 'root' })
export class CampaignExportService implements OnDestroy {
  private readonly bridge: HamCampaignExportBridge = {
    download: portable => this.download(portable)
  };

  start(): void {
    window.hamAngularCampaignExport = this.bridge;
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

  ngOnDestroy(): void {
    if (window.hamAngularCampaignExport === this.bridge) {
      delete window.hamAngularCampaignExport;
    }
  }
}
