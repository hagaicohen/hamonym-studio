import {
  Component,
  EventEmitter,
  Output
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  FormsModule
} from '@angular/forms';

@Component({
  selector: 'app-step-goals',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './step-goals.component.html',
  styleUrls: ['./step-goals.component.css']
})
export class StepGoalsComponent {

  @Output()
  back =
    new EventEmitter<void>();

  @Output()
  continue =
    new EventEmitter<void>();

  monthlyGoal = '';

  yearlyGoal = '';

  get canContinue(): boolean {

    return !!(
      this.monthlyGoal &&
      this.yearlyGoal
    );

  }

}