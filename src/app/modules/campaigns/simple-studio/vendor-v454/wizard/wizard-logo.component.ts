import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Campaign logo: upload, remove, or use the organization's logo. */
@Component({selector:'ham-wizard-logo',standalone:true,templateUrl:'./wizard-logo.component.html',styleUrl:'./wizard-logo.component.css'})
export class WizardLogoComponent {
 @Input() src = '';
 @Input() organizationSrc = '';
 @Input() mode = 'regular';
 @Output() remove = new EventEmitter<void>();
 @Output() restore = new EventEmitter<void>();
 @Output() upload = new EventEmitter<HTMLInputElement>();
 get hasLogo(): boolean { return !!this.src; }
}
