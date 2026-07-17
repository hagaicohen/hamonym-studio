import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-campaign-stepper',
  standalone: true,
  templateUrl: './campaign-stepper.component.html',
  styleUrls: ['./campaign-stepper.component.css'],
})
export class CampaignStepperComponent {
  private static readonly BASE_STEPS = [
    'פרטי בסיס',
    'סוג ויעד',
    'תרומה',
    'תשורות',
    'הרשמה',
    'חסויות',
    'שגרירים',
    'עדכונים',
    'בניית דף',
    'פרסום',
  ];

  @Input() currentStep = 1;
  @Input() editMode = false;

  get steps(): string[] {
    return CampaignStepperComponent.BASE_STEPS;
  }

  @Output() stepSelected = new EventEmitter<number>();

  // Free navigation — the manager can jump to any step in any order (e.g.
  // 1 → 4 → 2), not just sequentially or only once already in edit mode.
  // The editor saves the draft on every transition, so nothing is lost.
  selectStep(index: number): void {
    this.stepSelected.emit(index + 1);
  }
}
