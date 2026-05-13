// step-billing-method.component.ts

import { Component, EventEmitter, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { OrganizationRegistrationStateService } from '../../services/organization-registration-state.service';

type PaymentMethod = 'credit-card' | 'masav';

@Component({
  selector: 'app-step-billing-method',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './step-billing-method.component.html',
  styleUrls: ['./step-billing-method.component.css'],
})
export class StepBillingMethodComponent {
  @Output()
  back = new EventEmitter<void>();

  @Output()
  continue = new EventEmitter<void>();

  paymentMethod: PaymentMethod = 'credit-card';

  cardHolderName = '';

  cardNumber = '';

  expiry = '';

  cvv = '';

  masavUploaded = false;

  masavFileName = '';

  continueLater = false;

  isSaving = false;

  saveCompleted = false;

  constructor(
    private readonly stateService: OrganizationRegistrationStateService,
  ) {
    const state = this.stateService.state();

    this.paymentMethod = state.paymentMethod as PaymentMethod;

    this.cardHolderName = state.cardHolderName;

    this.cardNumber = state.cardNumber;

    this.expiry = state.expiry;

    this.cvv = state.cvv;

    this.masavUploaded = state.masavUploaded;

    this.masavFileName = state.masavFileName;

    this.continueLater = state.continueLater;
  }

  private syncState(): void {
    this.stateService.updateState({
      paymentMethod: this.paymentMethod,

      cardHolderName: this.cardHolderName,

      cardNumber: this.cardNumber,

      expiry: this.expiry,

      cvv: this.cvv,

      masavUploaded: this.masavUploaded,

      masavFileName: this.masavFileName,

      continueLater: this.continueLater,
    });
  }

  get isCreditCard(): boolean {
    return this.paymentMethod === 'credit-card';
  }

  get isMasav(): boolean {
    return this.paymentMethod === 'masav';
  }

  get isCreditCardValid(): boolean {
    return !!(
      this.cardHolderName.trim().length > 2 &&
      this.cardNumber.replace(/\s/g, '').length >= 16 &&
      this.expiry.trim().length >= 4 &&
      this.cvv.trim().length >= 3
    );
  }

  get canContinue(): boolean {
    if (this.continueLater) {
      return true;
    }

    if (this.isCreditCard) {
      return this.isCreditCardValid;
    }

    if (this.isMasav) {
      return this.masavUploaded;
    }

    return false;
  }

  get submitButtonText(): string {
    if (this.isSaving) {
      return 'ממשיך...';
    }

    if (this.continueLater) {
      return 'המשך';
    }

    return 'שמור והמשך';
  }

  selectPaymentMethod(method: PaymentMethod): void {
    this.paymentMethod = method;

    this.syncState();

    this.resetState();
  }

  savePaymentMethod(): void {
    if (!this.canContinue) {
      return;
    }

    this.isSaving = true;

    setTimeout(() => {
      this.isSaving = false;

      if (this.continueLater) {
        this.saveCompleted = false;

        this.syncState();

        this.continue.emit();

        return;
      }

      this.saveCompleted = true;

      this.syncState();

      this.continue.emit();
    }, 1200);
  }

  resetState(): void {
    this.saveCompleted = false;
  }

  onMasavFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!input.files?.length) {
      return;
    }

    const file = input.files[0];

    this.masavUploaded = true;

    this.masavFileName = file.name;

    this.syncState();

    this.resetState();
  }

  removeMasavFile(): void {
    this.masavUploaded = false;

    this.masavFileName = '';

    this.syncState();
  }

  formatCardNumber(): void {
    const rawValue = this.cardNumber.replace(/\s/g, '').replace(/[^0-9]/gi, '');

    const groups = rawValue.match(/.{1,4}/g);

    this.cardNumber = groups ? groups.join(' ') : '';

    this.syncState();
  }

  formatExpiry(): void {
    const rawValue = this.expiry.replace(/\D/g, '');

    if (rawValue.length >= 3) {
      this.expiry = rawValue.substring(0, 2) + '/' + rawValue.substring(2, 4);

      this.syncState();

      return;
    }

    this.expiry = rawValue;

    this.syncState();
  }

  onlyNumbers(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace',
      'ArrowLeft',
      'ArrowRight',
      'Tab',
      'Delete',
    ];

    if (allowedKeys.includes(event.key)) {
      return;
    }

    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }
}
