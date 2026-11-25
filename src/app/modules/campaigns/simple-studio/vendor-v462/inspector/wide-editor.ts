import { OnDestroy, ApplicationRef, ChangeDetectionStrategy, Component, ComponentRef, EnvironmentInjector, Injectable, Renderer2, RendererFactory2, RendererStyleFlags2, ViewEncapsulation, createComponent, inject, signal } from '@angular/core';
import { InspectorService } from './inspector.service';

import { studioAdopt } from '../core/studio-session';
export const WIDE_CATEGORIES: [string, string][] = [['all', 'כל האפשרויות'], ['layout', 'פריסה ומיקום'], ['look', 'מראה'], ['color', 'צבעים'], ['type', 'טקסט'], ['advanced', 'מתקדם'], ['content', 'מידע ופעולות']];

/** `hamWideClassify`: a category from a label and the keys of its controls. */
export function wideClassify(label: string, fieldKey = ''): string {
  const s = (label + ' ' + fieldKey).toLowerCase();
  if (/צבע|רקע|גוון|palette|color|background|accent|bordercolor|bg\b|gradient|גוונים/.test(s)) return 'color';
  if (/טיפוגרפ|פונט|גופן|כותרת|טקסט|אותיות|גודל כתב|font|heading|subtitle|textsize|lineheight|letterspacing/.test(s)) return 'type';
  if (/פריסה|מיקום|תצוגה|סידור|עמודות|שורות|קרוסל|גריד|ניווט|layout|placement|position|columns|display|viewmode|align/.test(s)) return 'layout';
  if (/עיגול|מסגרת|פינות|ריווח|מרווח|צל|אפקט|רדיוס|קוטר|תמונה|סגנון|עיצוב|shape|radius|shadow|gap|size|style|image|width|height/.test(s)) return 'look';
  return 'advanced';
}
function fieldCategory(node: Element): string {
  const labels = Array.from(node.querySelectorAll('label')).map(x => x.textContent || '').join(' ');
  const keys = Array.from(node.querySelectorAll<HTMLElement>('[data-field],[data-db-key],[data-ham-card-slider]'))
    .map(e => [e.dataset['field'], e.dataset['dbKey'], e.dataset['hamCardSlider']].join(' ')).join(' ');
  return wideClassify(labels, keys);
}

/**
 * The large editor (v4.55, milestone C). Until v4.54 the core wrote the overlay as `innerHTML`, moved `#fields` into it
 * and hid fields with a MutationObserver. Now `WideEditorComponent` is the overlay (header, categories, empty
 * notice, footer) and this service holds its state (`category`) and its pass over `#fields`: the classification is
 * read from the rendered inspector, and what it decides is written through `Renderer2` (classes, the advanced
 * category's `display`, the disclosures it opens, the rewards placement it moves). The pass runs after every
 * inspector render while the editor is open (`InspectorService.render`), as the observer and the core's microtask did.
 * `#fields` itself is still moved (not cloned) into `.ham-wide-body`, so its listeners and Angular view stay.
 */
@Injectable({ providedIn: 'root' })
export class WideEditorService implements OnDestroy {
  /** v4.56: the Studio session ends. */
  ngOnDestroy(): void { this.ref?.destroy(); this.ref = null; }
  private readonly injector = inject(EnvironmentInjector);
  private readonly appRef = inject(ApplicationRef);
  private readonly r: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private ref: ComponentRef<WideEditorComponent> | null = null;
  private home: HTMLElement | null = null;
  private lastFocus: HTMLElement | null = null;
  readonly category = signal('all');
  readonly empty = signal(false);
  /** The selected component (the rewards placement is moved to the top for `rewards`). */
  selected: () => string = () => '';

  get panel(): HTMLElement | null { const el = this.ref?.location.nativeElement as HTMLElement | undefined; return el?.isConnected ? el : null; }
  get isOpen(): boolean { return !!this.panel; }

  open(): void {
    if (this.isOpen) return;
    const fields = document.getElementById('fields');
    if (!fields || !fields.isConnected) return;
    this.home = fields.parentElement;
    this.lastFocus = document.activeElement as HTMLElement | null;
    const host = this.r.createElement('div') as HTMLElement;
    this.r.addClass(host, 'ham-wide-backdrop');
    this.r.appendChild(document.body, studioAdopt(host));
    this.category.set('all');
    this.ref = createComponent(WideEditorComponent, { environmentInjector: this.injector, hostElement: host });
    host.removeAttribute('ng-version');
    this.appRef.attachView(this.ref.hostView);
    this.ref.changeDetectorRef.detectChanges();
    const body = host.querySelector('[data-ham-wide-body]');
    if (body) this.r.appendChild(body, fields);
    this.r.addClass(document.body, 'ham-wide-open');
    this.refresh();
    host.querySelector<HTMLElement>('.ham-wide-close')?.focus();
  }

