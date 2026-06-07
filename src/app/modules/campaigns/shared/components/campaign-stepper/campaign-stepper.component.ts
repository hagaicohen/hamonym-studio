import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-campaign-stepper',
  standalone: true,
  templateUrl: './campaign-stepper.component.html',
  styleUrls: ['./campaign-stepper.component.css'],
})
export class CampaignStepperComponent {
  steps = [
    'פרטי בסיס',
    'סוג ויעד',
    'תשורות',
    'חסויות',
    'שגרירים',
    'עדכונים',
    'בניית דף',
    'פרסום',
  ];

  @Input() currentStep = 1;
  @Input() editMode = false;

  @Output() stepSelected = new EventEmitter<number>();

  selectStep(index: number): void {
    if (this.editMode) {
      this.stepSelected.emit(index + 1);
    }
  }
}
