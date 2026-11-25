import { ChangeDetectorRef, Injectable, OnDestroy, Renderer2, RendererFactory2, inject } from '@angular/core';
import type { StoryNode } from '../public-page/parts/story-node';
import { CampaignStateService } from '../core/campaign-state.service';
import { StorySlidesService } from '../public-page/parts/story-slides.service';

/** What the Story Builder's edits need from the editor (the core registers it once). */
export interface StoryBuilderHost {
  /** A new node of a type (ids and defaults: the core's `sbNew`, shared with the wizard). */
  create(type: string): any;
  /** A new node id (`sbId`). */
  newId(): string;
  /** A node by id in the live story: the node, its list, its index and its parent container. */
  find(id: string | null): { n: any; items: any[]; i: number; parent: any } | null;
  /** A node's inline style on a device (`sbInline`). */
  inline(node: any, device: string): string;
  /** The one-time wizard story migration (`sbMigrateLegacyWizardLead`). */
  migrateLead(): void;
  select(id: string): void;
  render(): void;
  renderPreview(): void;
  renderInspector(): void;
  toast(message: string): void;
}
/* eslint-disable @typescript-eslint/no-explicit-any */

/** What the core passes on each `sbRender`: a copy of the blocks, the selection and the device. */
export interface StoryBuilderView { nodes: StoryNode[]; selected: string | null; device: 'mobile' | 'desktop'; font: string }
export const SB_TYPES: Record<string, [string, string]> = { text: ['טקסט', 'T'], image: ['תמונה', '▧'], gallery: ['גלריה', '▦'], video: ['וידאו', '▷'], container: ['קונטיינר', '▤'], divider: ['קו מפריד', '—'], spacer: ['מרווח', '↕'] };

/**
 * The Story Builder editor (`#storyBuilder`) since v4.54: its view and its state between two renders.
 *
 * Until v4.53 the core wrote the canvas, the tree and the properties panel as markup (`sbRender`, `sbProps`), and its
 * handlers changed them (a node's style while a slider moves, the outputs, the drop marks of drag and drop, the
 * "add inside" picker, the open overlay, the device buttons). Now the core passes a copy of the blocks to `render`
 * and reports those changes here; StoryBuilderComponent shows them. As before, a render resets what new elements
 * started without: the controls' values, the picker, the marks, a node's live style, the galleries' first image.
 * The rich text of a text node is the manager's content: it is written as HTML on each render (as the markup did),
 * and while it is edited (contenteditable, `execCommand`) the browser changes it, as before.
 */
@Injectable({ providedIn: 'root' })
export class StoryBuilderService implements OnDestroy {
  readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private ref: ChangeDetectorRef | null = null;

  view: StoryBuilderView | null = null;
  revision = 0;
  isOpen = false;
  /** The undo / redo availability (CampaignStateService); null until it is first set. */
  canUndo: boolean | null = null;
  canRedo: boolean | null = null;
  /** The "add inside the container" picker: filled once opened, hidden or shown (reset by a render). */
  picker = { filled: false, hidden: true };
  private styles = new Map<string, string>();
  private seconds = new Map<string, number>();
  private texts = new Map<Element, string>();
  private marks = new Map<Element, Set<string>>();
  readonly values = new Map<HTMLElement, string>();

  /** StoryBuilderComponent (in AppComponent's template) registers its view. */
  register(view: ChangeDetectorRef): void { this.ref = view; }
  /** v4.56: the Studio session ends (AppComponent destroyed). */
  ngOnDestroy(): void { this.ref = null; }
  refresh(): void { this.ref?.detectChanges(); }

  render(view: StoryBuilderView): void {
    this.view = view;
    this.revision++;
    this.picker = { filled: false, hidden: true };
    this.styles.clear(); this.seconds.clear(); this.texts.clear(); this.marks.clear();
    this.refresh();
    for (const [el, value] of this.values) if ((el as HTMLInputElement).value !== value) this.renderer.setProperty(el, 'value', value);
  }
  open(on: boolean): void { this.isOpen = on; this.refresh(); }
  availability(canUndo: boolean, canRedo: boolean): void { this.canUndo = canUndo; this.canRedo = canRedo; this.refresh(); }

