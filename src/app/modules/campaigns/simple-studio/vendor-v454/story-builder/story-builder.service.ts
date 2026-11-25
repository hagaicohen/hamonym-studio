import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, Renderer2, RendererFactory2, Type, createComponent, inject } from '@angular/core';
import type { StoryNode } from '../public-page/parts/story-node';

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
export class StoryBuilderService {
  private readonly injector = inject(EnvironmentInjector);
  private readonly appRef = inject(ApplicationRef);
  readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private ref: ComponentRef<unknown> | null = null;

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

  mount(type: Type<unknown>, host: HTMLElement | null): void {
    if (!host || this.ref) return;
    this.ref = createComponent(type, { environmentInjector: this.injector, hostElement: host });
    host.removeAttribute('ng-version');
    this.appRef.attachView(this.ref.hostView);
    this.ref.changeDetectorRef.detectChanges();
  }
  refresh(): void { this.ref?.changeDetectorRef.detectChanges(); }

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
}
