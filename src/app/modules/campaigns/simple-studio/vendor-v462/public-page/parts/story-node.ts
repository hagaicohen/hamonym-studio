/**
 * A Story Builder node's presentation on a device (v4.54): shared by the public story (StoryPartComponent) and the
 * Story Builder's canvas (StoryCanvasComponent). The old core's `sbStyle`, `sbInline` and the per-type parts of
 * `sbRenderNode`.
 */
export type StoryNode = Record<string, any>;
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const storyFit = (n: StoryNode): string => n['imageFit'] === 'contain' ? 'contain' : n['imageFit'] === 'fill' ? 'fill' : 'cover';
export const nodeStyle = (n: StoryNode, device: string): StoryNode => n['style']?.[device] || {};
export const storyVpos = (n: StoryNode, device: string): number => clamp(Number(nodeStyle(n, device)['imageVerticalPosition'] ?? 50), 0, 100);
export const storySpacer = (n: StoryNode, device: string): number => Math.max(0, Number(nodeStyle(n, device)['height'] ?? n['height'] ?? 24));
export function storyDivider(n: StoryNode, device: string): string {
  const x = nodeStyle(n, device);
  return `width:${clamp(Number(x['dividerWidth'] ?? 100), 5, 100)}%;max-width:100%;margin-inline:auto;box-sizing:border-box;border-top-width:${clamp(Number(x['dividerThickness'] ?? 1), 1, 20)}px`;
}
export const storyEqual = (n: StoryNode, device: string): boolean => nodeStyle(n, device)['equalHeight'] === 'yes' && (device !== 'mobile' || (n['mobileLayout'] || 'stack') === 'columns');
export function storyColumns(n: StoryNode, device: string): string | null {
  if (device !== 'mobile') return null;
  const cols = (n['mobileLayout'] || 'stack') === 'columns' ? clamp(Number(n['layout']) || 2, 1, 3) : 1;
  return `grid-template-columns:repeat(${cols},minmax(0,1fr))!important`;
}
/** Old `sbInline`: the block's style on the device (unescaped: it is bound as an attribute). */
export function storyInline(n: StoryNode, device: string): string {
  const x = nodeStyle(n, device), type = n['type'];
  let css = `margin:${clamp(+x['margin'] || 0, -100, 160)}px;padding:${Math.max(0, +x['padding'] || 0)}px;`
    + (x['background'] ? 'background:' + x['background'] + ';' : '') + (x['color'] ? 'color:' + x['color'] + ';' : '')
    + (x['fontSize'] ? 'font-size:' + Number(x['fontSize']) + 'px;' : '') + (x['lineHeight'] ? '--sb-line-height:' + Number(x['lineHeight']) + ';' : '')
    + (x['align'] ? 'text-align:' + x['align'] + ';' : '');
  if (type === 'image') css += `--sb-image-vpos:${clamp(Number(x['imageVerticalPosition'] ?? 50), 0, 100)};`;
  if (type === 'container') css += `border:${clamp(Number(x['borderWidth']) || 0, 0, 20)}px solid ${/^#[0-9a-fA-F]{6}$/.test(x['borderColor'] || '') ? x['borderColor'] : '#d4ded9'};border-radius:${clamp(Number(x['borderRadius']) || 0, 0, 80)}px;`;
  return css;
}
export const storyRich = (n: StoryNode): boolean => typeof n['value'] === 'string' && n['value'].startsWith('<');