  /** A node's style while a control moves (`node.style.cssText = sbInline(…)`). */
  restyle(id: string, css: string): void { this.styles.set(id, css); this.refresh(); }
  style(id: string, css: string): string { return this.styles.get(id) ?? css; }
  /** A gallery's seconds (`data-sb-seconds`) while the slider moves. */
  setSeconds(id: string, value: number): void { this.seconds.set(id, value); this.refresh(); }
  secondsOf(id: string, fallback: number): number { return this.seconds.get(id) ?? fallback; }
  text(el: Element | null | undefined, value: string): void { if (!el) return; this.texts.set(el, value); this.refresh(); }
  t(el: Element, fallback: unknown): string { return this.texts.has(el) ? this.texts.get(el)! : String(fallback ?? ''); }
  togglePicker(): boolean { this.picker = { filled: this.picker.filled || this.picker.hidden, hidden: !this.picker.hidden }; this.refresh(); return !this.picker.hidden; }

  /** Drag and drop marks (`sb-dragging`, `sb-drop-before|after|inside`) on a row, a node, the palette or an area. */
  mark(el: Element | null | undefined, cls: string): void {
    if (!el) return;
    const set = this.marks.get(el) || new Set<string>(); set.add(cls); this.marks.set(el, set); this.refresh();
  }
  clearMarks(): void { if (!this.marks.size) return; this.marks.clear(); this.refresh(); }
  has(el: Element, cls: string): boolean { return !!this.marks.get(el)?.has(cls); }

  // ---- editing (formerly the core engine's #storyBuilder listeners) ----------------------------------------------
  private readonly state = inject(CampaignStateService);
  private readonly slides = inject(StorySlidesService);
  host: StoryBuilderHost | null = null;
  /** The selected node and the editing device (UI only). */
  selectedId: string | null = null;
  editDevice: 'mobile' | 'desktop' = 'mobile';
  private dragging: { kind: 'new'; type: string } | { kind: 'existing'; id: string } | null = null;
  private transaction: { el: EventTarget; before: string } | null = null;
  attachHost(host: StoryBuilderHost): void { this.host = host; }
  private get h(): StoryBuilderHost { if (!this.host) throw new Error('The Story Builder has no editor host'); return this.host; }
  private nodes(): any[] { return this.state.current.content.story.blocks; }
  private find(id: string | null) { return this.h.find(id); }
  private persist(): void { this.state.persist(); }
  private props(): HTMLElement | null { return document.getElementById('sbProps'); }
  private canvas(): HTMLElement | null { return document.getElementById('sbCanvas'); }

  /** `sbRender`: a copy of the story, the selection and the device; then the canvas's slideshows. */
  redraw(): void {
    this.render({ nodes: structuredClone(this.nodes()), selected: this.selectedId, device: this.editDevice, font: this.state.current.theme.font || 'Heebo' });
    this.slides.init();
  }
  /** `sbUpdate`: one undo step, the change, save and both renders. */
  private update(fn: () => void): void { this.state.snapshot(); fn(); this.persist(); this.redraw(); this.h.renderPreview(); }
  openEditor(): void { this.h.migrateLead(); this.h.select('story'); this.open(true); this.selectedId = this.nodes()[0]?.id || null; this.redraw(); }
  close(): void { this.open(false); this.h.render(); }
  setDevice(device: 'mobile' | 'desktop'): void { this.editDevice = device; this.redraw(); }
  restore(direction: 'undo' | 'redo'): void {
    if (!this.state.restore(direction)) return;
    if (this.selectedId && !this.find(this.selectedId)) this.selectedId = null;
    this.persist(); this.h.render(); this.redraw(); this.state.syncUndo();
  }
  clearStory(e: Event): void {
    e.preventDefault(); e.stopPropagation();
    // Clear the live state (not a stale reference), including every nested child.
    const story = this.state.current.content.story;
    if (!Array.isArray(story.blocks)) story.blocks = [];
    if (story.blocks.length === 0 && !story.heading) { this.h.toast('הסיפור כבר ריק'); return; }
    this.state.snapshot();
    this.state.current.content.story = { ...story, blocks: [], heading: '' };
    this.selectedId = null;
    this.persist(); this.redraw(); this.h.renderPreview(); this.h.renderInspector();
    this.h.toast('כל הסיפור נמחק. אפשר לשחזר באמצעות ביטול פעולה');
  }
  /** Ctrl+Z / Ctrl+Y outside the text fields. */
  keydown(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase(); if (key !== 'z' && key !== 'y') return;
    if ((e.target as Element).closest('[contenteditable],input,textarea')) return;
    e.preventDefault(); this.restore(key === 'y' || e.shiftKey ? 'redo' : 'undo');
  }

