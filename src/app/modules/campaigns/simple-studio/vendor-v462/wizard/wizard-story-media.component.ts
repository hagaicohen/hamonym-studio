import { Component, EventEmitter, Input, Output } from '@angular/core';
import { WizardStoryImage } from './wizard.types';
export type { WizardStoryImage } from './wizard.types';

/** Story images: upload and remove (removal does not delete the stored media). */
@Component({
  selector: 'ham-wizard-story-media', standalone: true,
  templateUrl: './wizard-story-media.component.html',
  styleUrl: './wizard-story-media.component.css'
})
export class WizardStoryMediaComponent {
  @Input() images: WizardStoryImage[] = [];
  @Output() remove = new EventEmitter<string>();
  @Output() upload = new EventEmitter<HTMLInputElement>();
}
