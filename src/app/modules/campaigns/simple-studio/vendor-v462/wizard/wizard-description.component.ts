import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({selector:'ham-wizard-description',standalone:true,templateUrl:'./wizard-description.component.html',styleUrls:['./wizard-description.component.css','./wizard-validation.css']})
export class WizardDescriptionComponent {
 @Input() description = '';
 @Input() error = '';
 @Output() descriptionChange = new EventEmitter<string>();
}