  /** One undo step for a continuous edit (a slider, a field, the rich text): from focus in to focus out. */
  focusIn(e: FocusEvent, selector: string): void { const t = e.target as Element; if (t.matches(selector)) this.transaction = { el: t, before: JSON.stringify(this.state.current) }; }
  focusOut(e: FocusEvent): void {
    if (this.transaction?.el !== e.target) return;
    if (this.transaction.before !== JSON.stringify(this.state.current)) this.state.recordStoryEdit(this.transaction.before);
    this.transaction = null;
  }

  paletteClick(e: Event): void {
    const b = (e.target as Element).closest<HTMLElement>('[data-sb-add]'); if (!b) return;
    const n = this.h.create(b.dataset['sbAdd']!);
    this.update(() => { const f = this.find(this.selectedId); if (f?.n.type === 'container') { f.n.children ??= []; f.n.children.push(n); } else if (f) { f.items.splice(f.i + 1, 0, n); } else this.nodes().push(n); this.selectedId = n.id; });
  }
  treeClick(e: Event): void {
    const t = e.target as Element;
    const del = t.closest<HTMLElement>('[data-sb-tree-delete]');
    if (del) { const f = this.find(del.dataset['sbTreeDelete']!); if (!f) return; this.update(() => { f.items.splice(f.i, 1); if (this.selectedId === f.n.id || !this.find(this.selectedId)) this.selectedId = null; }); return; }
    const nest = t.closest<HTMLElement>('[data-sb-nest]');
    if (nest) {
      const f = this.find(nest.dataset['sbNest']!); if (!f || f.i === 0) return;
      const prev = f.items[f.i - 1]; if (prev.type !== 'container') { this.h.toast('כדי להכניס רכיב, מקמו אותו מתחת לקונטיינר'); return; }
      this.update(() => { f.items.splice(f.i, 1); prev.children ??= []; prev.children.push(f.n); this.selectedId = f.n.id; }); return;
    }
    const out = t.closest<HTMLElement>('[data-sb-out]');
    if (out) {
      const f = this.find(out.dataset['sbOut']!); if (!f || !f.parent) { this.h.toast('הרכיב כבר ברמה הראשית'); return; }
      const parent = this.find(f.parent.id); if (!parent) return;
      this.update(() => { f.items.splice(f.i, 1); parent.items.splice(parent.i + 1, 0, f.n); this.selectedId = f.n.id; }); return;
    }
    const move = t.closest<HTMLElement>('[data-sb-move]');
    if (move) { const f = this.find(move.dataset['id']!)!, next = f.i + (move.dataset['sbMove'] === 'up' ? -1 : 1); if (next < 0 || next >= f.items.length) return; this.update(() => { [f.items[f.i], f.items[next]] = [f.items[next], f.items[f.i]]; }); return; }
    const pick = t.closest<HTMLElement>('[data-sb-pick]'); if (pick) { this.selectedId = pick.dataset['sbPick']!; this.redraw(); }
  }
  canvasClick(e: Event): void {
    const el = (e.target as Element).closest<HTMLElement>('[data-sb-node]'); if (el && this.selectedId !== el.dataset['sbNode']) { this.selectedId = el.dataset['sbNode']!; this.redraw(); }
    // A gallery's arrows step its slideshow.
    const b = (e.target as Element).closest<HTMLElement>('[data-sb-slide]');
    if (b) { e.preventDefault(); e.stopPropagation(); const g = b.closest<HTMLElement>('.sb-gallery'); if (g) this.slides.step(g, b.dataset['sbSlide'] === 'prev' ? -1 : 1); }
  }
  /** The rich text of a text node, as the browser edits it. */
  canvasInput(e: Event): void { const el = (e.target as Element).closest<HTMLElement>('[data-sb-edit]'); if (!el) return; const f = this.find(el.dataset['sbEdit']!); if (!f) return; f.n.value = el.innerHTML; this.persist(); this.h.renderPreview(); }

