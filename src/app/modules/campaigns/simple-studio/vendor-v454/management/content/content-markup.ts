import { Json } from '../management-model.service';
import { escapeHtml as safe } from '../fields/markup';

/**
 * Markup of the blocks that are rewritten in place while an item is edited (old engine string
 * builders), and icons shared by the content templates. (Since v4.44 the public cards shown in
 * the manager are components: public-page/cards.)
 */

/** Live sponsor preview box at its first render (the item handler rewrites it while typing). */
export function sponsorLiveMarkup(item: Json): string {
  return (item['logo'] ? `<img data-ham-sponsor-media="${safe(item['logo'])}" src="${safe(item['logo'])}" alt="">` : '<span aria-hidden="true">♧</span>') + `<strong>${safe(item['name'] || 'שם החסות')}</strong>`;
}

/** View-mode icons shared by the collections (identical in the campaign and the manager). */
export const VIEW_ICON: Record<string, string> = {
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h1M3 12h1M3 18h1" stroke-width="3"/></svg>',
  carousel: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M3 7v10M21 7v10"/></svg>'
};
export const VIEW_LABEL: Record<string, string> = { grid: 'גריד', list: 'שורות', carousel: 'קרוסלה' };
export const SORT_ICON = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16m0-16-3 3m3-3 3 3M17 20V4m0 16-3-3m3 3 3-3"/></svg>';
export const SEARCH_ICON = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 5 5"/></svg>';
export const TRASH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
