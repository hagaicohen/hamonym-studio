/** Messages exchanged with image-compress.worker.ts (no DOM types: shared with the worker). */
export type OutputMime = 'image/jpeg' | 'image/webp';
export interface CompressRequest { file: Blob; width: number; height: number; mime: OutputMime; }
export type CompressResponse = { ok: true; blob: Blob } | { ok: false; error: string };
