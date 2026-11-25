import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Hero image upload, or a video URL when the hero shows video. */
@Component({selector:'ham-wizard-hero-source',standalone:true,templateUrl:'./wizard-hero-source.component.html',styleUrl:'./wizard-hero-source.component.css'})
export class WizardHeroSourceComponent {
 @Input() mode: 'image'|'video' = 'image';
 @Input() video = '';
 @Input() hasImage = false;
 @Output() videoChange = new EventEmitter<string>();
 @Output() upload = new EventEmitter<HTMLInputElement>();
}
