import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Extra hero slider images (up to five). */
@Component({selector:'ham-wizard-slider',standalone:true,templateUrl:'./wizard-slider.component.html',styleUrl:'./wizard-slider.component.css'})
export class WizardSliderComponent {
 @Input() images: string[] = [];
 @Output() remove = new EventEmitter<number>();
 @Output() upload = new EventEmitter<HTMLInputElement>();
}
