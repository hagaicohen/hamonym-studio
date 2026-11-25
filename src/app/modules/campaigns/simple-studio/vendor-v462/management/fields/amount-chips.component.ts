import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { ManagementModelService, money } from '../management-model.service';
import { DrawWriterDirective, writeValue } from './draw-writer.directive';

export type AmountKind = 'oneTime' | 'monthly';

/**
 * Editable suggested amounts of one kind (old engine `chips()`). Adding, editing and removing are
 * handled by the shared `data-hu-add-amount` / `data-hu-amount-edit` / `data-hu-remove-amount`
 * commands. `amounts` is the list as of the last redraw.
 */
@Component({
  selector: 'div[ham-amount-chips]',
  standalone: true,
  imports: [DrawWriterDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-field full hu-amount-group' },
  template: `<label>{{ title }}</label><div class="hu-chip-line">@for (n of amounts; track $index; let i = $index) {<span class="hu-chip hu-editable-amount"><span class="hu-currency">₪</span><input type="text" [attr.data-hu-amount-edit]="kind" [attr.data-i]="i" data-money="1" inputmode="decimal" [attr.aria-label]="'עריכת סכום ' + (i + 1) + ' (' + (kind === 'monthly' ? 'חודשי' : 'חד־פעמי') + ')'" title="לחצו כדי לשנות את הסכום" [hamDraw]="chipWriter(i)"><button [attr.data-hu-remove-amount]="kind" [attr.data-i]="i" type="button" title="הסר סכום" [attr.aria-label]="'הסר סכום ' + money(n)">×</button></span>}</div>
<div class="hu-row hu-add-amount-row"><input [id]="'hu-add-' + kind" type="text" inputmode="decimal" data-money="1" placeholder="סכום חדש ₪" aria-label="סכום חדש" [hamDraw]="clear"><button class="hu-action" [attr.data-hu-add-amount]="kind" type="button">＋ הוסף</button></div>
<div class="hu-hint">לחצו על סכום כדי לערוך אותו; × להסרה. כל הסכומים מוצגים עם מפרידי אלפים.</div>`
})
export class AmountChipsComponent {
  private readonly model = inject(ManagementModelService);
  @Input({ required: true }) kind: AmountKind = 'oneTime';
  @Input({ required: true }) title = '';
  @Input({ required: true }) amounts: number[] = [];
  readonly money = money;
  /** The new-amount box was rebuilt empty on every redraw. */
  readonly clear = writeValue(() => '');
  private readonly writers = new Map<number, (el: HTMLInputElement) => void>();
  chipWriter(i: number): (el: HTMLInputElement) => void {
    let w = this.writers.get(i);
    if (!w) {
      w = writeValue(() => this.model.context.huFormatAmount((this.model.get('donations.' + this.kind) || [])[i]));
      this.writers.set(i, w);
    }
    return w;
  }
}