  close(): void {
    const panel = this.panel;
    if (!panel || !this.ref) return;
    const fields = document.getElementById('fields');
    if (fields && this.home) {
      const placement = fields.querySelector('.ham-reward-placement');
      const appearanceBody = fields.querySelector('.ham-unified-appearance > .ham-unified-section-body');
      if (placement && appearanceBody) this.r.insertBefore(appearanceBody, placement, appearanceBody.firstChild);
      this.r.appendChild(this.home, fields);
    }
    fields?.querySelectorAll('.ham-wide-hidden').forEach(e => this.r.removeClass(e, 'ham-wide-hidden'));
    this.appRef.detachView(this.ref.hostView);
    this.ref.destroy();
    if (panel.parentNode) this.r.removeChild(panel.parentNode, panel);
    this.ref = null;
    this.r.removeClass(document.body, 'ham-wide-open');
    this.category.set('all');
    this.lastFocus?.focus();
    this.lastFocus = null;
  }

  choose(category: string): void {
    this.category.set(category || 'all');
    this.refresh();
    const body = this.panel?.querySelector('.ham-wide-body');
    if (body) body.scrollTop = 0;
  }

  /** `hamWideRefresh`: which parts of `#fields` the chosen category shows. */
  refresh(): void {
    if (!this.isOpen) return;
    const root = document.getElementById('fields');
    if (!root) return;
    const r = this.r, cat = this.category(), all = cat === 'all', contentOnly = cat === 'content';
    const hide = (el: Element, on: boolean) => on ? r.addClass(el, 'ham-wide-hidden') : r.removeClass(el, 'ham-wide-hidden');
    const display = (el: Element, value: string | null, important = true) =>
      value === null ? r.removeStyle(el, 'display') : r.setStyle(el, 'display', value, important ? RendererStyleFlags2.Important | RendererStyleFlags2.DashCase : RendererStyleFlags2.DashCase);
    const open = (el: HTMLDetailsElement) => { if (!el.open) r.setProperty(el, 'open', true); };
    // Advanced is a direct category: the quick start and the appearance summary are hidden.
    root.querySelectorAll('.ham-unified-preset-header,.ham-unified-presets,.ham-easy-design').forEach(el => display(el, cat === 'advanced' ? 'none' : null));
    const appearanceSummary = root.querySelector('.ham-unified-appearance > summary');
    if (appearanceSummary) display(appearanceSummary, cat === 'advanced' ? 'none' : null);
    // No nested "advanced" disclosure inside the large editor.
    root.querySelectorAll<HTMLDetailsElement>('.ham-easy-advanced').forEach(group => {
      r.addClass(group, 'ham-wide-flatten-advanced');
      open(group);
      r.removeStyle(group, 'display');
      const summary = group.querySelector(':scope > summary');
      if (summary) display(summary, 'none');
      const body = group.querySelector(':scope > .ham-easy-advanced-body');
      if (body) display(body, 'contents');
    });
    // Rewards placement is a first-class decision: the original control is moved to the top.
    if (this.selected() === 'rewards') {
      const placement = root.querySelector('.ham-reward-placement');
      if (placement && placement.parentElement !== root) {
        const intro = root.querySelector('.ham-unified-intro');
        if (intro) r.insertBefore(root, placement, intro.nextSibling);
        else r.insertBefore(root, placement, root.firstChild);
      }
    }
    const appearance = root.querySelector<HTMLDetailsElement>('.ham-unified-appearance');
    const content = root.querySelector<HTMLDetailsElement>('.ham-unified-content');
    if (appearance) { hide(appearance, contentOnly); if (!contentOnly) open(appearance); }
    if (content) { hide(content, !all && !contentOnly); if (all || contentOnly) open(content); }
    const placement = root.querySelector('.ham-reward-placement');
    if (placement) hide(placement, !all && cat !== 'layout');
    const intro = root.querySelector('.ham-unified-intro');
    if (intro) hide(intro, !all);
    const hidden = new Set<Element>();
    root.querySelectorAll('.field').forEach(field => {
      const inContent = !!field.closest('.ham-unified-content');
      const advancedField = !!field.closest('.ham-easy-advanced,.ham-simple-more,.ham-inspector-advanced');
      const visible = all || (cat === 'advanced' && !inContent && advancedField) || (contentOnly ? inContent : !inContent && !advancedField && fieldCategory(field) === cat);
      hide(field, !visible);
      if (!visible) hidden.add(field);
    });
    // Groups with a shown field are shown (and opened), the rest hidden.
    Array.from(root.querySelectorAll<HTMLDetailsElement>('details')).reverse().forEach(group => {
      if (group === appearance || group === content) return;
      const contained = Array.from(group.querySelectorAll('.field'));
      if (!contained.length) return;
      const matches = contained.some(field => !hidden.has(field));
      const advanced = cat === 'advanced' && group.matches('.ham-easy-advanced,.ham-simple-more,.ham-inspector-advanced');
      hide(group, !advanced && !all && !matches);
      if ((matches && !all) || advanced) open(group);
    });
    const shown = (el: Element) => !el.classList.contains('ham-wide-hidden');
    Array.from(root.children).forEach(el => {
      if (el === appearance || el === content || el === placement || el === intro) return;
      const contained = Array.from(el.querySelectorAll('.field'));
      if (contained.length) { hide(el, !all && !contained.some(shown)); return; }
      const label = (el.querySelector('h3,strong,summary,label')?.textContent || el.textContent || '').slice(0, 130);
      const group = wideClassify(label, (el as HTMLElement).className || '');
      hide(el, !all && (contentOnly ? group !== 'content' : group !== cat));
    });
    this.empty.set(!Array.from(root.children).find(el => shown(el) && el !== intro));
    this.ref?.changeDetectorRef.detectChanges();
  }
}

