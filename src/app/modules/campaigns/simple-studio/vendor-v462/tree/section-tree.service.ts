import { ChangeDetectorRef, Injectable, OnDestroy } from '@angular/core';
import { CAMPAIGN_SECTIONS } from '../core/campaign-defaults';
import { CampaignStateService } from '../core/campaign-state.service';

/** The blocks fixed at the top and the bottom of every template; the rest can be ordered per device. */
export const TREE_FIXED_TOP = ['header', 'hero', 'campaignInfo'];
export const TREE_FIXED_BOTTOM = ['footer'];
export const TREE_MOVABLE: string[] = CAMPAIGN_SECTIONS.map((x: string[]) => x[0]).filter((id: string) => !TREE_FIXED_TOP.includes(id) && !TREE_FIXED_BOTTOM.includes(id));
/** On a phone the campaign essentials follow the story in every template: they cannot be moved. */
const MOBILE_PINNED = ['title', 'stats', 'donationBox'];
const LOCKED_HINT = 'לא זמין בדף תרומה פשוט';
const VISIBILITY_LABEL: Record<string, string> = { both: 'מובייל ודסקטופ', mobile: 'מובייל בלבד', desktop: 'דסקטופ בלבד' };

/** What the tree needs from the editor (the core registers it once). */
export interface SectionTreeHost {
  select(id: string): void;
  /** The large editor for a block (`hamOpenLargeEditorFor`). */
  openEditor(id: string): void;
  /** The device's movable order (`orderFor`). */
  order(): string[];
  /** Moves a block before / after another in the device's order (`moveMainSection`). */
  move(id: string, target: string): void;
  /** A block that a simple donation page cannot design (`hamSimpleDesignLocked`). */
  locked(id: string): boolean;
}

export interface TreeRow {
  id: string; name: string; icon: string; sub: string; locked: boolean; movable: boolean; active: boolean;
  visible: boolean; first: boolean; last: boolean;
}
export interface TreeView { simple: boolean; themeActive: boolean; device: 'mobile' | 'desktop'; rows: TreeRow[] }

/**
 * The component tree (`#sectionList`, SectionTreeComponent) since v4.59: its view, the drag state and its actions.
 * Until v4.58 the core wrote the tree as HTML strings (`renderSections`) and handled its clicks and drag and drop.
 */
@Injectable({ providedIn: 'root' })
export class SectionTreeService implements OnDestroy {
  view: TreeView | null = null;
  host: SectionTreeHost | null = null;
  /** The row being dragged, and the row it is over (the `dragging` / `drop-target` classes). */
  dragId: string | null = null;
  dropId: string | null = null;
  private cdr: ChangeDetectorRef | null = null;

  constructor(private readonly state: CampaignStateService) {}
  attachHost(host: SectionTreeHost): void { this.host = host; }
  register(cdr: ChangeDetectorRef): void { this.cdr = cdr; }
  ngOnDestroy(): void { this.cdr = null; }
  private refresh(): void { this.cdr?.detectChanges(); }
  private get h(): SectionTreeHost { if (!this.host) throw new Error('The component tree has no editor host'); return this.host; }

  /** The tree for the selected block and the device (the old `renderSections` markup, as data). */
  render(selected: string, device: 'mobile' | 'desktop'): void {
    const doc = this.state.current as any, h = this.h;
    const simple = doc.management?.campaignKind === 'simple';
    document.body.classList.toggle('ham-simple-design-mode', simple);
    if (simple) { this.view = { simple, themeActive: false, device, rows: [] }; this.refresh(); return; }
    const movableOrder = h.order();
    const rows = [...TREE_FIXED_TOP, ...movableOrder, ...TREE_FIXED_BOTTOM].map(id => {
      const entry = CAMPAIGN_SECTIONS.find((x: string[]) => x[0] === id)!, locked = h.locked(id);
      const movable = TREE_MOVABLE.includes(id) && !(device === 'mobile' && MOBILE_PINNED.includes(id)), idx = movableOrder.indexOf(id);
      const visible = id === 'donationBox' ? !!doc.content.donate.boxEnabled : !!doc.visible[id];
      const sub = locked ? LOCKED_HINT : id === 'donationBox' && !doc.content.donate.boxEnabled ? 'מוסתר' : !doc.visible[id] ? 'מוסתר' : VISIBILITY_LABEL[doc.deviceVisibility?.[id] || 'both'];
      return { id, name: entry[1], icon: entry[2], sub, locked, movable, active: selected === id, visible, first: idx === 0, last: idx === TREE_MOVABLE.length - 1 };
    });
    this.view = { simple, themeActive: selected === 'theme', device, rows };
    this.refresh();
  }

  // ---- actions (formerly the core's #sectionList listeners) ----------------------------------------------------
  select(id: string): void { if (!this.h.locked(id)) this.h.select(id); }
  openEditor(e: Event, id: string): void { e.preventDefault(); e.stopPropagation(); if (this.h.locked(id)) return; this.h.openEditor(id); }
  move(e: Event, id: string, direction: 'up' | 'down'): void {
    e.stopPropagation(); if (this.h.locked(id)) return;
    const order = this.h.order(), idx = order.indexOf(id), to = idx + (direction === 'up' ? -1 : 1);
    if (to >= 0 && to < order.length) this.h.move(id, order[to]);
  }
  toggleVisibility(e: Event, id: string): void {
    e.stopPropagation(); if (this.h.locked(id)) return;
    const doc = this.state.current as any;
    this.state.change(() => { if (id === 'donationBox') doc.content.donate.boxEnabled = !doc.content.donate.boxEnabled; else doc.visible[id] = !doc.visible[id]; });
  }

  dragStart(e: DragEvent, row: TreeRow): void {
    if (!row.movable || row.locked) return;
    this.dragId = row.id;
    e.dataTransfer!.effectAllowed = 'move'; e.dataTransfer!.setData('text/plain', row.id);
    this.refresh();
  }
  dragOver(e: DragEvent, row: TreeRow): void {
    if (!row.movable || !this.dragId || row.locked || row.id === this.dragId) return;
    e.preventDefault(); e.dataTransfer!.dropEffect = 'move';
    if (this.dropId !== row.id) { this.dropId = row.id; this.refresh(); }
  }
  drop(e: DragEvent, row: TreeRow): void {
    const source = this.dragId;
    this.dragId = null; this.dropId = null;
    if (row.movable && source && !row.locked) { e.preventDefault(); this.h.move(source, row.id); }
  }
  dragEnd(): void { this.dragId = null; this.dropId = null; this.refresh(); }
}
