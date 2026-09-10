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
  // STATE
  // =========================

  protected readonly state = this.stateService.state;

  // =========================
  // HELPERS
  // =========================

  private updateState(partial: any): void {
    this.stateService.updateState(partial);
  }

  // =========================
  // MONTHLY GOAL
  // =========================

  get monthlyGoal(): string {
    return this.state().monthlyGoal;
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
    return this.state().yearlyGoal;
  }

  set yearlyGoal(value: string) {
    this.updateState({
      yearlyGoal: value,
    });
  }

  // =========================
  // VALIDATION
  // =========================

  // Neither label carries a "*" required marker, and both inputs show only
  // an example placeholder ("50,000"/"600,000") that never becomes a real
  // value unless the user actually types -- requiring both here silently
  // blocked continue with zero visible indication why. 2026-09-10, Launch
  // Closure live-walkthrough: same bug shape as step-profile's logo check,
  // fixed the same way (match the code to what the UI already promises).
  get canContinue(): boolean {
    return true;
  }

  cleanNumber(value: string): string {
    return value.replace(/\D/g, '');
  }
}
