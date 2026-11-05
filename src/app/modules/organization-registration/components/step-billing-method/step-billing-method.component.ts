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
import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';
import { BillingService } from '../../services/billing.service';
import { MASAV_PENDING_STATUS_LABEL } from '../../../../shared/constants/masav.constants';
import { firstValueFrom } from 'rxjs';

type PaymentMethod = 'credit-card' | 'masav';

@Component({
  selector: 'app-step-billing-method',

  standalone: true,

  imports: [HmIconComponent, CommonModule, FormsModule, OpenfieldsFormComponent],

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

  private readonly billingService = inject(BillingService);

  // The real entity_masav_details row -- the same document-only upload
  // endpoint Settings uses (entity-billing-section-edit), so the signed
  // mandate uploaded here shows up there and survives a reload.
  masavConfig: any = null;
  masavUploading = false;
  masavUploadError: string | null = null;
  readonly masavPendingStatusLabel = MASAV_PENDING_STATUS_LABEL;

  // A saved card is shown instead of the CardCom form until the visitor
  // asks to replace it.
  replacingCard = false;
  cardError: string | null = null;

  get savedCard() {
    return this.stateService.state().billingCard;
  }

  get showCardForm(): boolean {
    return !this.savedCard || this.replacingCard;
  }

  ngOnInit(): void {
    if (this.stateService.state().entityId) {
      this.loadSavedBilling();
      return;
    }
    this.ensuringEntity = true;
    this.stateService.save({ includeBilling: false }).subscribe({
      next: () => { this.ensuringEntity = false; this.loadSavedBilling(); },
      error: (err) => {
        this.ensuringEntity = false;
        this.ensureEntityError = err?.error?.error || 'לא ניתן היה לשמור את פרטי העמותה. נסו לחזור לשלב הקודם ולהמשיך שוב.';
      },
    });
  }

  private loadSavedBilling(): void {
    this.stateService.refreshBilling().subscribe({ error: () => {} });
    this.loadMasavConfig();
  }

  private loadMasavConfig(): void {
    const entityId = this.stateService.state().entityId;
    if (!entityId) return;
    this.billingService.getMasavConfig(entityId).subscribe({
      next: (res) => { this.masavConfig = res?.config ?? null; },
      error: () => {},
    });
  }

  onMasavFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const entityId = this.stateService.state().entityId;
    if (!file || !entityId || this.masavUploading) return;
    this.masavUploading = true;
    this.masavUploadError = null;
    this.billingService.uploadMasavAuthorizationDocument(entityId, file).subscribe({
      next: (res) => {
        this.masavUploading = false;
        this.masavConfig = res.config;
      },
      error: (err) => {
        this.masavUploading = false;
        this.masavUploadError = err?.error?.error || 'העלאת הקובץ נכשלה. נסו שוב.';
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

  // The signed mandate is optional here: bank details and the rest of the
  // MASAV setup are completed in Association Settings after registration
  // (entity-billing-section-edit.component.ts). 2026-09-10: an earlier
  // version required a local-only file "upload" that never reached the
  // backend; the upload above now persists through the real endpoint.
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

    if (this.isCreditCard && !this.continueLater && this.showCardForm) {
      this.cardError = null;
      const success = await this.openfieldsForm?.tokenize();
      // Only the backend's saved card counts, never CardCom's reply alone.
      const card = success ? await firstValueFrom(this.stateService.refreshBilling()).catch(() => null) : null;

      if (!card) {
        this.isSaving = false;
        this.cardError = 'שמירת הכרטיס לא אושרה. בדקו את הפרטים ונסו שוב.';

        return;
      }
      this.replacingCard = false;
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
