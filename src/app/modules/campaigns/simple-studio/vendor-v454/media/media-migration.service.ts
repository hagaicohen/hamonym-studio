import { Injectable, inject } from '@angular/core';
import {
  CampaignMediaState, DRAFT_STORAGE_KEY, IMAGE_FALLBACK_KEY_PREFIX, MAX_PROCESSED_BYTES, MEDIA_PREFIX,
  OLD_RACE_PHOTO_MARKER, RACE_PHOTO_KEY_PREFIX, errorMessage
} from './media.types';
import { MediaContextService } from './media-context.service';
import { MediaStoreService, blobFromDataUrl, dataUrlFromBlob, isInlineImage, isMediaRef, isOldRacePhoto } from './media-store.service';
import { ImageProcessorService } from './image-processor.service';

type Container = Record<string | number, unknown>;
type MediaVisitor = (owner: Container, key: string | number, value: string) => void;

const MEDIA_FIELD = /^(?:image|photo|logo|orgLogo|logoImage|customIcon|labelIcon|videoPoster|avatar|picture)$/;

function isMediaField(key: string, parent: Container): boolean {
  return MEDIA_FIELD.test(key) || (key === 'value' && parent?.['type'] === 'image');
}

/** Visits every string field in the campaign that can hold an image. */
export function walkMedia(root: unknown, visitor: MediaVisitor): void {
  const visit = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj as Container)) {
      if (typeof v === 'string') {
        if (isMediaField(k, obj as Container)) visitor(obj as Container, k, v);
      } else if (Array.isArray(v)) {
        if (k === 'images') v.forEach((entry, index) => { if (typeof entry === 'string') visitor(v as unknown as Container, index, entry); else visit(entry); });
        else v.forEach(entry => visit(entry));
      } else visit(v);
    }
  };
  visit(root);
}

/**
 * One-time, non-destructive migration of inline (base64) images out of the
 * campaign JSON into the media store, plus conservative cleanup of obsolete
 * localStorage copies. Never removes the draft or anything still referenced.
 */
@Injectable({ providedIn: 'root' })
export class MediaMigrationService {
  private readonly context = inject(MediaContextService);
  private readonly store = inject(MediaStoreService);
  private readonly processor = inject(ImageProcessorService);

  /** localStorage keys referenced by the live state, undo/redo stacks or saved draft. */
  private protectedLegacyKeys(): Set<string> {
    const keep = new Set<string>();
    const capture = (input: unknown) => {
      let root = input;
      if (typeof root === 'string') { try { root = JSON.parse(root); } catch { return; } }
      if (!root || typeof root !== 'object') return;
      walkMedia(root, (_owner, _key, value) => {
        if (isOldRacePhoto(value)) keep.add(RACE_PHOTO_KEY_PREFIX + value.slice(OLD_RACE_PHOTO_MARKER.length));
        if (isMediaRef(value)) keep.add(IMAGE_FALLBACK_KEY_PREFIX + value.slice(MEDIA_PREFIX.length));
      });
    };
    const captureAll = (root: unknown) => {
      capture(root);
      try {
        const text = typeof root === 'string' ? root : JSON.stringify(root);
        for (const m of text.matchAll(/hamracephoto:([a-z0-9-]+)/gi)) keep.add(RACE_PHOTO_KEY_PREFIX + m[1]);
        for (const m of text.matchAll(/hamonymmedia:([a-z0-9-]+)/gi)) keep.add(IMAGE_FALLBACK_KEY_PREFIX + m[1]);
      } catch { /* unserializable entry */ }
    };
    const ctx = this.context.ctx;
    captureAll(ctx.readState());
    ctx.history()?.forEach(captureAll);
    ctx.future()?.forEach(captureAll);
    try { const saved = ctx.storage.getItem(DRAFT_STORAGE_KEY); if (saved) captureAll(saved); } catch { /* unavailable */ }
    return keep;
  }

