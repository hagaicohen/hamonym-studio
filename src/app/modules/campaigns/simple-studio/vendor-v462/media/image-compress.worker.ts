/// <reference lib="webworker" />
import type { CompressRequest, CompressResponse } from './image-compress.types';

/**
 * Decodes and compresses an image off the main thread, so a large upload
 * cannot freeze the Studio. Dimensions were validated before this runs.
 */
const TARGET_BYTES = 245_000;
const MAX_BYTES = 340_000;

addEventListener('message', async ({ data }: MessageEvent<CompressRequest>) => {
  const { file, width, height, mime } = data;
  let bitmap: ImageBitmap | null = null;
  const reply = (message: CompressResponse) => postMessage(message);
  try {
    bitmap = await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
    // Some decoders ignore resize hints: never draw an unexpectedly large bitmap.
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: mime === 'image/webp' });
    if (!ctx) throw Error('לא ניתן ליצור Canvas');
    const draw = (w: number, h: number) => {
      if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(bitmap!, 0, 0, w, h);
    };
    draw(width, height);
    let w = width, h = height;
    let result: Blob | undefined;
    for (let i = 0; i < 8; i++) {
      result = await canvas.convertToBlob({ type: mime, quality: Math.max(.48, .78 - i * .045) });
      if (result.size <= TARGET_BYTES) break;
      w = Math.max(1, Math.round(w * .83));
      h = Math.max(1, Math.round(h * .83));
      canvas.width = w;
      canvas.height = h;
      draw(w, h);
    }
    if (!result || result.size > MAX_BYTES) throw Error('לא ניתן לכווץ תמונה זו. נסו קובץ אחר');
    reply({ ok: true, blob: result });
  } catch (err) {
    reply({ ok: false, error: String((err as Error)?.message || err) });
  } finally {
    bitmap?.close();
  }
});
