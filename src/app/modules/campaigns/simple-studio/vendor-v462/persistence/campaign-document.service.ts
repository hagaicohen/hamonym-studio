import { Injectable, OnDestroy } from '@angular/core';

/** The existing on-disk campaign format is intentionally unchanged. */
export interface CampaignDocument {
  content: {
    hero: Record<string, unknown>;
    share?: Record<string, unknown>;
    nav?: Record<string, unknown> & { placement?: Record<string, unknown> };
    campaignInfo?: Record<string, unknown>;
    [key: string]: unknown;
  };
  theme: Record<string, unknown>;
  visible: Record<string, unknown>;
  deviceVisibility?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HamCampaignDocumentBridge {
  normalizeImport(raw: unknown, originalDefaults: CampaignDocument): CampaignDocument;
}

declare global {
  interface Window {
    hamAngularCampaignDocument?: HamCampaignDocumentBridge;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Angular owner of legacy JSON import validation and defaults merging.
 * Preserve the original shallow merges, explicit false flags and all unknown
 * fields, so existing saved campaign documents are not accidentally migrated.
 */
@Injectable({ providedIn: 'root' })
export class CampaignDocumentService implements OnDestroy {
  private readonly bridge: HamCampaignDocumentBridge = {
    normalizeImport: (raw, defaults) => this.normalizeImport(raw, defaults)
  };

  start(): void {
    // v4.61: `window.hamAngularCampaignDocument` (no reader) is no longer published.
  }

  normalizeImport(raw: unknown, defaults: CampaignDocument): CampaignDocument {
    if (!isObject(raw) || !isObject(raw['content']) ||
        !isObject((raw['content'] as Record<string, unknown>)['hero']) ||
        !isObject(raw['theme']) || !isObject(raw['visible'])) {
      throw new Error('מבנה לא תקין');
    }
    const doc = raw as CampaignDocument;
    const c = doc.content;
    const d = defaults.content;
    // Normalize only fields the original importer normalized. Preserve arbitrary
    // additional fields and the established JSON schema for backwards compatibility.
    doc.deviceVisibility = { ...defaults.deviceVisibility, ...doc.deviceVisibility };
    c.hero = { ...d.hero, ...c.hero };
    c.share = { ...d.share, ...c.share };
    c.nav = { ...d.nav, ...c.nav };
    c.nav.placement = { ...d.nav?.placement, ...c.nav.placement };
    c.campaignInfo = { ...d.campaignInfo, ...c.campaignInfo };
    doc.visible['campaignInfo'] = doc.visible['campaignInfo'] !== false;
    return doc;
  }

  ngOnDestroy(): void {
  }
}
