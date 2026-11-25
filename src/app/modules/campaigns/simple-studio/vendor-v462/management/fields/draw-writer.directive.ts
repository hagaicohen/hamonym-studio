import { AfterViewInit, Directive, ElementRef, Input, OnDestroy, inject } from '@angular/core';
import { ManagementViewService } from '../management-view.service';

/**
 * Runs a writer on the element once it exists and after every management redraw.
 *
 * The old engine rebuilt the whole page (`innerHTML`) on each redraw, so every control showed
 * the stored value again at exactly those moments, and not in between. Templates keep the
 * elements; this directive restores that contract for DOM state that bindings do not own:
 * `value`/`checked` of controls, and children written by code outside Angular.
 */
@Directive({ selector: '[hamDraw]', standalone: true })
export class DrawWriterDirective<T extends Element = HTMLElement> implements AfterViewInit, OnDestroy {
  @Input({ required: true }) hamDraw!: (el: T) => void;
  private readonly el = inject<ElementRef<T>>(ElementRef);
  private readonly view = inject(ManagementViewService);
  private off: (() => void) | null = null;

  ngAfterViewInit(): void {
    this.run();
    this.off = this.view.onDraw(() => this.run());
  }
  ngOnDestroy(): void { this.off?.(); }
  private run(): void { this.hamDraw(this.el.nativeElement); }
}

/** Static trusted markup (icons from the code, never user data) without sanitizer interference. */
@Directive({ selector: '[hamStaticHtml]', standalone: true })
export class StaticHtmlDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  @Input({ required: true }) set hamStaticHtml(html: string) { this.el.nativeElement.innerHTML = html; }
}

/** Writers shared by the field components. */
export const writeValue = (value: () => unknown) => (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void => {
  const v = String(value() ?? '');
  endEdit(el);
  // A rebuilt <textarea> carried its value as its text (defaultValue) too.
  if (el instanceof HTMLTextAreaElement) el.defaultValue = v;
  el.value = v;
};
export const writeChecked = (checked: () => boolean) => (el: HTMLInputElement): void => { endEdit(el); el.checked = checked(); };

/**
 * `data-hu-edited` marks an edit in progress whose undo snapshot was already taken (set on the
 * first keystroke, cleared on `change`). A redraw used to replace the control, which also ended
 * the edit: the next keystroke takes a new undo snapshot.
 */
function endEdit(el: HTMLElement): void { delete el.dataset['huEdited']; }

/** A rebuilt file input had no selected file. */
export const clearFile = (el: HTMLInputElement): void => { el.value = ''; };
