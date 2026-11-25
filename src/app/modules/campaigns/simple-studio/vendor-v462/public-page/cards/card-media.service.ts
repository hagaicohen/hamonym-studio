import { Injectable, inject } from '@angular/core';
import { MediaStoreService } from '../../media/media-store.service';

/**
 * Image sources of the public cards.
 *
 * - `photo`: reward photos go through the core's shared photo store (`huRacePhotoSrc`: media
 *   refs, and the old `hamracephoto:` keys kept in `hamStorage`). The core registers it at start.
 * - `safe`: other card images are written as stored, and media refs (`hamonymmedia:`) are
 *   replaced with their display URL, exactly as `safeMarkup` did to the whole preview markup
 *   (and as the DOM patch did to markup written without it). The browser never requests a ref.
 */
@Injectable({ providedIn: 'root' })
export class CardMediaService {
  private readonly store = inject(MediaStoreService);
  private photoSrc: ((source: unknown) => string) | null = null;

  /** Called once by the core with its photo resolver. */
  attach(photoSrc: (source: unknown) => string): void { this.photoSrc = photoSrc; }

  photo(source: unknown): string {
    if (this.photoSrc) return this.photoSrc(source) || '';
    if (typeof source !== 'string' || !source) return '';
    return source.startsWith('hamonymmedia:') ? this.store.src(source) || '' : source;
  }

  safe(value: unknown): string { return String(this.store.safeMarkup(String(value ?? ''))); }
}
