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

  // Steps that exist in the fixed 1-10 numbering but aren't applicable right
  // now (e.g. "הרשמה" for an ongoing campaign) — shown greyed out rather
  // than removed from the list, so the numbering/count never shifts.
  @Input() disabledSteps: number[] = [];

  get steps(): string[] {
    return CampaignStepperComponent.BASE_STEPS;
  }

  @Output() stepSelected = new EventEmitter<number>();

  // Free navigation — the manager can jump to any step in any order (e.g.
  // 1 → 4 → 2), not just sequentially or only once already in edit mode.
  // The editor saves the draft on every transition, so nothing is lost.
  selectStep(index: number): void {
    if (this.disabledSteps.includes(index + 1)) return;
    this.stepSelected.emit(index + 1);
  }
}
