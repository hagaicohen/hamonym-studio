import { Injectable, OnDestroy } from '@angular/core';

/** Existing localStorage keys and data formats are preserved verbatim. */
export interface HamDraftStorageBridge {
  readonly persistent: boolean;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  /**
   * Optional (v4.54): a remote store. When present, `CampaignPersistenceService.persist` writes the local
   * draft with `setItem` first (it is kept if the remote write fails), then awaits this; a rejection is the
   * save's failure, and its message is shown in the save status.
   */
  setItemAsync?(key: string, value: string): Promise<void>;
  /** Optional platform policy: automatic drafts can remain local until Save. */
  requestRemoteSave?(): void;
  shouldSaveRemote?(key: string, value: string): boolean;
}

declare global {
  interface Window {
    hamAngularDraftStorage?: HamDraftStorageBridge;
  }
}

/**
 * Single Angular owner of the original HAMONYM draft/media storage adapter.
 * Does not migrate or clear existing data. A quota-full store remains readable;
 * private/sandboxed storage falls back to volatile memory, exactly as before.
 */
const MEMORY = new Map<string, string>();

@Injectable({ providedIn: 'root' })
export class CampaignDraftStorageService implements OnDestroy {
  /** v4.56: kept across Studio sessions of the same page (a remount keeps the draft when storage is unavailable). */
  private readonly memory = MEMORY;
  private bridge: HamDraftStorageBridge | null = null;

  start(): void {
    if (this.bridge) return;
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
      const key = '__hamonym_storage_access_check__';
      try {
        storage.setItem(key, 'ok');
        storage.removeItem(key);
      } catch (error) {
        if (!this.isQuotaError(error)) throw error;
        console.warn('HAMONYM: storage quota is full; retaining access to the existing campaign draft.');
      }
    } catch (error) {
      console.warn('HAMONYM: browser storage is unavailable. Changes are temporary in this preview.', error);
      storage = null;
    }

    const selectedStorage = storage;
    this.bridge = selectedStorage
      ? {
          persistent: true,
          getItem: (key) => selectedStorage.getItem(key),
          setItem: (key, value) => selectedStorage.setItem(key, value)
        }
      : {
          persistent: false,
          getItem: (key) => this.memory.get(key) ?? null,
          setItem: (key, value) => { this.memory.set(key, String(value)); }
        };
    window.hamAngularDraftStorage = this.bridge;
  }

  private isQuotaError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const value = error as { name?: string; code?: number };
    return value.name === 'QuotaExceededError' || value.name === 'NS_ERROR_DOM_QUOTA_REACHED' || value.code === 22;
  }

  ngOnDestroy(): void {
    if (window.hamAngularDraftStorage === this.bridge) delete window.hamAngularDraftStorage;
    this.bridge = null;
  }
}
