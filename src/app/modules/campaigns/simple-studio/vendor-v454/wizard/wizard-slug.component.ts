import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Campaign URL slug. Spaces become dashes when the field loses focus. */
@Component({selector:'ham-wizard-slug',standalone:true,templateUrl:'./wizard-slug.component.html',styleUrl:'./wizard-slug.component.css'})
export class WizardSlugComponent {
 @Input() slug = '';
 @Input() simple = false;
 @Output() slugChange = new EventEmitter<string>();
 onChange(input: HTMLInputElement): void {
   input.value = String(input.value || '').trim().replace(/\s+/g, '-');
   this.slugChange.emit(input.value);
 }
}
