import { Injectable, OnDestroy } from '@angular/core';
import { CampaignDraftStorageService } from './campaign-draft-storage.service';

export interface HamCampaignPersistResult {
  ok: boolean;
  message: string;
  /** v4.54: set when the storage adapter has `setItemAsync`; resolves (never rejects) with the final result. */
  pending?: Promise<HamCampaignPersistResult>;
}

/** Save status texts (v4.54: "saving" and the remote failure are new; the rest are unchanged). */
export const SAVE_MESSAGES = {
  saving: 'שומר…',
  saved: '✓ נשמר',
  failed: (reason: string) => '⚠ השמירה נכשלה' + (reason ? ': ' + reason : '')
};

export interface HamCampaignPersistenceBridge {
  persist(campaign: unknown): HamCampaignPersistResult;
}

declare global {
  interface Window { hamAngularCampaignPersistence?: HamCampaignPersistenceBridge; }
}

/**
 * Owns the editor's draft-write operation, not just its storage adapter.
 * Preserve existing document format and localStorage key, without invoking
 * render or history, which are controlled by CampaignRuntimeService.
 */
@Injectable({ providedIn: 'root' })
export class CampaignPersistenceService implements OnDestroy {
  private readonly bridge: HamCampaignPersistenceBridge = {
    persist: (campaign) => this.persist(campaign)
  };

  constructor(private readonly drafts: CampaignDraftStorageService) {}

  start(): void {
    window.hamAngularCampaignPersistence = this.bridge;
  }

  persist(campaign: unknown): HamCampaignPersistResult {
    try {
      // The draft-storage service is initialized before the legacy engine.
      const storage = window.hamAngularDraftStorage;
      if (!storage) throw new Error('Draft storage has not been initialized');
      const value = JSON.stringify(campaign);
      // The local draft is written first in every case, so a failed remote save loses nothing.
      storage.setItem('hamonym-studio-v01', value);
      if (typeof storage.setItemAsync === 'function') {
        const pending = Promise.resolve()
          .then(() => storage.setItemAsync!('hamonym-studio-v01', value))
          .then(
            (): HamCampaignPersistResult => ({ ok: true, message: SAVE_MESSAGES.saved }),
            (error: unknown): HamCampaignPersistResult => {
              console.warn('Remote save failed', error);
              const reason = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
              return { ok: false, message: SAVE_MESSAGES.failed(reason) };
            });
        return { ok: true, message: SAVE_MESSAGES.saving, pending };
      }
      return { ok: true, message: storage.persistent ? '✓ נשמר אוטומטית בדפדפן' : 'שמירה זמנית בלבד — לא נשמר בדפדפן' };
    } catch (error) {
      console.warn('Local save failed', error);
      return { ok: false, message: '⚠ השמירה נכשלה: האחסון מלא' };
    }
  }

  ngOnDestroy(): void {
    if (window.hamAngularCampaignPersistence === this.bridge) {
      delete window.hamAngularCampaignPersistence;
    }
  }
}
