import { Component, EventEmitter, Output } from '@angular/core';

/** Wizard top bar with the local draft-save button. */
@Component({selector:'ham-wizard-header',standalone:true,
  templateUrl:'./wizard-header.component.html',styleUrl:'./wizard-header.component.css'})
export class WizardHeaderComponent {
  @Output() save = new EventEmitter<void>();
  saved = false;
  saveDraft(): void { this.save.emit(); this.saved = true; }
}
