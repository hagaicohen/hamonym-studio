import { Injectable, inject , signal } from '@angular/core';
import { Subject } from 'rxjs';
import {
  IMAGE_FALLBACK_KEY_PREFIX, MAX_PROCESSED_BYTES, MEDIA_PREFIX, OLD_RACE_PHOTO_MARKER,
  RACE_PHOTO_KEY_PREFIX, StoredMedia, TRANSPARENT_IMAGE
} from './media.types';
import { MediaContextService } from './media-context.service';

const DB_NAME = 'hamonym-studio-images';
const STORE = 'media';
const ACCEPTED_STORED_TYPES = /^image\/(jpeg|png|webp|gif|svg\+xml)$/;
const INLINE_IMAGE = /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);/i;

export const isMediaRef = (v: unknown): v is string => typeof v === 'string' && v.startsWith(MEDIA_PREFIX);
export const isOldRacePhoto = (v: unknown): v is string => typeof v === 'string' && v.startsWith(OLD_RACE_PHOTO_MARKER);
export const isInlineImage = (v: unknown): v is string => typeof v === 'string' && INLINE_IMAGE.test(v);

export function blobFromDataUrl(data: string): Blob {
  const m = String(data || '').match(/^data:([^;,]+);base64,(.*)$/s);
  if (!m) throw new Error('פורמט תמונה ישן אינו תקין');
  const binary = atob(m[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

export function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('קריאת נתוני תמונה לגיבוי נכשלה'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Blob storage for campaign images (IndexedDB, with a localStorage fallback for
 * restricted contexts). The campaign JSON only ever holds `hamonymmedia:` refs.
 */
@Injectable({ providedIn: 'root' })
export class MediaStoreService {
  private readonly context = inject(MediaContextService);
  readonly cache = new Map<string, StoredMedia>();
  private readonly displayUrls = new Map<string, string>();
  /** Emits after an image finished loading from storage, so the DOM can be patched. */
  readonly hydrated$ = new Subject<string>();
  private dbPromise?: Promise<IDBDatabase | null>;

  db(): Promise<IDBDatabase | null> {
    this.dbPromise ??= new Promise<IDBDatabase | null>(resolve => {
      if (!('indexedDB' in window)) { resolve(null); return; }
      let request: IDBOpenDBRequest;
      try { request = indexedDB.open(DB_NAME, 1); }
      catch (e) { console.warn('HAMONYM: IndexedDB not allowed', e); resolve(null); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { console.warn('HAMONYM: IndexedDB unavailable', request.error); resolve(null); };
      request.onblocked = () => resolve(null);
    });
    return this.dbPromise;
  }

  transaction<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        let result: T | undefined;
        if (request) {
          request.onsuccess = () => { result = request.result; };
          request.onerror = () => reject(request.error);
        }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error('שמירת התמונה נכשלה'));
        tx.onabort = () => reject(tx.error || new Error('שמירת התמונה בוטלה'));
      } catch (e) { reject(e); }
    });
  }

  /** Raw stored value by IndexedDB key (without prefix). */
  async getByKey(key: string): Promise<StoredMedia | null> {
    const db = await this.db();
    if (!db) return null;
    return (await this.transaction<StoredMedia>(db, 'readonly', st => st.get(key)).catch(() => undefined)) ?? null;
  }

  /** Resolves pre-v0.1.58 race-photo markers stored directly in the draft storage. */
  legacySrc(ref: string): string {
    if (!isOldRacePhoto(ref)) return ref || '';
    try { return this.context.storage.getItem(RACE_PHOTO_KEY_PREFIX + ref.slice(OLD_RACE_PHOTO_MARKER.length)) || ''; }
    catch { return ''; }
  }

  /**
   * Bumped whenever an image becomes available (loaded or saved). Templates that bind a resolved URL read it through
   * `resolve` / `display`, so they show the image once it is loaded (v4.62: replaces the DOM patcher).
   */
  readonly version = signal(0);
  private readonly requested = new Set<string>();
  /** The display URL of a ref ('' until loaded); a missing image is loaded once, then the bindings update. */
  resolve(ref: string): string {
    this.version();
    const url = this.src(ref);
    if (!url && isMediaRef(ref) && !this.requested.has(ref)) { this.requested.add(ref); void this.read(ref).finally(() => this.requested.delete(ref)); }
    return url;
  }
  /** A value bound to `src`: a media ref is resolved (kept as is until loaded, as before); other values unchanged. */
  display(value: unknown): string { const v = String(value ?? ''); return isMediaRef(v) ? (this.resolve(v) || v) : v; }

  async read(ref: string): Promise<StoredMedia | null> {
    if (!isMediaRef(ref)) return this.legacySrc(ref);
    const cached = this.cache.get(ref);
    if (cached) return cached;
    const key = ref.slice(MEDIA_PREFIX.length);
    let value: StoredMedia | null = await this.getByKey(key);
    // Early standalone versions stored a fallback while IndexedDB was blocked.
    if (!value) { try { value = this.context.storage.getItem(IMAGE_FALLBACK_KEY_PREFIX + key) || null; } catch { /* unavailable */ } }
    if (value) { this.cache.set(ref, value); this.hydrated$.next(ref); this.version.update(v => v + 1); }
    return value;
  }

  /** Synchronous display URL (object URL) for a ref; '' while the image is not loaded yet. */
  src(ref: string): string {
    if (!isMediaRef(ref)) return this.legacySrc(ref);
    const existing = this.displayUrls.get(ref);
    if (existing) return existing;
    const data = this.cache.get(ref);
    if (!data) return '';
    try {
      const url = URL.createObjectURL(data instanceof Blob ? data : blobFromDataUrl(data));
      this.displayUrls.set(ref, url);
      return url;
    } catch (error) { console.warn('HAMONYM: image URL unavailable', error); return ''; }
  }

  async save(data: StoredMedia): Promise<string> {
    const blob = data instanceof Blob ? data : (isInlineImage(data) ? blobFromDataUrl(data) : null);
    if (!blob || !ACCEPTED_STORED_TYPES.test(blob.type)) throw new Error('נתוני התמונה המעובדת אינם תקינים.');
    if (blob.size > MAX_PROCESSED_BYTES) throw new Error('תמונה מעובדת חורגת מגבול הגודל');
    const key = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    const ref = MEDIA_PREFIX + key;
    const db = await this.db();
    if (db) await this.transaction(db, 'readwrite', st => st.put(blob, key));
    else {
      // Only for restricted contexts lacking IndexedDB; never inline into the campaign state.
      try { this.context.storage.setItem(IMAGE_FALLBACK_KEY_PREFIX + key, await dataUrlFromBlob(blob)); }
      catch { throw new Error('לא ניתן לשמור תמונה: האחסון בדפדפן אינו זמין או מלא. מומלץ לפתוח את הקובץ ב-Chrome רגיל.'); }
    }
    this.cache.set(ref, blob);
    this.version.update(v => v + 1);
    return ref;
  }

  async discard(ref: string): Promise<void> {
    if (!isMediaRef(ref)) return;
    this.cache.delete(ref);
    const url = this.displayUrls.get(ref);
    if (url) { URL.revokeObjectURL(url); this.displayUrls.delete(ref); }
    const key = ref.slice(MEDIA_PREFIX.length);
    const db = await this.db();
    if (db) await this.transaction(db, 'readwrite', st => st.delete(key)).catch(() => undefined);
    else if (this.context.storage.persistent) { try { window.localStorage.removeItem(IMAGE_FALLBACK_KEY_PREFIX + key); } catch { /* unavailable */ } }
  }

  /**
   * Replace `hamonymmedia:` refs inside markup with display URLs before it is
   * assigned to the DOM, so the browser never requests an invalid URL.
   */
  safeMarkup<T>(value: T): T | string {
    if (typeof value !== 'string' || !value.includes(MEDIA_PREFIX)) return value;
    return value.replace(/hamonymmedia:[a-z0-9-]+/g, ref => this.src(ref) || TRANSPARENT_IMAGE);
  }
}
