import { Component, Input, inject } from '@angular/core';
import { Pencil, PreviewSelectionService } from './preview-selection.service';

/**
 * The contextual edit pencil ("עריכה בחלון גדול") over the hovered preview block, fixed in the viewport. AppComponent
 * shows it (a direct child of the app host, as the old button was of <body>) while PreviewSelectionService has a pencil.
 */
@Component({
  selector: 'button[ham-edit-pencil]',
  standalone: true,
  host: {
    type: 'button', class: 'ham-preview-edit-launcher',
    '[attr.data-ham-preview-edit]': 'p.id', '[attr.title]': 'label', '[attr.aria-label]': 'label', '[attr.style]': 'p.style',
    '(pointerdown)': 'preview.pencilDown($event, p.id)', '(click)': 'preview.pencilClick($event, p.id)'
  },
  template: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg><span>עריכה בחלון גדול</span>`
})
export class EditPencilComponent {
  readonly preview = inject(PreviewSelectionService);
  @Input({ required: true, alias: 'ham-edit-pencil' }) p!: Pencil;
  get label(): string { return 'עריכת ' + this.p.name + ' בחלון גדול'; }
}
