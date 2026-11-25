/** Helpers for the few blocks whose children are written imperatively (shared with code outside Angular). */
export const escapeHtml = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s] as string));

const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

/**
 * `src` (and the pending media reference) of an image (old engine `mediaAttrs`). Internal media
 * IDs reference IndexedDB and are never navigable URLs: a placeholder is shown until the media
 * service resolves the reference.
 */
export function mediaAttrs(ref: unknown, resolve: (ref: string) => string): string {
  const value = String(ref || '');
  const pending = value.startsWith('hamonymmedia:');
  const ready = pending ? (resolve(value) || '') : value;
  const safeUrl = /^(https?:\/\/|blob:|data:image\/)/i.test(ready) ? ready : BLANK_GIF;
  return `src="${escapeHtml(safeUrl)}"${pending ? ` data-ham-media-ref="${escapeHtml(value)}"` : ''}`;
}
