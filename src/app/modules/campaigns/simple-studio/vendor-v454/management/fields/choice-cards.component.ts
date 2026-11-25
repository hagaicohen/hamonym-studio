import { ChangeDetectionStrategy, Component, Input, computed, inject } from '@angular/core';
import { ManagementModelService } from '../management-model.service';
import { ManagementViewService } from '../management-view.service';
import { StaticHtmlDirective } from './draw-writer.directive';
import { choiceIcon } from './field-icons';

/** value, title, subtitle, icon */
export type ChoiceItem = [unknown, string, string, string];

/**
 * Selection cards (old engine `huChoiceCards`). A click is handled by the shared
 * `[data-hu-seg]` command, which commits the value and redraws.
 */
@Component({
  selector: 'div[ham-choice-cards]',
  standalone: true,
  imports: [StaticHtmlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-choice-grid', role: 'group', '[attr.aria-label]': 'label || "בחירת אפשרות"' },
  template: `@let current = selected();
@for (c of items; track $index) {
  @let active = str(current) === str(c[0]);
  <button type="button" class="hu-choice-card" [class.is-selected]="active" [attr.data-hu-seg]="path" [attr.data-value]="str(c[0])" [attr.aria-pressed]="active"><span class="hu-choice-icon" [hamStaticHtml]="icon(c[3])"></span><span class="hu-choice-body"><strong>{{ c[1] }}</strong><small>{{ c[2] }}</small></span><span class="hu-choice-selected" aria-hidden="true">✓</span></button>
}`
})
export class ChoiceCardsComponent {
  private readonly model = inject(ManagementModelService);
  readonly view = inject(ManagementViewService);
  @Input({ required: true }) path = '';
  @Input({ required: true }) items: ChoiceItem[] = [];
  @Input() label = '';
  readonly icon = choiceIcon;
  str(v: unknown): string { return String(v); }
  /** Stored value, read once per redraw. */
  readonly selected = computed(() => { this.view.revision(); return this.model.get(this.path); });
}
