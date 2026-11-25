import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Suggested donation amounts, comma or space separated. */
@Component({selector:'ham-wizard-amounts',standalone:true,templateUrl:'./wizard-amounts.component.html',styleUrl:'./wizard-amounts.component.css'})
export class WizardAmountsComponent {
 @Input() value = '';
 @Input() simple = false;
 @Output() valueChange = new EventEmitter<string>();
}
