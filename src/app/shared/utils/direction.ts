// Direction of the element's own context (bilingual roadmap §2.4). Geometry
// code (drag-and-drop, menus, resize) must ask the container it works in,
// never assume RTL and never read the document: interface chrome follows the
// interface language while campaign content keeps its own direction.
export type InlineDirection = 'rtl' | 'ltr';

export function dirOf(el: Element): InlineDirection {
  return getComputedStyle(el).direction === 'rtl' ? 'rtl' : 'ltr';
}
