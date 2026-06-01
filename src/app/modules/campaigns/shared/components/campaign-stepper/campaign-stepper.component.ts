import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-campaign-stepper',
  standalone: true,
  templateUrl: './campaign-stepper.component.html',
  styleUrls: ['./campaign-stepper.component.css'],
})
export class CampaignStepperComponent {
  steps = [
    'פרטי בסיס',

    'סוג קמפיין',

    'מדיה',

    'יעדים',

    'תוכן',

    'תרומות',

    'פרסום',
  ];

  @Input()
  currentStep = 1;
}
