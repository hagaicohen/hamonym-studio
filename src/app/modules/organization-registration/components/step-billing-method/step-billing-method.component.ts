import {
  Component,
  EventEmitter,
  OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { OrganizationRegistrationStateService } from '../../services/organization-registration-state.service';

import { OpenfieldsFormComponent } from '../../../billing/components/openfields-form/openfields-form.component';

type PaymentMethod = 'credit-card' | 'masav';

@Component({
  selector: 'app-step-billing-method',

  standalone: true,

  imports: [CommonModule, FormsModule, OpenfieldsFormComponent],

  templateUrl: './step-billing-method.component.html',

  styleUrls: ['./step-billing-method.component.css'],
})
export class StepBillingMethodComponent implements OnInit {
  @Output()
  back = new EventEmitter<void>();

  @Output()
  continue = new EventEmitter<void>();

  @ViewChild(OpenfieldsFormComponent)
  openfieldsForm?: OpenfieldsFormComponent;

  readonly stateService = inject(OrganizationRegistrationStateService);

  paymentMethod: PaymentMethod = 'credit-card';

  continueLater = false;

  isSaving = false;

  saveCompleted = false;

  // OpenfieldsFormComponent silently no-ops (never initializes CardCom's
  // real card-number/CVV iframes, leaving the static "0000 0000..."
  // skeleton showing forever, non-interactive) if it doesn't get a real
  // entityId — see its own ngOnInit guard. entityId is only ever set by an
  // explicit save (see OrganizationRegistrationState.entityId doc comment),
  // and nothing before this step required the visitor to click "שמור
  // טיוטה" — so arriving here straight from step 4 left entityId still
  // null and the card fields permanently dead. Silently draft-saving on
  // arrival (same canSaveDraft fields step 1 already required) fixes this
  // without asking the visitor to do anything extra. Found 2026-09-23.
  ensuringEntity = false;
  ensureEntityError: string | null = null;

  constructor() {
    const state = this.stateService.state();

    this.paymentMethod = state.paymentMethod as PaymentMethod;

    this.continueLater = state.continueLater;
  }

  ngOnInit(): void {
    if (this.stateService.state().entityId) return;
    this.ensuringEntity = true;
    this.stateService.save({ includeBilling: false }).subscribe({
      next: () => { this.ensuringEntity = false; },
      error: (err) => {
        this.ensuringEntity = false;
        this.ensureEntityError = err?.error?.error || 'לא ניתן היה לשמור את פרטי העמותה. נסו לחזור לשלב הקודם ולהמשיך שוב.';
      },
    });
  }

  private syncState(): void {
    this.stateService.updateState({
      paymentMethod: this.paymentMethod,

      continueLater: this.continueLater,
    });
  }

  get isCreditCard(): boolean {
    return this.paymentMethod === 'credit-card';
  }

  get isMasav(): boolean {
    return this.paymentMethod === 'masav';
  }

  // MASAV bank authorization is completed in Association Settings after
  // registration (see entity-billing-section-edit.component.ts -- the one
  // real, persisted MASAV implementation) -- there is nothing left to
  // require at this step once MASAV is selected. 2026-09-10: this step
  // used to require a local file "upload" first, but that file was never
  // actually sent to the backend -- it only set local component state, so
  // the step claimed a save that never happened.
  get canContinue(): boolean {
    return true;
  }

  get submitButtonText(): string {
    if (this.isSaving) {
      return 'ממשיך...';
    }

    return 'המשך';
  }

  selectPaymentMethod(method: PaymentMethod): void {
    this.paymentMethod = method;

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

    if (this.isCreditCard && !this.continueLater) {
      const success = await this.openfieldsForm?.tokenize();

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
    this.saveCompleted = false;
  }
}
