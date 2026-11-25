import { EventEmitter, Output, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
/** ANGULAR: original hero media + simple donation logo/avatar selectors.
 * BACKEND-WRITE: update hero.mediaType / simpleDonation.identityMode in campaign.
 */
@Component({selector:'ham-wizard-choice',standalone:true,imports:[CommonModule],
 templateUrl:'./wizard-choice.component.html',styleUrl:'./wizard-choice.component.css'})
export class WizardChoiceComponent {
 @Input() choice: 'media'|'identity' = 'media';
 @Input() mode = 'image';
 @Output() chosen = new EventEmitter<string>();
 choose(value: string): void { this.chosen.emit(value); }
}