/** The large editor's overlay (`.ham-wide-backdrop`): the same markup as v4.54's `innerHTML`. */
@Component({
  selector: 'ham-wide-editor',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Default,
  host: { '[attr.data-ham-wide-active-category]': 'wide.category()', '(click)': 'click($event)', '(keydown)': 'key($event)' },
  template: `<section class="ham-wide-panel inspector" role="dialog" aria-modal="true" aria-labelledby="hamWideTitle" dir="rtl"><header class="ham-wide-head"><div><span class="ham-wide-eyebrow">HAMONYM · חלון עריכה גדול</span><h2 id="hamWideTitle" data-ham-wide-title>{{ title() }}</h2><p>כל האפשרויות באותו מקום, מסודרות לפי נושאים. השינויים מופיעים מיד בקמפיין.</p></div><button type="button" class="ham-wide-close" data-ham-wide-close aria-label="סגירת חלון העיצוב">✕ <span>חזרה לפאנל</span></button></header><div class="ham-wide-workspace"><nav class="ham-wide-categories" role="tablist" aria-orientation="horizontal" aria-label="קטגוריות עריכה" data-ham-wide-categories>@for (c of categories; track c[0]) {<button type="button" role="tab" [attr.data-wide-category]="c[0]" [attr.aria-selected]="(c[0] === wide.category()) + ''" [class.is-active]="c[0] === wide.category()" [attr.tabindex]="c[0] === wide.category() ? 0 : -1">{{ c[1] }}</button>}</nav><div class="ham-wide-main"><div class="ham-wide-body" data-ham-wide-body></div><div class="ham-wide-empty" [hidden]="!wide.empty()" data-ham-wide-empty>אין אפשרויות בקטגוריה הזאת לרכיב שנבחר. אפשר לעבור ל״כל האפשרויות״.</div></div></div><footer class="ham-wide-foot"><span>✓ כל השינויים נשמרים באותו מסמך קמפיין</span><button type="button" data-ham-wide-close>סיום עריכה</button></footer></section>`
})
export class WideEditorComponent {
  readonly wide = inject(WideEditorService);
  private readonly inspector = inject(InspectorService);
  readonly categories = WIDE_CATEGORIES;
  title(): string { return (this.inspector.view?.title ?? 'Hero') || 'עריכת הרכיב'; }
  click(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target === e.currentTarget || target.closest('[data-ham-wide-close]')) { this.wide.close(); return; }
    const choice = target.closest<HTMLElement>('[data-wide-category]');
    if (choice) this.wide.choose(choice.dataset['wideCategory'] || 'all');
  }
  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.wide.close(); }
  }
}
