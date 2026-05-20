// step-payment.component.ts

import { Component, EventEmitter, inject, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrganizationRegistrationStateService } from '../../services/organization-registration-state.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

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

  http = inject(HttpClient);

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

  const start =
    Date.now();

  this.isCheckingConnection = true;

  this.connectionSuccess = false;

  this.connectionError = '';

  this.connectionAttempted = true;

  this.http.post<any>(
    `${environment.apiUrl}/api/billing/cardcom/test-connection`,
    {
      terminalNumber:
        this.terminalNumber,

      apiName:
        this.apiUsername,

      apiPassword:
        this.apiPassword,

      environment:
        'sandbox'
    }
  ).subscribe({

    next: (res) => {

      const elapsed =
        Date.now() - start;

      const remaining =
        Math.max(0, 2000 - elapsed);

      setTimeout(() => {

        this.isCheckingConnection = false;

        this.connectionSuccess =
          res.success;

        this.connectionError =
          res.success
            ? ''
            : res.message;

        this.saveState();

      }, remaining);
    },

    error: () => {

      const elapsed =
        Date.now() - start;

      const remaining =
        Math.max(0, 1200 - elapsed);

      setTimeout(() => {

        this.isCheckingConnection = false;

        this.connectionSuccess = false;

        this.connectionError =
          'שגיאת שרת';

        this.saveState();

      }, remaining);
    }
  });
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
