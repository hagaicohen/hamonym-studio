import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type PaymentMethod =
  | 'credit-card'
  | 'masav';

@Component({
  selector: 'app-step-billing-method',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './step-billing-method.component.html',
  styleUrls: ['./step-billing-method.component.css']
})
export class StepBillingMethodComponent {

  paymentMethod: PaymentMethod = 'credit-card';

  // CREDIT CARD

  cardHolderName = '';

  cardNumber = '';

  expiry = '';

  cvv = '';

  // MASAV

  masavUploaded = false;

  masavFileName = '';

  // GENERAL

  continueLater = false;

  isSaving = false;

  saveCompleted = false;

  protected readonly history = history;

  // GETTERS

  get isCreditCard(): boolean {

    return this.paymentMethod === 'credit-card';

  }

  get isMasav(): boolean {

    return this.paymentMethod === 'masav';

  }

  get isCreditCardValid(): boolean {

    return !!(

      this.cardHolderName.trim().length > 2 &&
      this.cardNumber.trim().length >= 16 &&
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

  // ACTIONS

  selectPaymentMethod(
    method: PaymentMethod
  ): void {

    this.paymentMethod = method;

    this.resetState();

  }

 savePaymentMethod(): void {

    if (!this.canContinue) {

      return;

    }

    this.isSaving = true;

    setTimeout(() => {

      this.isSaving = false;

      // USER CHOSE TO COMPLETE LATER

      if (this.continueLater) {

        this.saveCompleted = false;

        return;

      }

      this.saveCompleted = true;

    }, 1200);

  }

  resetState(): void {

    this.saveCompleted = false;

  }

  onMasavFileSelected(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    if (!input.files?.length) {

      return;

    }

    const file =
      input.files[0];

    this.masavUploaded = true;

    this.masavFileName =
      file.name;

    this.resetState();

  }

  removeMasavFile(): void {

    this.masavUploaded = false;

    this.masavFileName = '';

  }

  formatCardNumber(): void {

    const rawValue = this.cardNumber
      .replace(/\s/g, '')
      .replace(/[^0-9]/gi, '');

    const groups =
      rawValue.match(/.{1,4}/g);

    this.cardNumber =
      groups
        ? groups.join(' ')
        : '';

  }

  formatExpiry(): void {

    const rawValue =
      this.expiry.replace(/\D/g, '');

    if (rawValue.length >= 3) {

      this.expiry =
        rawValue.substring(0, 2) +
        '/' +
        rawValue.substring(2, 4);

      return;

    }

    this.expiry = rawValue;

  }

  onlyNumbers(
    event: KeyboardEvent
  ): void {

    const allowedKeys = [
      'Backspace',
      'ArrowLeft',
      'ArrowRight',
      'Tab',
      'Delete'
    ];

    if (
      allowedKeys.includes(event.key)
    ) {

      return;

    }

    if (!/^\d$/.test(event.key)) {

      event.preventDefault();

    }

  }

}