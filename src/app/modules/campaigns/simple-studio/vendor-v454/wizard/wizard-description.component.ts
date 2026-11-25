import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({selector:'ham-wizard-description',standalone:true,templateUrl:'./wizard-description.component.html',styleUrl:'./wizard-description.component.css'})
export class WizardDescriptionComponent {
 @Input() description = '';
 @Output() descriptionChange = new EventEmitter<string>();
}
