import type { BlockType, CampaignBlock, CampaignTheme, ContainerBlockData } from '../../services/campaign-studio-state.service';
import { CAMPAIGN_TEMPLATES, CampaignTemplate, TEMPLATE_PALETTES, TemplatePalette, buildTheme } from './campaign-templates';

// Non-destructive template switching helpers (see DECISIONS.md, 2026-11-04).
// Nothing here creates, deletes, hides or edits a block's content.

function children(block: CampaignBlock): string[] {
  return block.type === 'container' || block.type === 'tabs' || block.type === 'accordion'
    ? ((block.data as ContainerBlockData).childBlockIds ?? [])
    : [];
}

function topLevel(blocks: CampaignBlock[]): CampaignBlock[] {
  const nested = new Set(blocks.flatMap(children));
  return blocks.filter(b => !nested.has(b.id)).sort((a, b) => a.order - b.order);
}

// Types of a block and everything nested in it, in render order.
function typesOf(block: CampaignBlock, byId: Map<string, CampaignBlock>): BlockType[] {
  const kids = children(block).map(id => byId.get(id)).filter((b): b is CampaignBlock => !!b);
  return kids.length ? kids.flatMap(k => typesOf(k, byId)) : [block.type];
}

// Re-sequences only the `order` of top-level blocks by the template's section
// order. Hero and types the template does not use stay right after the block
// they currently follow; equal ranks keep their current relative order.
export function reorderForTemplate(blocks: CampaignBlock[], templateBlocks: CampaignBlock[]): CampaignBlock[] {
  const templateById = new Map(templateBlocks.map(b => [b.id, b]));
  const rank = new Map<BlockType, number>();
  topLevel(templateBlocks).flatMap(b => typesOf(b, templateById)).forEach(t => {
    if (t !== 'hero' && !rank.has(t)) rank.set(t, rank.size);
  });

  const byId = new Map(blocks.map(b => [b.id, b]));
  let previous = -1;
  const keyed = topLevel(blocks).map((block, index) => {
    const ranks = block.type === 'hero' ? [] : typesOf(block, byId).map(t => rank.get(t)).filter((r): r is number => r !== undefined);
    const key = ranks.length ? Math.min(...ranks) : previous;
    previous = key;
    return { block, key, index };
  });
  keyed.sort((a, b) => a.key - b.key || a.index - b.index);

  const newOrder = new Map(keyed.map((k, i) => [k.block.id, i]));
  return blocks.map(b => newOrder.has(b.id) && newOrder.get(b.id) !== b.order ? { ...b, order: newOrder.get(b.id)! } : b);
}

// A block tree reduced to what a person could have changed: ids and order
// numbers are dropped, nesting and sequence are kept.
function signature(blocks: CampaignBlock[]): string {
  const byId = new Map(blocks.map(b => [b.id, b]));
  const describe = (b: CampaignBlock): unknown => {
    const { id, order, data, ...rest } = b;
    const kids = children(b);
    const plain = kids.length ? { ...(data as object), childBlockIds: kids.map(k => byId.get(k)).map(k => k && describe(k)) } : data;
    return { ...rest, data: plain };
  };
  return JSON.stringify(topLevel(blocks).map(describe));
}

// True when the blocks are still exactly some template's starter blocks (or
// the given empty-draft blocks), i.e. nothing a person entered would be lost.
export function isUntouchedStarter(blocks: CampaignBlock[], initialBlocks: CampaignBlock[]): boolean {
  const current = signature(blocks);
  if (current === signature(initialBlocks)) return true;
  return CAMPAIGN_TEMPLATES.some(t => TEMPLATE_PALETTES.some(p => signature(t.createBlocks(p)) === current));
}

const same = (a: unknown, b: unknown) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

// Applies the new palette only to fields that still hold a template palette
// (or empty-draft) value; a field that matches none of them was customized
// and is kept.
export function mergePaletteTheme(current: CampaignTheme, next: TemplatePalette, initialTheme: CampaignTheme): CampaignTheme {
  const incoming = buildTheme(next);
  const keys = Object.keys(incoming);
  const candidates: Record<string, any>[] = [initialTheme, ...TEMPLATE_PALETTES.map(p => buildTheme(p))];
  const score = (c: Record<string, any>) => keys.filter(k => same((current as any)[k], c[k])).length;
  const origin = candidates.reduce((best, c) => (score(c) > score(best) ? c : best), candidates[0]);
  const merged: Record<string, any> = { ...current };
  if (score(origin) > 0) for (const k of keys) if (same((current as any)[k], origin[k])) merged[k] = incoming[k];
  return merged as CampaignTheme;
}

export type { CampaignTemplate, TemplatePalette };
