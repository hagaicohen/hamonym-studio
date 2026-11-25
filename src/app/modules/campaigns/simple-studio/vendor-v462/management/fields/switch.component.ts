import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { ManagementModelService } from '../management-model.service';
import { ManagementViewService } from '../management-view.service';
import { DrawWriterDirective, writeChecked } from './draw-writer.directive';

/** On/off setting bound to a `data-hu-path` (old engine `sw()`), on its own `label.hu-switch`. */
@Component({
  selector: 'label[ham-switch]',
  standalone: true,
  imports: [DrawWriterDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-switch' },
  template: `<span><strong>{{ title }}</strong><small>{{ hint }}</small></span><input role="switch" [attr.data-hu-path]="path" type="checkbox" [hamDraw]="write">`
})
export class SwitchComponent {
  private readonly model = inject(ManagementModelService);
  readonly view = inject(ManagementViewService);
  @Input({ required: true }) title = '';
  @Input() hint = '';
  @Input({ required: true }) path = '';
  readonly write = writeChecked(() => !!this.model.get(this.path));
}
