import type { StatsBlockData, StatItem } from '../services/campaign-studio-state.service';

export type StatsPreset = 'strip' | 'balanced' | 'compact' | 'featured' | 'sidebar' | 'topbar';
export interface StatsVisualLayout {
  preset: StatsPreset;
  version?: 2;
  columns?: number;
  rows?: number;
  gap?: number;
  align?: 'start' | 'center' | 'end';
  progress?: 'circle' | 'bar' | 'hidden';
  featuredSpan?: number;
}
export const STATS_PRESETS: { id: StatsPreset; columns: number }[] = [
  { id: 'strip', columns: 4 }, { id: 'balanced', columns: 2 },
  { id: 'topbar', columns: 3 }, { id: 'compact', columns: 3 }, { id: 'featured', columns: 3 }, { id: 'sidebar', columns: 1 },
];
const bounded = (n: number | undefined, fallback: number, min: number, max: number) => Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n!))) : fallback;
export function statsVisualLayout(value?: StatsVisualLayout): Required<StatsVisualLayout> {
  const preset = STATS_PRESETS.find(p => p.id === value?.preset) ?? STATS_PRESETS[1];
  const columns = bounded(value?.columns, preset.columns, 1, 4);
  return { version: 2, preset: preset.id, columns, rows: bounded(value?.rows, 1, 1, 8),
    gap: bounded(value?.gap, 16, 4, 40), align: ['start','center','end'].includes(value?.align ?? '') ? value!.align! : 'center',
    progress: ['circle','bar','hidden'].includes(value?.progress ?? '') ? value!.progress! : 'circle', featuredSpan: Math.min(columns, bounded(value?.featuredSpan, preset.id === 'featured' ? 2 : 1, 1, 2)) };
}
export function applyStatsPreset(data: StatsBlockData, preset: StatsPreset): StatsBlockData {
  // Arrangement only: identities, visibility and role styling remain untouched.
  let items = data.items.some(i => i.size) ? data.items.map(({size, ...item}) => item) : data.items;
  if(preset==='topbar' || preset==='featured'){const first=[...items].sort((a,b)=>a.order-b.order)[0];if(first)items=moveStatsItem(items,'percent',first.key);}
  return { ...data, items, visualLayout: { version: 2, preset, progress: preset === 'topbar' ? 'bar' : data.visualLayout?.progress ?? 'circle' } };
}
export function moveStatsItem(items: StatItem[], source: string, target: string, swap = false): StatItem[] {
  const sorted = [...items].sort((a,b) => a.order - b.order);
  const from = sorted.findIndex(i => i.key === source), to = sorted.findIndex(i => i.key === target);
  if (from < 0 || to < 0 || from === to) return items;
  if (swap) [sorted[from], sorted[to]] = [sorted[to], sorted[from]];
  else sorted.splice(to, 0, sorted.splice(from, 1)[0]);
  return sorted.map((item, order) => ({ ...item, order }));
}

export function statsVisualData(data: StatsBlockData): Required<StatsVisualLayout> {
  const layout = statsVisualLayout(data.visualLayout);
  return { ...layout, rows: Math.max(1, Math.ceil(data.items.filter(i => i.visible).length / layout.columns)) };
}

export type StatCardSize = 'normal' | 'wide' | 'featured';
export interface StatPlacement { key: string; column: number; row: number; columns: number; rows: number; }
export interface StatsLayoutInfo { requested: number; columns: number; rows: number; maxColumns: number; cells: StatPlacement[]; }
export function statCardSize(data: StatsBlockData, item: StatItem): StatCardSize {
  if (['normal','wide','featured'].includes(item.size ?? '')) return item.size!;
  return item.key === 'percent' && data.visualLayout?.preset === 'featured'
    ? data.visualLayout.version === 2 ? 'featured' : 'wide' : 'normal';
}
// Sequential placement: never fill earlier holes and change the visual reading order.
export function statsPlacement(data: StatsBlockData, width = Infinity): StatsLayoutInfo {
  const layout = statsVisualLayout(data.visualLayout);
  const maxColumns = width <= 240 ? 1 : width <= 480 ? 2 : 4;
  const columns = Math.min(layout.columns, maxColumns);
  const occupied = new Set<string>();
  let cursor = 0, lastRow = 1;
  const cells = data.items.filter(i => i.visible).sort((a,b) => a.order-b.order).map(item => {
    const size = statCardSize(data,item);
    const full = item.key === 'percent' && layout.progress === 'bar';
    const span = full ? columns : Math.min(columns, size === 'normal' ? 1 : data.visualLayout?.version !== 2 && item.key === 'percent' && layout.preset === 'featured' && !item.size ? (width<=480?1:layout.featuredSpan) : 2);
    const rows = full || maxColumns === 1 ? 1 : size === 'featured' ? 2 : 1;
    let column: number, row: number;
    for (;;) {
      column = cursor % columns + 1; row = Math.floor(cursor / columns) + 1;
      if (column + span - 1 <= columns && Array.from({length:rows},(_,r)=>Array.from({length:span},(_,c)=>!occupied.has((row+r)+':'+(column+c)))).flat().every(Boolean)) break;
      cursor++;
    }
    for(let r=0;r<rows;r++)for(let c=0;c<span;c++)occupied.add((row+r)+':'+(column+c));
    cursor += span; lastRow = Math.max(lastRow,row+rows-1);
    return {key:item.key,column,row,columns:span,rows};
  });
  return {requested:layout.columns,columns,rows:lastRow,maxColumns,cells};
}

export function statisticTextStyle(data:StatsBlockData,item:StatItem,role:'value'|'label') {
  const base=data.textStyles?.[role],local=item.textStyles?.[role];
  if(!local)return base;
  return {...base,...local,fontFamilyByLanguage:{...base?.fontFamilyByLanguage,...local.fontFamilyByLanguage},colorByLanguage:{...base?.colorByLanguage,...local.colorByLanguage}};
}
