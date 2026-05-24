import {
  Component,
  EventEmitter,
  Output,
  ViewChild,
  inject
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

import {
  OpenfieldsFormComponent
} from '../../../billing/components/openfields-form/openfields-form.component';

type PaymentMethod =
  'credit-card' |
  'masav';

@Component({
  selector:
    'app-step-billing-method',

  standalone: true,

  imports: [

    CommonModule,

    FormsModule,

    OpenfieldsFormComponent

  ],

  templateUrl:
    './step-billing-method.component.html',

  styleUrls: [
    './step-billing-method.component.css'
  ],
})
export class StepBillingMethodComponent {

  @Output()
  back =
    new EventEmitter<void>();

  @Output()
  continue =
    new EventEmitter<void>();

  @ViewChild(OpenfieldsFormComponent)
  openfieldsForm?: OpenfieldsFormComponent;

  readonly stateService =
    inject(
      OrganizationRegistrationStateService
    );

  paymentMethod:
    PaymentMethod =
      'credit-card';

  masavUploaded = false;

  masavFileName = '';

  continueLater = false;

  isSaving = false;

  saveCompleted = false;

  constructor() {

    const state =
      this.stateService.state();

    this.paymentMethod =
      state.paymentMethod as PaymentMethod;

    this.masavUploaded =
      state.masavUploaded;

    this.masavFileName =
      state.masavFileName;

    this.continueLater =
      state.continueLater;

  }

  private syncState(): void {

    this.stateService.updateState({

      paymentMethod:
        this.paymentMethod,

      masavUploaded:
        this.masavUploaded,

      masavFileName:
        this.masavFileName,

      continueLater:
        this.continueLater,

    });

  }

  get isCreditCard(): boolean {

    return this.paymentMethod ===
      'credit-card';

  }

  get isMasav(): boolean {

    return this.paymentMethod ===
      'masav';

  }

  get canContinue(): boolean {

    if (this.continueLater) {
      return true;
    }

    if (this.isCreditCard) {
      return true;
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

    return 'המשך';

  }

  selectPaymentMethod(
    method: PaymentMethod
  ): void {

    this.paymentMethod =
      method;

    this.syncState();

    this.resetState();

  }

  async savePaymentMethod(): Promise<void> {

    if (this.isSaving) {
      return;
    }

    if (!this.canContinue) {
      return;
    }

    this.isSaving = true;

    if (
      this.isCreditCard &&
      !this.continueLater
    ) {

      const success =

        await this.openfieldsForm
          ?.tokenize();

      if (!success) {

        this.isSaving = false;

        return;
      }
    }

    this.isSaving = false;

    this.saveCompleted = true;

    this.syncState();

    this.continue.emit();

  }

  resetState(): void {

    this.saveCompleted =
      false;

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

    this.masavUploaded =
      true;

    this.masavFileName =
      file.name;

    this.syncState();

    this.resetState();

  }

  removeMasavFile(): void {

    this.masavUploaded =
      false;

    this.masavFileName =
      '';

    this.syncState();

  }

}