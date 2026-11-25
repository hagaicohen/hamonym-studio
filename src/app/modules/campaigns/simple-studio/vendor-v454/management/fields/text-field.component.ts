import { ChangeDetectionStrategy, Component, Input, computed, inject } from '@angular/core';
import { ManagementModelService, displayDate, parseIsoDate } from '../management-model.service';
import { ManagementViewService } from '../management-view.service';
import { DrawWriterDirective, StaticHtmlDirective, writeValue } from './draw-writer.directive';
import { CALENDAR_SVG } from './field-icons';

export type TextFieldType = 'text' | 'textarea' | 'number' | 'date' | 'url';

/** Placeholder shown when a field has none of its own. */
const GUIDE_TEXT: Record<string, string> = {
  'meta.name': 'הזינו שם לקמפיין — הוא יוצג על תמונת הפתיחה',
  'meta.manager': 'שם מנהל הקמפיין, למשל: ישראל ישראלי',
  'meta.place': 'היכן מתקיימת הפעילות? בארץ, בעולם או באופן מקוון',
  'content.heroTitle': 'הזינו את שם הקמפיין שיופיע על תמונת ה־Hero',
  'content.heroSubtitle': 'משפט אחד שמסביר מה מטרת הקמפיין',
  'content.belowTitle': 'כותרת התיאור הקצר שמתחת ל־Hero (לא חובה)',
  'content.shortTitle': 'כותרת התיאור הקצר שמתחת ל־Hero (לא חובה)',
  'content.belowSubtitle': 'כותרת משנה (לא חובה)',
  'content.shortText': 'כאן ייכתב תיאור קצר של הקמפיין',
  'mobileHero.title': 'שם הקמפיין כפי שיופיע במובייל',
  'mobileHero.subtitle': 'תיאור קצר שמותאם לתצוגת מובייל'
};
/** Number fields shown as formatted amounts. */
const MONEY_PATHS = ['funding.target', 'funding.matchingCap'];

/**
 * A management field bound to a `data-hu-path` (old engine `f()`), on its own `.hu-field` element.
 * Edits still go through the document `input`/`change` handlers keyed by `data-hu-path`.
 */
@Component({
  selector: 'div[ham-text-field]',
  standalone: true,
  imports: [DrawWriterDirective, StaticHtmlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-field', '[class.full]': 'full' },
  template: `<label>{{ label }}</label>@switch (kind) {
  @case ('textarea') { <textarea [attr.data-hu-path]="path" [attr.rows]="rows" [attr.placeholder]="hintText" [hamDraw]="write"></textarea> }
  @case ('date') {
    @let v = date();
    <button class="hu-date-trigger" [class.has-value]="!!parse(v)" type="button" data-hu-date-trigger="1" [attr.data-hu-date-path]="path" aria-haspopup="dialog" aria-expanded="false"><span class="hu-date-icon" [hamStaticHtml]="calendarSvg"></span><span class="hu-date-value">{{ display(v) || 'בחרו תאריך' }}</span></button>
  }
  @case ('money') { <input type="text" inputmode="decimal" data-money="1" [attr.data-hu-path]="path" [attr.placeholder]="hintText" [hamDraw]="write"> }
  @default { <input [attr.type]="type" [attr.data-hu-path]="path" [attr.placeholder]="hintText" [hamDraw]="write"> }
}@if (hint) {<span class="hu-hint">{{ hint }}</span>}`
})
export class TextFieldComponent {
  readonly view = inject(ManagementViewService);
  private readonly model = inject(ManagementModelService);

  @Input({ required: true }) label = '';
  @Input({ required: true }) path = '';
  @Input() type: TextFieldType = 'text';
  @Input() full = false;
  @Input() hint = '';
  @Input() placeholder = '';
  @Input() rows = 3;

  readonly calendarSvg = CALENDAR_SVG;
  readonly parse = parseIsoDate;
  readonly display = displayDate;

  get kind(): string { return this.type === 'number' && MONEY_PATHS.includes(this.path) ? 'money' : this.type; }
  get hintText(): string { return this.placeholder || GUIDE_TEXT[this.path] || ''; }
  /** Stored date, read once per redraw (the old field was rebuilt only then). */
  readonly date = computed(() => { this.view.revision(); return String(this.model.get(this.path) ?? ''); });

  readonly write = writeValue(() => {
    const value = this.model.get(this.path) ?? '';
    return this.kind === 'money' ? this.model.context.huFormatAmount(value) : value;
  });
}