  propsInput(e: Event): void {
    const el = e.target as any, props = this.props();
    if (el.dataset.sbPropertyRange) {
      const f = this.find(this.selectedId); if (!f) return;
      f.n[el.dataset.sbPropertyRange] = Number(el.value); this.text(props?.querySelector('[data-sb-output="' + el.dataset.sbPropertyRange + '"]'), el.value + ' שניות'); this.persist();
      if (el.dataset.sbPropertyRange === 'slideSeconds') { const id = f.n.id, seconds = Number(el.value); this.setSeconds(id, seconds); this.slides.setSeconds(id, seconds); }
      this.h.renderPreview(); this.slides.init(); return;
    }
    if (el.dataset.sbStyle) {
      const id = this.selectedId, key = el.dataset.sbStyle, value = el.value, f = this.find(id); if (!f) return;
      f.n.style ??= {}; f.n.style[this.editDevice] ??= {}; f.n.style[this.editDevice][key] = value; this.persist();
      this.restyle(id!, this.h.inline(f.n, this.editDevice));
      this.text(props?.querySelector('[data-sb-output="' + key + '"]'), key === 'lineHeight' ? Number(value).toFixed(2) : (key === 'imageVerticalPosition' || key === 'dividerWidth') ? value + '%' : value + ' px');
      if (key === 'equalHeight' || key === 'imageVerticalPosition' || key === 'dividerWidth' || key === 'dividerThickness') this.redraw();
      this.h.renderPreview();
    } else if (el.hasAttribute('data-sb-value')) { const f = this.find(this.selectedId); if (f) { f.n.value = el.value; this.persist(); this.h.renderPreview(); } }
  }
  propsChange(e: Event): void {
    const el = e.target as any;
    if (el.dataset.sbProperty) { this.update(() => { this.find(this.selectedId)!.n[el.dataset.sbProperty] = el.value; }); return; }
    if (el.hasAttribute('data-sb-value')) { this.redraw(); return; }
    if (!el.hasAttribute('data-sb-upload') && !el.hasAttribute('data-sb-gallery-upload')) return;
    // Images are MediaUploadService's (it handles them first); a video reaches this.
    const files: File[] = [...(el.files || [])]; if (!files.length) return;
    if (files.some(f => f.size > 2500000)) { this.h.toast('הקובץ גדול מדי. גודל מרבי: 2.5MB.'); return; }
    const targetId = this.selectedId, isGallery = el.hasAttribute('data-sb-gallery-upload');
    Promise.all(files.map(async f => {
      if (f.type.startsWith('image/')) {
        const bitmap = await createImageBitmap(f); const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
        const c = document.createElement('canvas'); c.width = Math.round(bitmap.width * scale); c.height = Math.round(bitmap.height * scale);
        c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height); bitmap.close(); return c.toDataURL('image/jpeg', 0.76);
      }
      return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(f); });
    })).then(urls => {
      if (!this.find(targetId)) return;
      this.update(() => { const n = this.find(targetId)!.n; if (isGallery) { n.images ??= []; n.images.push(...urls); } else n.value = urls[0]; this.selectedId = targetId; });
    }).catch(err => { console.error(err); this.h.toast('העלאת הקובץ נכשלה'); });
  }
  /** Keeps the rich text's selection when a heading / format button is pressed. */
  propsMouseDown(e: Event): void { if ((e.target as Element).closest('[data-sb-heading],[data-sb-format]')) e.preventDefault(); }
  propsClick(e: Event): void {
    const b = (e.target as Element).closest<HTMLElement>('button'); if (!b) return;
    const f = this.find(this.selectedId); if (!f) return;
    const ds = b.dataset, edit = () => this.canvas()?.querySelector<HTMLElement>('[data-sb-edit="' + this.selectedId + '"]');
    if (ds['sbChoice']) { const key = ds['sbChoice'], val = ds['sbChoiceValue']; this.update(() => { if (b.hasAttribute('data-sb-choice-style')) { f.n.style ??= {}; f.n.style[this.editDevice] ??= {}; f.n.style[this.editDevice][key] = val; } else f.n[key] = val; }); return; }
    if (ds['sbHeading']) { const ed = edit(); if (ed) { ed.focus(); document.execCommand('formatBlock', false, ds['sbHeading'].toUpperCase()); f.n.value = ed.innerHTML; this.persist(); this.h.renderPreview(); } return; }
    if (ds['sbFormat']) {
      const ed = edit(); if (ed) { ed.focus(); const cmd = ds['sbFormat']; if (cmd === 'createLink') { const url = prompt('כתובת קישור'); if (url) document.execCommand('createLink', false, url); } else document.execCommand(cmd, false, undefined); f.n.value = ed.innerHTML; this.persist(); this.h.renderPreview(); }
      return;
    }
    if (b.hasAttribute('data-sb-wrap-image')) { if (f.n.type !== 'image' || f.parent?.type !== 'container') return; const wrapper = this.h.create('container'); wrapper.layout = '1'; wrapper.children = [f.n, this.h.create('image')]; this.update(() => { f.items.splice(f.i, 1, wrapper); this.selectedId = wrapper.id; }); return; }
    if (b.hasAttribute('data-sb-swap-columns')) { if (f.n.type !== 'container' || (f.n.children || []).length < 2) return; this.update(() => { [f.n.children[0], f.n.children[1]] = [f.n.children[1], f.n.children[0]]; }); return; }
    if (b.hasAttribute('data-sb-add-inside')) { if (!document.getElementById('sbInsidePicker')) return; this.togglePicker(); return; }
    if (ds['sbInsertType']) { if (f.n.type !== 'container') return; const n = this.h.create(ds['sbInsertType']); this.update(() => { f.n.children ??= []; f.n.children.push(n); this.selectedId = n.id; }); return; }
    if (b.hasAttribute('data-sb-clear-gallery')) { this.update(() => f.n.images = []); return; }
    if (b.hasAttribute('data-sb-duplicate')) { const n = JSON.parse(JSON.stringify(f.n)); const rekey = (x: any) => { x.id = this.h.newId(); (x.children || []).forEach(rekey); }; rekey(n); this.update(() => { f.items.splice(f.i + 1, 0, n); this.selectedId = n.id; }); return; }
    if (b.hasAttribute('data-sb-delete')) this.update(() => { f.items.splice(f.i, 1); this.selectedId = null; });
  }

  // ---- drag and drop: palette -> canvas / tree, tree / canvas -> containers or siblings ------------------------
  dragStart(e: DragEvent, area: 'palette' | 'tree' | 'canvas'): void {
    const t = e.target as Element;
    if (area === 'palette') {
      const el = t.closest<HTMLElement>('[data-sb-add]'); if (!el) return;
      this.dragging = { kind: 'new', type: el.dataset['sbAdd']! }; e.dataTransfer!.effectAllowed = 'copy';
      e.dataTransfer!.setData('text/plain', 'hamonym-story-new:' + el.dataset['sbAdd']); this.mark(el, 'sb-dragging'); return;
    }
    if (area === 'canvas' && t.closest('[contenteditable],video')) return;
    const el = t.closest<HTMLElement>(area === 'tree' ? '[data-sb-pick]' : '[data-sb-node]'); if (!el || (area === 'tree' && t.closest('button'))) return;
    const id = (area === 'tree' ? el.dataset['sbPick'] : el.dataset['sbNode'])!;
    this.dragging = { kind: 'existing', id }; e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', 'hamonym-story-move:' + id); this.mark(el, 'sb-dragging');
  }
  private dropLocation(target: Element, event: DragEvent): { id: string | null; where: string; row?: Element } | null {
    if (target.closest('[data-sb-drop-end]')) return { id: null, where: 'end', row: target.closest('[data-sb-drop-end]')! };
    const row = target.closest<HTMLElement>('[data-sb-node],[data-sb-pick]');
    if (!row) return { id: null, where: 'end' };
    const id = (row.dataset['sbNode'] || row.dataset['sbPick'])!;
    const found = this.find(id); if (!found) return null;
    const r = row.getBoundingClientRect(), y = (event.clientY - r.top) / Math.max(1, r.height);
    // Containers have an obvious central drop zone; outer bands insert before/after.
    const where = found.n.type === 'container' && y >= .20 && y <= .80 ? 'inside' : y < .5 ? 'before' : 'after';
    return { id, where, row };
  }
  private isDescendant(node: any, id: string): boolean { return !!(node.children || []).some((child: any) => child.id === id || this.isDescendant(child, id)); }
  dragOver(e: DragEvent, area: Element): void {
    if (!this.dragging || !this.isOpen) return;
    e.preventDefault(); // accept drops even when hovering over images or nested text
    const dest = this.dropLocation(e.target as Element, e); if (!dest) return;
    if (this.dragging.kind === 'existing') {
      const from = this.find(this.dragging.id), to = dest.id && this.find(dest.id);
      if (to && from && (to.n.id === from.n.id || this.isDescendant(from.n, to.n.id))) { this.clearMarks(); return; }
    }
    e.dataTransfer!.dropEffect = this.dragging.kind === 'new' ? 'copy' : 'move';
    this.clearMarks();
    if (dest.row) this.mark(dest.row, dest.where === 'end' ? 'sb-drop-inside' : 'sb-drop-' + dest.where);
    else this.mark(area, 'sb-drop-inside');
  }
  drop(e: DragEvent): void {
    if (!this.dragging || !this.isOpen) return;
    e.preventDefault(); e.stopPropagation();
    const dest = this.dropLocation(e.target as Element, e);
    this.clearMarks(); try { this.performDrop(dest); } finally { this.dragging = null; }
  }
  dragEnd(): void { this.dragging = null; this.clearMarks(); }
  private performDrop(destination: { id: string | null; where: string } | null): void {
    if (!this.dragging || !destination) return;
    const source = this.dragging, target = destination.id ? this.find(destination.id) : null;
    if (destination.id && !target) return;
    if (source.kind === 'existing') {
      const from = this.find(source.id); if (!from) return;
      if (target && (target.n.id === from.n.id || this.isDescendant(from.n, target.n.id))) return;
      if (!target && from.items === this.nodes() && from.i === this.nodes().length - 1) return;
      this.update(() => {
        const moving = from.n; from.items.splice(from.i, 1);
        if (!destination.id) this.nodes().push(moving);
        else {
          const fresh = this.find(destination.id)!;
          if (destination.where === 'inside' && fresh.n.type === 'container') { fresh.n.children ??= []; fresh.n.children.push(moving); }
          else fresh.items.splice(fresh.i + (destination.where === 'after' ? 1 : 0), 0, moving);
        }
        this.selectedId = moving.id;
      });
    } else {
      const n = this.h.create(source.type);
      this.update(() => {
        if (!destination.id) this.nodes().push(n);
        else if (destination.where === 'inside' && target!.n.type === 'container') { target!.n.children ??= []; target!.n.children.push(n); }
        else target!.items.splice(target!.i + (destination.where === 'after' ? 1 : 0), 0, n);
        this.selectedId = n.id;
      });
    }
  }
}
