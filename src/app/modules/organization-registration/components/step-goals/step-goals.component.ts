import {
  Component,
  EventEmitter,
  Output,
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  FormsModule
} from '@angular/forms';

import {
  OrganizationRegistrationStateService
} from '../../services/organization-registration-state.service';

@Component({
  selector: 'app-step-goals',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './step-goals.component.html',
  styleUrls: ['./step-goals.component.css'],
})
export class StepGoalsComponent {

  @Output()
  back =
    new EventEmitter<void>();

  @Output()
  continue =
    new EventEmitter<void>();

  constructor(
    private readonly stateService:
      OrganizationRegistrationStateService,
  ) {}

  // =========================
  // STATE
  // =========================

  protected readonly state = this.stateService.state;

  // =========================
  // HELPERS
  // =========================

  private updateState(
    partial: any
  ): void {

    this.stateService.updateState(
      partial
    );
  }

  // =========================
  // MONTHLY GOAL
  // =========================

  get monthlyGoal(): string {

    return this.state().monthlyGoal;
  }

  set monthlyGoal(
    value: string
  ) {

    this.updateState({

      monthlyGoal: value,

    });
  }

  // =========================
  // YEARLY GOAL
  // =========================

  get yearlyGoal(): string {

    return this.state().yearlyGoal;
  }

  set yearlyGoal(
    value: string
  ) {

    this.updateState({

      yearlyGoal: value,

    });
  }

  // =========================
  // VALIDATION
  // =========================

  get canContinue(): boolean {

    return !!(

      this.monthlyGoal &&
      this.yearlyGoal

    );
  }

  cleanNumber(value: string): string {
    return value.replace(/\D/g, '');
  }
}