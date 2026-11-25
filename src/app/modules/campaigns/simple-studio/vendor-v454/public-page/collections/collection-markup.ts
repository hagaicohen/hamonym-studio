/**
 * `HamonymCollection.viewButtons` / `HamonymCollection.header` (moved from the campaign core, v4.45).
 *
 * The public collection blocks are components and render their header with
 * `CollectionHeaderComponent`; these two globals stay as a contract for code outside the app that
 * builds a collection header as markup. They return exactly the markup they returned before
 * (`cards_diff.py` compares them between builds).
 */
import { escapeHtml } from './collection-style';

const ICONS: Record<string, string> = {
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h2M3 12h2M3 18h2"/></svg>',
  carousel: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M2 7v10M22 7v10"/></svg>'
};
const LABELS: Record<string, string> = { grid: 'גריד', list: 'שורות', carousel: 'קרוסלה' };

/** The three view buttons; `attr` is the attribute that carries the view (`data-hc-view`). */
export function viewButtonsMarkup(selected = 'grid', attr = 'data-hc-view'): string {
  return ['grid', 'list', 'carousel'].map(key => `<button type="button" ${attr}="${key}" aria-label="${LABELS[key]}" title="${LABELS[key]}" aria-pressed="${selected === key}" class="hc-view-btn${selected === key ? ' is-active' : ''}">${ICONS[key]}</button>`).join('');
}

export interface HeaderOptions { title?: string; views?: string; viewAttr?: string; filters?: string; subtitle?: string; }

/** Heading, view buttons, the filters (markup) and a subtitle. */
export function headerMarkup({ title = 'תורמים', views = 'grid', viewAttr = 'data-hc-view', filters = '', subtitle = '' }: HeaderOptions = {}): string {
  return `<div class="hc-header"><div class="hc-header-line"><strong class="hc-heading">${escapeHtml(title)}</strong><div class="hc-view-buttons" role="group" aria-label="בחירת תצוגה">${viewButtonsMarkup(views, viewAttr)}</div></div>${filters ? `<div class="hc-filter-line">${filters}</div>` : ''}${subtitle ? `<small class="hc-subtitle">${escapeHtml(subtitle)}</small>` : ''}</div>`;
}
