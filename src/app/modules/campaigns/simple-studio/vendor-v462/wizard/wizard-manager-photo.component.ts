import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({selector:'ham-wizard-manager-photo',standalone:true,templateUrl:'./wizard-manager-photo.component.html',styleUrl:'./wizard-manager-photo.component.css'})
export class WizardManagerPhotoComponent {
 @Input() src = '';
 @Output() upload = new EventEmitter<HTMLInputElement>();
}
