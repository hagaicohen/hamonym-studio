import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, Renderer2, RendererFactory2, Type, createComponent, inject } from '@angular/core';
import type { InspectorView } from './inspector-model';

/** The attributes the core's handlers set on a control while it is being edited (`data-started` …). */
export type InspectorFlag = 'started' | 'dbStarted' | 'editing' | 'hsdStarted';

/**
 * The Inspector (`aside.inspector`) since v4.54: its view and the state between two renders.
 *
 * Until v4.53 `renderInspector` wrote `#fields.innerHTML` (three times per render), and the core's handlers wrote the
 * controls' DOM (outputs, `data-started`, the category list). Now the core builds an `InspectorView`
 * (`inspector-model.ts`) and calls `render`; `InspectorComponent` (on `#fields`), `InspectorHeadComponent` and
 * `InspectorTabsComponent` show it, in place. The handlers report what they wrote before through `flag` / `text` /
 * `filterCategories`, and the components show it (`refresh`).
 *
 * What a new `#fields` started without is reset on each render, as before (checked by parity, `s_inspector`):
 * the values and the checked state of every control (`hamValue`, `hamChecked`), the disclosures (`hamPanel`: the
 * markup's default, or what the memory of the panels holds for this component), the edit flags and outputs, and the
 * focus inside `#fields` (dropped). The scroll position of the inspector stays the same number (no scroll anchoring).
 */
@Injectable({ providedIn: 'root' })
export class InspectorService {
  private readonly injector = inject(EnvironmentInjector);
  private readonly appRef = inject(ApplicationRef);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private refs: ComponentRef<unknown>[] = [];

  view: InspectorView | null = null;
  revision = 0;
  private flags = new Map<Element, Set<InspectorFlag>>();
  private texts = new Map<Element, string>();
  /** The category search typed since the last render (the list follows it; null: the view's). */
  categoryFilter: string | null = null;

  /** The memory of the disclosures, per `selected:unified` (UI only, not saved). */
  readonly panels = new Map<string, Map<string, boolean>>();
  previouslyRendered = '';

  // controls registered by the directives: what a render shows in them
  readonly values = new Map<HTMLElement, string>();
  readonly checks = new Map<HTMLInputElement, boolean>();
  readonly opens = new Map<HTMLDetailsElement, boolean>();

  /** Creates the components on the static inspector's nodes (before the core attaches its listeners). */
  mount(parts: [Type<unknown>, HTMLElement | null][]): void {
    for (const [type, host] of parts) {
      if (!host) continue;
      const ref = createComponent(type, { environmentInjector: this.injector, hostElement: host });
      host.removeAttribute('ng-version');
      this.appRef.attachView(ref.hostView);
      ref.changeDetectorRef.detectChanges();
      this.refs.push(ref);
    }
  }

  fields(): HTMLElement | null { return document.getElementById('fields'); }

  render(view: InspectorView): void {
    const fields = this.fields();
    const focused = document.activeElement;
    if (fields && focused instanceof HTMLElement && fields.contains(focused)) focused.blur();
    const scrollers = [document.querySelector<HTMLElement>('.workspace > .inspector'), document.querySelector<HTMLElement>('.ham-wide-body')]
      .filter((x): x is HTMLElement => !!x).map(el => [el, el.scrollTop] as const);
    this.view = view;
    this.revision++;
    this.flags.clear(); this.texts.clear(); this.categoryFilter = null;
    this.check();
    this.reset(view.panelKey);
    // Reading the position lays out the new content (a scroll anchor would move it there); write the number back.
    for (const [el, top] of scrollers) if (el.scrollTop !== top) el.scrollTop = top;
  }

  /** After a handler's change of a flag or an output: the same view, checked again. */
  refresh(): void { this.check(); }

  private check(): void { for (const ref of this.refs) ref.changeDetectorRef.detectChanges(); }

  /** What a new element showed: the bound value, the checked state and the disclosure (or its memory). */
  private reset(key: string): void {
    for (const [el, value] of this.values) {
      if ((el as HTMLInputElement).value !== value) this.renderer.setProperty(el, 'value', value);
    }
    for (const [el, checked] of this.checks) if (el.checked !== checked) this.renderer.setProperty(el, 'checked', checked);
    const states = this.panels.get(key);
    const all = Array.from(this.fields()?.querySelectorAll('details') || []);
    all.forEach((node, index) => {
      if (!this.opens.has(node)) return;
      const id = this.panelIdentity(node, index);
      const open = states?.has(id) ? !!states.get(id) : !!this.opens.get(node);
      if (node.open !== open) this.renderer.setProperty(node, 'open', open);
    });
    this.previouslyRendered = key;
  }

  /** `hamInspectorPanelIdentity`: the summary's text and its index among same-named siblings. */
  panelIdentity(node: HTMLDetailsElement, index: number): string {
    const name = (n: Element) => (n.querySelector(':scope > summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const label = name(node);
    return label ? label + '#' + Array.from(node.parentElement?.querySelectorAll(':scope > details') || []).filter(n => name(n) === label).indexOf(node) : 'index:' + index;
  }
  /** `hamRememberInspectorPanels`: the open state of every disclosure, for the component rendered last. */
  remember(): void {
    const root = this.fields();
    if (!root || !this.previouslyRendered) return;
    const previous = this.panels.get(this.previouslyRendered) || new Map<string, boolean>();
    Array.from(root.querySelectorAll('details')).forEach((node, index) => previous.set(this.panelIdentity(node, index), node.open));
    this.panels.set(this.previouslyRendered, previous);
  }
  /** The user opened or closed a disclosure (the core's `toggle` listener). */
  recordToggle(node: HTMLDetailsElement, key: string): void {
    const nodes = Array.from(document.querySelectorAll('#fields details')), index = nodes.indexOf(node);
    const states = this.panels.get(key) || new Map<string, boolean>();
    states.set(this.panelIdentity(node, index), node.open);
    this.panels.set(key, states);
  }

  // ---- what the handlers wrote before ------------------------------------------------------------------------
  flag(el: Element, name: InspectorFlag, on = true): void {
    const set = this.flags.get(el) || new Set<InspectorFlag>();
    if (on) set.add(name); else set.delete(name);
    this.flags.set(el, set);
    this.refresh();
  }
  has(el: Element, name: InspectorFlag): boolean { return !!this.flags.get(el)?.has(name); }
  /** A flag as its attribute's value ('1' or absent). */
  f(el: Element, name: InspectorFlag): string | null { return this.has(el, name) ? '1' : null; }
  text(el: Element | null | undefined, value: string): void {
    if (!el) return;
    this.texts.set(el, value);
    this.refresh();
  }
  /** An element's text: what a handler wrote since the render, else the view's. */
  t(el: Element, fallback: unknown): string { return this.texts.has(el) ? this.texts.get(el)! : String(fallback ?? ''); }
  filterCategories(value: string): void { this.categoryFilter = value; this.refresh(); }
}
