// step-payment.component.ts

import { Component, EventEmitter, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { OrganizationRegistrationStateService } from '../../services/organization-registration-state.service';

@Component({
  selector: 'app-step-payment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './step-payment.component.html',
  styleUrls: ['./step-payment.component.css'],
})
export class StepPaymentComponent {
  @Output()
  back = new EventEmitter<void>();

  @Output()
  continue = new EventEmitter<void>();

  provider = 'cardcom';

  terminalNumber = '';

  apiUsername = '';

  apiPassword = '';

  useExistingTerminal = false;

  isCheckingConnection = false;

  connectionSuccess = false;

  connectionError = '';

  connectionAttempted = false;

  constructor(
    private readonly stateService: OrganizationRegistrationStateService,
  ) {
    this.loadState();
  }

  // =========================
  // LOAD STATE
  // =========================

  loadState(): void {
    const state = this.stateService.state();

    this.provider = state.provider;

    this.terminalNumber = state.terminalNumber;

    this.apiUsername = state.apiUsername;

    this.apiPassword = state.apiPassword;

    this.useExistingTerminal = state.useExistingTerminal;

    this.connectionSuccess = state.connectionSuccess;

    this.connectionAttempted = state.connectionAttempted || false;
  }

  // =========================
  // SAVE STATE
  // =========================

  saveState(): void {
    this.stateService.updateState({
      provider: this.provider,

      terminalNumber: this.terminalNumber,

      apiUsername: this.apiUsername,

      apiPassword: this.apiPassword,

      useExistingTerminal: this.useExistingTerminal,

      connectionSuccess: this.connectionSuccess,

      connectionAttempted: this.connectionAttempted,
    });
  }

  // =========================
  // VALIDATION
  // =========================

  get canContinue(): boolean {
    if (this.useExistingTerminal) {
      return true;
    }

    return !!(
      this.provider &&
      this.terminalNumber.trim() &&
      this.apiUsername.trim() &&
      this.apiPassword.trim()
    );
  }

  // =========================
  // CONNECTION TEST
  // =========================

  testConnection(): void {
    this.isCheckingConnection = true;

    this.connectionSuccess = false;

    this.connectionError = '';

    this.connectionAttempted = true;

    setTimeout(() => {
      this.isCheckingConnection = false;

      // TODO:
      // כאן תהיה בעתיד בדיקת API אמיתית מול קארדקום

      this.connectionSuccess = false;

      this.connectionError = 'החיבור למסוף נכשל';

      this.saveState();
    }, 1200);
  }

  // =========================
  // CONTINUE
  // =========================

  onContinue(): void {
    this.saveState();

    this.continue.emit();
  }

  // =========================
  // BACK
  // =========================

  onBack(): void {
    this.saveState();

    this.back.emit();
  }
}
