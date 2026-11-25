const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

/** `src` and pending media reference of an item image (same rules as the old `mediaAttrs`). */
export interface ItemImage { src: string; ref: string | null; }
export function itemImage(value: unknown, resolve: (ref: string) => string): ItemImage {
  const raw = String(value || '');
  const pending = raw.startsWith('hamonymmedia:');
  const ready = pending ? (resolve(raw) || '') : raw;
  return { src: /^(https?:\/\/|blob:|data:image\/)/i.test(ready) ? ready : BLANK_GIF, ref: pending ? raw : null };
}