  private async sameImageBytes(data: string, stored: unknown): Promise<boolean> {
    if (!(stored instanceof Blob) || !isInlineImage(data)) return false;
    const a = blobFromDataUrl(data);
    if (a.size !== stored.size || a.type !== stored.type) return false;
    const x = new Uint8Array(await a.arrayBuffer()), y = new Uint8Array(await stored.arrayBuffer());
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  async freeLegacyStorage(): Promise<{ freed: number; keys: number }> {
    if (!this.context.storage.persistent) return { freed: 0, keys: 0 };
    let storage: Storage;
    try { storage = window.localStorage; } catch { return { freed: 0, keys: 0 }; }
    const keep = this.protectedLegacyKeys();
    const db = await this.store.db();
    const candidates: string[] = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith(RACE_PHOTO_KEY_PREFIX) || key?.startsWith(IMAGE_FALLBACK_KEY_PREFIX)) candidates.push(key);
      }
    } catch { return { freed: 0, keys: 0 }; }

    let freed = 0, keys = 0;
    for (const key of candidates) {
      try {
        const value = storage.getItem(key);
        if (!value) continue;
        let removable = !keep.has(key);
        // A protected fallback copy may still go if IndexedDB holds identical bytes.
        if (!removable && db && key.startsWith(IMAGE_FALLBACK_KEY_PREFIX)) {
          const copy = await this.store.getByKey(key.slice(IMAGE_FALLBACK_KEY_PREFIX.length));
          removable = await this.sameImageBytes(value, copy).catch(() => false);
        }
        if (removable) { storage.removeItem(key); freed += value.length; keys++; }
      } catch (error) { console.warn('HAMONYM: legacy image cleanup skipped', key, error); }
    }
    if (keys) console.info(`HAMONYM: removed ${keys} unused/duplicate legacy photo copies (${freed} characters)`);
    return { freed, keys };
  }

  async prepare(): Promise<{ migrated: number; storage: string }> {
    const db = await this.store.db();
    if (!db) { await this.freeLegacyStorage(); return { migrated: 0, storage: 'fallback' }; }
    const ctx = this.context.ctx;
    const edits: Array<[Container, string | number, string]> = [];
    const refs = new Set<string>();
    walkMedia(ctx.readState(), (obj, key, val) => {
      if (isInlineImage(val) || isOldRacePhoto(val)) edits.push([obj, key, val]);
      else if (isMediaRef(val)) refs.add(val);
    });
    for (const ref of refs) await this.store.read(ref);

    // Write images before replacing state references: legacy data stays intact
    // if a DB write, quota check or the final draft save fails.
    const converted: Array<{ obj: Container; key: string | number; old: string }> = [];
    for (const [obj, key, val] of edits) {
      const data = isOldRacePhoto(val) ? this.store.legacySrc(val) : val;
      if (!isInlineImage(data)) continue;
      try {
        let blob = blobFromDataUrl(data);
        if (blob.size > MAX_PROCESSED_BYTES) blob = await this.processor.process(blob, 'card');
        const ref = await this.store.save(blob);
        converted.push({ obj, key, old: val });
        obj[key] = ref;
      } catch (e) { console.warn('HAMONYM: existing photo kept unchanged', errorMessage(e)); break; }
    }
    let migrated = converted.length;
    if (converted.length) {
      try {
        this.context.persistDraft();
        // Undo entries would still reference the inline copies; clear them once.
        const history = ctx.history(), future = ctx.future();
        if (Array.isArray(history)) { history.length = 0; if (Array.isArray(future)) future.length = 0; ctx.updateUndo(); }
      } catch (e) {
        for (const x of converted) x.obj[x.key] = x.old;
        migrated = 0;
        console.warn('HAMONYM: media migration rolled back', e);
      }
    }
    await this.freeLegacyStorage();
    return { migrated, storage: 'IndexedDB' };
  }

  /** Deep copy of the campaign with every image ref inlined (for export/backup). */
  async portableCopy(): Promise<CampaignMediaState> {
    const copy = JSON.parse(JSON.stringify(this.context.state())) as CampaignMediaState;
    const locations: Array<[Container, string | number, string]> = [];
    walkMedia(copy, (obj, key, val) => { if (isMediaRef(val) || isOldRacePhoto(val)) locations.push([obj, key, val]); });
    for (const [obj, key, val] of locations) {
      const data = await this.store.read(val);
      if (!data) throw new Error('חסר קובץ תמונה בגיבוי: ' + val);
      obj[key] = data instanceof Blob ? await dataUrlFromBlob(data) : data;
    }
    return copy;
  }

  /** All refs currently used by the campaign state. */
  collectRefs(): Set<string> {
    const refs = new Set<string>();
    walkMedia(this.context.state(), (_o, _k, val) => { if (isMediaRef(val)) refs.add(val); });
    return refs;
  }
}
