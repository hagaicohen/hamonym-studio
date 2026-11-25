export interface ListingDesign {
 decoration?:'none'|'diamond'|'heart';
    template?: 'clean' | 'soft' | 'outlined';
    columns?: number;
    gap?: number;
    padding?: number;
    background?: string;
    borderColor?: string;
    borderWidth?: number;
    radius?: number;
    shadow?: boolean;
    align?: 'start' | 'center';
    sectionBackground?: string;
    compactControls?: boolean;
    showSearch?: boolean;
}
export interface JoinCtaDesign {
    label?: string;
    background?: string;
    color?: string;
    radius?: number;
    size?: 'sm' | 'md' | 'lg';
    align?: 'start' | 'center' | 'end';
    textStyle?: Partial<import('../../../shared/models/text-style.model').TextStyle>;
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export function listingCardStyle(d: ListingDesign | undefined): Record<string, string | number> { if (!d)
    return {}; const out: Record<string, string | number> = {}; if (d.template === 'soft')
    Object.assign(out, { background: '#f8f6ff', border: '1px solid transparent', 'border-radius': '14px', 'box-shadow': 'none' }); if (d.template === 'outlined')
    Object.assign(out, { background: 'transparent', border: '1px solid #cbd5e1', 'border-radius': '10px', 'box-shadow': 'none' }); if (d.template === 'clean')
    Object.assign(out, { background: 'white', border: '1px solid #e2e8f0', 'border-radius': '8px', 'box-shadow': 'none' }); for (const [key, value] of Object.entries(d)) {
    if (value === undefined)
        continue;
    if (key === 'background')
        out['background'] = String(value);
    if (key === 'borderColor')
        out['border-color'] = String(value);
    if (['padding', 'borderWidth', 'radius'].includes(key))
        out[key === 'radius' ? 'border-radius' : key === 'borderWidth' ? 'border-width' : key] = clamp(Number(value), 0, key === 'borderWidth' ? 8 : 48) + 'px';
    if (key === 'align')
        out['text-align'] = String(value);
    if (key === 'shadow')
        out['box-shadow'] = value ? '0 3px 12px #0f172a14' : 'none';
} return out; }
export function listingGridStyle(d: ListingDesign | undefined): Record<string, string> { const out: Record<string, string> = {}; if (d?.columns)
    out['grid-template-columns'] = 'repeat(auto-fit,minmax(min(100%,max(150px,calc((100% - ' + ((clamp(d.columns, 1, 4) - 1) * (d.gap ?? 12)) + 'px) / ' + clamp(d.columns, 1, 4) + '))),1fr))'; if (d?.gap !== undefined)
    out['gap'] = clamp(d.gap, 0, 48) + 'px'; return out; }
export function joinCtaStyle(d: JoinCtaDesign | undefined): Record<string, string> { if (!d)
    return {}; const o: Record<string, string> = {}; if (d.background)
    o['background'] = d.background; if (d.color)
    o['color'] = d.color; if (d.radius !== undefined)
    o['border-radius'] = clamp(d.radius, 0, 40) + 'px'; if (d.size)
    o['padding'] = d.size === 'sm' ? '6px 12px' : d.size === 'lg' ? '14px 24px' : '10px 18px'; if (d.align)
    o['align-self'] = d.align; return o; }
