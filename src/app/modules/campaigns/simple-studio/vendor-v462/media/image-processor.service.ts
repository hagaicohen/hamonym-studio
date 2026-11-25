import { Injectable, inject } from '@angular/core';
import { CompressResponse, ImageDimensions, MAX_PROCESSED_BYTES, MediaKind, OutputMime, errorMessage } from './media.types';
import { MediaDiagnosticsService } from './media-diagnostics.service';

const ACCEPTED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const MAX_UPLOAD_BYTES = 12_000_000;
const MAX_VECTOR_OR_GIF_BYTES = 1_000_000;
const MAX_SIDE = 12_000;
const MAX_PIXELS = 24_000_000;
const MAX_FALLBACK_PIXELS = 12_000_000;
const WORKER_TIMEOUT_MS = 18_000;
const JPEG_SOF_MARKERS = new Set([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]);

/** Longest edge, per usage, after compression. */
const MAX_EDGE: Record<MediaKind, number> = { hero: 1450, poster: 1450, story: 1150, logo: 520, icon: 520, avatar: 460, card: 900 };

/** Reads width/height from PNG, JPEG or WebP headers without decoding the image. */
export function readImageDimensions(b: Uint8Array): ImageDimensions | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ascii = (at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));
  if (b.length >= 24 && b[0] === 137 && ascii(1, 3) === 'PNG') return { width: dv.getUint32(16, false), height: dv.getUint32(20, false) };
  if (b.length >= 4 && b[0] === 255 && b[1] === 216) {
    let at = 2;
    while (at + 9 < b.length) {
      if (b[at] !== 255) { at++; continue; }
      const marker = b[at + 1];
      at += 2;
      if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (marker === 217 || marker === 218) break;
      if (at + 2 > b.length) break;
      const len = dv.getUint16(at, false);
      if (len < 2 || at + len > b.length) break;
      if (JPEG_SOF_MARKERS.has(marker)) return { width: dv.getUint16(at + 5, false), height: dv.getUint16(at + 3, false) };
      at += len;
    }
  }
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const kind = ascii(12, 4);
    if (kind === 'VP8X') return { width: 1 + b[24] + (b[25] << 8) + (b[26] << 16), height: 1 + b[27] + (b[28] << 8) + (b[29] << 16) };
    if (kind === 'VP8 ') return { width: dv.getUint16(26, true) & 16383, height: dv.getUint16(28, true) & 16383 };
    if (kind === 'VP8L') { const n = (b[21] | b[22] << 8 | b[23] << 16 | b[24] << 24) >>> 0; return { width: 1 + (n & 16383), height: 1 + (n >>> 14 & 16383) }; }
  }
  return null;
}

/** Validates and compresses uploaded images (worker first, main-thread canvas fallback). */
@Injectable({ providedIn: 'root' })
export class ImageProcessorService {
  private readonly diagnostics = inject(MediaDiagnosticsService);

  async process(file: Blob, kind: MediaKind): Promise<Blob> {
    if (!file || !ACCEPTED_UPLOAD_TYPES.includes(file.type)) throw new Error('בחרו קובץ תמונה JPG, PNG, WebP, GIF או SVG');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('הקובץ גדול מ-12MB; מומלץ להקטין אותו לפני העלאה');
    this.diagnostics.record('validate', file);

    let dimensions: ImageDimensions | null = null;
    if (file.type !== 'image/svg+xml' && file.type !== 'image/gif') {
      const bytes = new Uint8Array(await file.slice(0, Math.min(262144, file.size)).arrayBuffer());
      dimensions = readImageDimensions(bytes);
      if (!dimensions) throw new Error('לא נמצאו מידות תקינות בקובץ. נסו JPEG, PNG או WebP');
      const { width, height } = dimensions;
      if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS)
        throw new Error('התמונה גדולה מדי לעיבוד בטוח (עד 24 מגה-פיקסל). הקטינו אותה לפני העלאה');
    } else if (file.size > MAX_VECTOR_OR_GIF_BYTES) {
      throw new Error('עבור GIF או SVG יש לבחור תמונה עד 1MB');
    }

    const limit = MAX_EDGE[kind] ?? MAX_EDGE.card;
    const factor = dimensions ? Math.min(1, limit / Math.max(dimensions.width, dimensions.height)) : 1;
    const width = Math.max(1, Math.round((dimensions?.width || limit) * factor));
    const height = Math.max(1, Math.round((dimensions?.height || limit) * factor));
    const mime: OutputMime = kind === 'logo' || kind === 'icon' ? 'image/webp' : 'image/jpeg';
    const pixels = (dimensions?.width || 0) * (dimensions?.height || 0);
    this.diagnostics.record('decode', file, { width, height });

    let result: Blob | null;
    try {
      result = await this.compressInWorker(file, width, height, mime);
    } catch (err) {
      this.diagnostics.record('worker-error', file, { message: errorMessage(err) });
      if (pixels > MAX_FALLBACK_PIXELS) throw new Error('עיבוד תמונה גדולה אינו זמין בדפדפן הזה. נסו תמונה קטנה יותר');
      result = null;
    }
    if (!result) {
      if (pixels > MAX_FALLBACK_PIXELS) throw new Error('עיבוד תמונה גדולה אינו נתמך בדפדפן הזה. הקטינו ל-12 מגה-פיקסל');
      result = await this.compressOnMainThread(file, width, height, mime);
    }
    this.diagnostics.record('compressed', file, { resultBytes: result.size });
    return result;
  }

  /** Returns null when workers/OffscreenCanvas are unavailable, so the caller falls back. */
  private async compressInWorker(file: Blob, width: number, height: number, mime: OutputMime): Promise<Blob | null> {
    if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') return null;
    let worker: Worker | undefined;
    try {
      worker = new Worker(new URL('./image-compress.worker', import.meta.url), { type: 'module' });
      const active = worker;
      return await new Promise<Blob>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('עיבוד התמונה ארך זמן רב מדי. נסו קובץ קטן יותר.')), WORKER_TIMEOUT_MS);
        const finish = (err: Error | null, blob?: Blob) => { clearTimeout(timeout); if (err) reject(err); else resolve(blob!); };
        active.onmessage = ({ data }: MessageEvent<CompressResponse>) =>
          data?.ok ? finish(null, data.blob) : finish(new Error((data as { error?: string })?.error || 'כיווץ תמונה נכשל'));
        active.onerror = () => finish(new Error('עיבוד התמונה בדפדפן נכשל'));
        active.postMessage({ file, width, height, mime });
      });
    } finally {
      worker?.terminate();
    }
  }

  private async compressOnMainThread(file: Blob, width: number, height: number, mime: OutputMime): Promise<Blob> {
    const url = URL.createObjectURL(file);
    let bitmap: ImageBitmap | null = null;
    let image: HTMLImageElement | null = null;
    try {
      if (typeof createImageBitmap === 'function') {
        bitmap = await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
      } else {
        image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('לא ניתן לקרוא תמונה זו'));
          el.src = url;
        });
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: mime === 'image/webp' });
      if (!ctx) throw new Error('עיבוד התמונה אינו זמין');
      if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
      ctx.drawImage((bitmap || image)!, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('כיווץ התמונה נכשל')), mime, .70));
      canvas.width = canvas.height = 0;
      if (blob.size > MAX_PROCESSED_BYTES) throw new Error('התמונה גדולה מדי אחרי עיבוד');
      return blob;
    } finally {
      bitmap?.close();
      if (image) image.src = '';
      URL.revokeObjectURL(url);
    }
  }
}
