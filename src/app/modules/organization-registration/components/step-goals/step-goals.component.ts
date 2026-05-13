import { Component, EventEmitter, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { OrganizationRegistrationStateService } from '../../services/organization-registration-state.service';

@Component({
  selector: 'app-step-goals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './step-goals.component.html',
  styleUrls: ['./step-goals.component.css'],
})
export class StepGoalsComponent {
  @Output()
  back = new EventEmitter<void>();

  @Output()
  continue = new EventEmitter<void>();

  constructor(
    private readonly stateService: OrganizationRegistrationStateService,
  ) {}

  // =========================
  // HELPERS
  // =========================

  private updateState(partial: any): void {
    this.stateService.updateState(partial);
  }

  private get state() {
    return this.stateService.state();
  }

  // =========================
  // MONTHLY GOAL
  // =========================

  get monthlyGoal(): string {
    return this.state.monthlyGoal;
  }

  set monthlyGoal(value: string) {
    this.updateState({
      monthlyGoal: value,
    });
  }

  // =========================
  // YEARLY GOAL
  // =========================

  get yearlyGoal(): string {
    return this.state.yearlyGoal;
  }

  set yearlyGoal(value: string) {
    this.updateState({
      yearlyGoal: value,
    });
  }

  // =========================
  // VALIDATION
  // =========================

  get canContinue(): boolean {
    return !!(this.monthlyGoal && this.yearlyGoal);
  }

  onMoneyInput(type: 'monthly' | 'yearly', value: string): void {
    const numericValue = value.replace(/\D/g, '');

    const formattedValue = Number(numericValue || 0).toLocaleString('en-US');

    if (type === 'monthly') {
      this.monthlyGoal = numericValue ? formattedValue : '';

      return;
    }

    this.yearlyGoal = numericValue ? formattedValue : '';
  }
}
