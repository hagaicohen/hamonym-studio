import type { CampaignBlock, CampaignDraft, CampaignLayout, ContainerBlockData } from '../services/campaign-studio-state.service';
import type { ContentLang } from './content-i18n';

// Which side the campaign's sidebar sits on, per content language (2026-11-09).
// The saved structure keeps its Hebrew (RTL) side; English mirrors it unless the
// manager picked a side for that language (layout.sidebarSideByLanguage).
export type SidebarSide = 'left' | 'right';

export interface SidebarLayout {
  // 'rail': layoutMode sidebar-right/left (.page-layout-sidebar).
  // 'row': a top-level side-by-side container with the donation area in one column.
  kind: 'rail' | 'row';
  containerId?: string;
  // The side as the structure renders it in Hebrew.
  savedSide: SidebarSide;
}

const SIDEBAR_CONTENT = new Set(['donation-widget', 'stats']);
const mirror = (side: SidebarSide): SidebarSide => (side === 'left' ? 'right' : 'left');

export function sidebarLayoutOf(draft: CampaignDraft): SidebarLayout | null {
  const mode = draft.layout?.layoutMode;
  if (mode === 'sidebar-right' || mode === 'sidebar-left') return { kind: 'rail', savedSide: mode === 'sidebar-right' ? 'right' : 'left' };
  const blocks = draft.blocks ?? [];
  const byId = new Map(blocks.map(b => [b.id, b]));
  const nested = new Set(blocks.flatMap(b => b.type === 'container' ? (b.data as ContainerBlockData).childBlockIds ?? [] : []));
  const holdsSidebar = (b: CampaignBlock | undefined, depth = 0): boolean => !!b && depth < 6 && (SIDEBAR_CONTENT.has(b.type)
    || (b.type === 'container' && ((b.data as ContainerBlockData).childBlockIds ?? []).some(id => holdsSidebar(byId.get(id), depth + 1))));
  const rows = blocks
    .filter(b => b.type === 'container' && b.visible && !nested.has(b.id) && (b.data as ContainerBlockData).direction === 'row')
    .sort((a, b) => a.order - b.order);
  for (const row of rows) {
    const children = ((row.data as ContainerBlockData).childBlockIds ?? []).map(id => byId.get(id)).filter((b): b is CampaignBlock => !!b && b.visible);
    if (children.length !== 2) continue;
    const sidebar = children.findIndex(c => holdsSidebar(c));
    if (sidebar < 0 || holdsSidebar(children[1 - sidebar])) continue;
    // In RTL the first column is on the right.
    return { kind: 'row', containerId: row.id, savedSide: sidebar === 0 ? 'right' : 'left' };
  }
  return null;
}

export function explicitSidebarSide(draft: CampaignDraft, lang: ContentLang): SidebarSide | null {
  return draft.layout?.sidebarSideByLanguage?.[lang] ?? null;
}

export function sidebarSideFor(draft: CampaignDraft, lang: ContentLang, layout = sidebarLayoutOf(draft)): SidebarSide | null {
  if (!layout) return null;
  return explicitSidebarSide(draft, lang) ?? (lang === 'en' ? mirror(layout.savedSide) : layout.savedSide);
}

// A 'row' sidebar follows the content direction by itself (the first column is
// on the right in Hebrew, on the left in English); it is reversed only when the
// chosen side differs from that.
export function sidebarRowReversed(draft: CampaignDraft, lang: ContentLang, containerId: string): boolean {
  const layout = sidebarLayoutOf(draft);
  if (layout?.kind !== 'row' || layout.containerId !== containerId) return false;
  const natural = lang === 'en' ? mirror(layout.savedSide) : layout.savedSide;
  return sidebarSideFor(draft, lang, layout) !== natural;
}

export function withSidebarSide(layout: CampaignLayout, lang: ContentLang, side: SidebarSide | null): CampaignLayout {
  const prefs = { ...(layout.sidebarSideByLanguage ?? {}) };
  if (side) prefs[lang] = side; else delete prefs[lang];
  const next: CampaignLayout = { ...layout, sidebarSideByLanguage: prefs };
  if (!Object.keys(prefs).length) delete next.sidebarSideByLanguage;
  return next;
}
