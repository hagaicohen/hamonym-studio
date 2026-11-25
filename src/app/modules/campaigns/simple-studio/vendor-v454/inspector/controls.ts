import { ChangeDetectionStrategy, Component, Directive, ElementRef, Input, OnChanges, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { InspectorService } from './inspector.service';
import type { FieldVM } from './inspector-model';

/**
 * The Inspector's shared controls (v4.54): one per control type of the schema (`inspector-schema.ts`), as attribute
 * components on the element the old markup had (`div.field`, `label.toggle-row`), so the DOM and the CSS are the
 * same. They keep the old `data-field` / `data-scope` / `data-choice-*` attributes: the core's delegated handlers
 * (`editInput`, the choice click) still apply the changes to the campaign.
 */

/** The value a render shows in a control (a new element started with it). Written by `InspectorService.render`. */
@Directive({ selector: 'input[hamValue],textarea[hamValue],select[hamValue]', standalone: true })
export class InspectorValueDirective implements OnChanges, OnDestroy {
  private readonly el = inject(ElementRef).nativeElement as HTMLElement;
  private readonly ui = inject(InspectorService);
  @Input() hamValue: unknown = '';
  ngOnChanges(): void { this.ui.values.set(this.el, String(this.hamValue ?? '')); }
  ngOnDestroy(): void { this.ui.values.delete(this.el); }
}
/** The checked state a render shows. */
@Directive({ selector: 'input[hamChecked]', standalone: true })
export class InspectorCheckedDirective implements OnChanges, OnDestroy {
  private readonly el = inject(ElementRef).nativeElement as HTMLInputElement;
  private readonly ui = inject(InspectorService);
  @Input() hamChecked: unknown = false;
  ngOnChanges(): void { this.ui.checks.set(this.el, !!this.hamChecked); }
  ngOnDestroy(): void { this.ui.checks.delete(this.el); }
}
/** A disclosure: open as the markup had it, unless the memory of the panels holds its state. */
@Directive({ selector: 'details[hamPanel]', standalone: true })
export class InspectorPanelDirective implements OnChanges, OnDestroy {
  private readonly el = inject(ElementRef).nativeElement as HTMLDetailsElement;
  private readonly ui = inject(InspectorService);
  @Input() hamPanel: unknown = false;
  ngOnChanges(): void { this.ui.opens.set(this.el, !!this.hamPanel); }
  ngOnDestroy(): void { this.ui.opens.delete(this.el); }
}

/** The edit flags a handler set on a control (`data-started`, `data-db-started`, `data-editing`, `data-hsd-started`). */
@Directive({ selector: '[ham-flags]', standalone: true, host: {
  '[attr.data-started]': 'ui.f(el, "started")', '[attr.data-db-started]': 'ui.f(el, "dbStarted")',
  '[attr.data-editing]': 'ui.f(el, "editing")', '[attr.data-hsd-started]': 'ui.f(el, "hsdStarted")' } })
export class InspectorFlagsDirective {
  readonly el = inject(ElementRef).nativeElement as HTMLElement;
  readonly ui = inject(InspectorService);
}
const DIRECTIVES = [InspectorValueDirective, InspectorCheckedDirective, InspectorFlagsDirective];
const base = { standalone: true, encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.Default, imports: DIRECTIVES };

@Directive()
abstract class FieldControl {
  readonly ui = inject(InspectorService);
  @Input({ required: true }) f!: FieldVM;
}

/** text, url, number (money), datetime-local, color, textarea. */
@Component({ standalone: true, encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.Default, imports: DIRECTIVES, selector: 'div[ham-text-field]',
  template: `<label>{{ f.label }}</label>@if (f.control === 'textarea') {<textarea #i [attr.data-field]="f.key" [attr.maxlength]="f.maxlength ? '120' : null" [attr.data-scope]="f.scope" [attr.placeholder]="f.placeholder ?? null" ham-flags [hamValue]="f.text">{{ f.text }}</textarea>} @else {<input #i [attr.data-field]="f.key" [attr.maxlength]="f.maxlength ? '120' : null" [attr.data-scope]="f.scope" [attr.placeholder]="f.placeholder ?? null" [attr.type]="f.inputType" [attr.data-money]="f.money ? '1' : null" [attr.inputmode]="f.money ? 'decimal' : null" [attr.min]="f.numberMin ? '0' : null" ham-flags [hamValue]="f.text">}` })
export class TextFieldComponent extends FieldControl {}

@Component({ standalone: true, encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.Default, imports: DIRECTIVES, selector: 'div[ham-slider-field]',
  template: `<label [attr.for]="'slider-' + f.scope + '-' + f.key">{{ f.label }} <output #o [attr.data-slider-output]="f.scope + '-' + f.key" dir="ltr">{{ ui.t(o, f.display + '' + f.unit) }}</output></label><input #i [attr.id]="'slider-' + f.scope + '-' + f.key" type="range" [attr.min]="f.min" [attr.max]="f.max" [attr.step]="f.step" [attr.data-field]="f.key" [attr.data-scope]="f.scope" [attr.aria-label]="f.label" ham-flags [hamValue]="f.display"><div class="slider-limits"><span>{{ f.min }}</span><span>{{ f.max }}</span></div>` })
export class SliderFieldComponent extends FieldControl {}

@Component({ standalone: true, encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.Default, imports: DIRECTIVES, selector: 'label[ham-toggle-field]',
  template: `{{ f.label }}<input #i role="switch" type="checkbox" [attr.data-field]="f.key" [attr.data-scope]="f.scope" ham-flags [hamChecked]="f.checked">` })
export class ToggleFieldComponent extends FieldControl {}

@Component({ standalone: true, encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.Default, imports: DIRECTIVES, selector: 'div[ham-select-field]',
  template: `<label>{{ f.label }}</label><select #i [attr.data-field]="f.key" [attr.data-scope]="f.scope" ham-flags [hamValue]="selectedValue()">@for (o of f.options; track $index) {<option [attr.value]="o.value">{{ o.label }}</option>}</select>` })
export class SelectFieldComponent extends FieldControl {
  /** The option marked `selected` in the old markup (the last one, as a parser would take it), else the first. */
  selectedValue(): string {
    const marked = (this.f.options || []).filter(o => o.selected);
    return (marked.length ? marked[marked.length - 1] : this.f.options?.[0])?.value ?? '';
  }
}

@Component({ standalone: true, encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.Default, imports: DIRECTIVES, selector: 'div[ham-choice-field]',
  template: `<label>{{ f.label }}</label><div class="ham-simple-choice-grid" role="group" [attr.aria-label]="f.label">@for (o of f.options; track $index) {<button type="button" [attr.data-choice-field]="f.key" [attr.data-choice-scope]="f.scope" [attr.data-choice-value]="o.value" [attr.aria-pressed]="o.selected + ''" class="ham-simple-choice" [class.active]="o.selected">{{ o.label }}</button>}</div>` })
export class ChoiceFieldComponent extends FieldControl {}

const ANCHORS = ['top-right', 'top-center', 'top-left', 'middle-right', 'middle-center', 'middle-left', 'bottom-right', 'bottom-center', 'bottom-left'];
const ANCHOR_NAMES = ['למעלה מימין', 'למעלה במרכז', 'למעלה משמאל', 'באמצע מימין', 'באמצע', 'באמצע משמאל', 'למטה מימין', 'למטה במרכז', 'למטה משמאל'];
@Component({ standalone: true, encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.Default, imports: DIRECTIVES, selector: 'div[ham-anchor-field]',
  template: `<label>{{ f.label }}</label><div class="anchor-grid" role="group" [attr.aria-label]="f.label">@for (a of anchors; track a; let i = $index) {<button type="button" class="anchor-cell" [class.active]="f.value === a" [attr.data-choice-field]="f.key" [attr.data-choice-scope]="f.scope" [attr.data-choice-value]="a" [attr.aria-label]="names[i]" [attr.aria-pressed]="(f.value === a) + ''"><span></span></button>}</div>` })
export class AnchorFieldComponent extends FieldControl { readonly anchors = ANCHORS; readonly names = ANCHOR_NAMES; }

const INFO_POSITIONS: [string, string, number[]][] = [['right', 'ימין', [43, 50, 57]], ['center', 'מרכז', [22, 32, 42]], ['left', 'שמאל', [7, 14, 21]], ['spread', 'לכל הרוחב', [9, 32, 55]]];
@Component({ standalone: true, encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.Default, imports: DIRECTIVES, selector: 'div[ham-info-field]',
  template: `<label>{{ f.label }}</label><p class="field-help">קובע את מיקום שורת האייקונים והפרטים בדסקטופ בלבד. במובייל נשמרת הפריסה הקומפקטית.</p><div class="info-align-picker" role="group" [attr.aria-label]="f.label">@for (p of positions; track p[0]) {<button type="button" class="info-align-option" [class.active]="f.value === p[0]" [attr.data-choice-field]="f.key" [attr.data-choice-scope]="f.scope" [attr.data-choice-value]="p[0]" [attr.aria-pressed]="(f.value === p[0]) + ''" [attr.title]="p[1]"><svg viewBox="0 0 64 28" width="64" height="28" aria-hidden="true"><rect x="2" y="2" width="60" height="24" rx="5" fill="none" stroke="currentColor" opacity=".33"/><path d="M7 9H57" stroke="currentColor" stroke-width="1.3" opacity=".19"/>@for (x of p[2]; track $index) {<circle [attr.cx]="x" cy="17.5" r="3.2" fill="currentColor"/>}</svg><span>{{ p[1] }}</span></button>}</div>` })
export class InfoAlignFieldComponent extends FieldControl { readonly positions = INFO_POSITIONS; }

const ALIGNS: [string, string, string][] = [['right', 'יישור לימין', 'M4 5h16M9 10h11M4 15h16M9 20h11'], ['center', 'יישור למרכז', 'M4 5h16M7 10h10M4 15h16M7 20h10'], ['left', 'יישור לשמאל', 'M4 5h16M4 10h11M4 15h16M4 20h11']];
@Component({ standalone: true, encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.Default, imports: DIRECTIVES, selector: 'div[ham-alignment-field]',
  template: `<label>{{ f.label }}</label><div class="alignment-buttons" role="group" [attr.aria-label]="f.label">@for (a of aligns; track a[0]) {<button type="button" [attr.title]="a[1]" [attr.aria-label]="a[1]" [attr.aria-pressed]="(f.value === a[0]) + ''" [class.active]="f.value === a[0]" [attr.data-choice-field]="f.key" [attr.data-choice-scope]="f.scope" [attr.data-choice-value]="a[0]"><svg viewBox="0 0 24 24"><path [attr.d]="a[2]"/></svg></button>}</div>` })
export class AlignmentFieldComponent extends FieldControl { readonly aligns = ALIGNS; }

/** The controls, for the template that picks one by the row's type (`fieldHtml`; InspectorComponent's `#field`). */
export const FIELD_CONTROLS = [TextFieldComponent, SliderFieldComponent, ToggleFieldComponent, SelectFieldComponent, ChoiceFieldComponent,
  AnchorFieldComponent, InfoAlignFieldComponent, AlignmentFieldComponent, InspectorValueDirective, InspectorCheckedDirective, InspectorPanelDirective, InspectorFlagsDirective];
