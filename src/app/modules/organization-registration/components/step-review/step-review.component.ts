// step-review.component.ts

import {
  Component,
  EventEmitter,
  Output,
  computed,
  inject,
} from '@angular/core';

import { CommonModule } from '@angular/common';

import { OrganizationRegistrationStateService } from '../../services/organization-registration-state.service';

import { CAMPAIGN_TYPES } from '../../constants/campaign-types';

import {
  ENTITY_CONFIGS,
  EntityConfig,
  EntityType,
} from '../../config/entity-config';

@Component({
  selector: 'app-step-review',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './step-review.component.html',
  styleUrls: ['./step-review.component.css'],
})
export class StepReviewComponent {
  @Output()
  back = new EventEmitter<void>();

  @Output()
  submit = new EventEmitter<void>();

  campaignTypes = CAMPAIGN_TYPES;

  private readonly stateService = inject(OrganizationRegistrationStateService);

  protected readonly state = computed(() => this.stateService.state());

  get entityConfig(): EntityConfig {
    return (
      ENTITY_CONFIGS[this.state().entityType as EntityType] ||
      ENTITY_CONFIGS.association
    );
  }

  // =========================================================
  // HELPERS
  // =========================================================

  getCampaignTypeLabel(id: string): string {
    return this.campaignTypes.find((x) => x.id === id)?.title || id;
  }

  get maskedCardNumber(): string {
    const raw = this.state().cardNumber?.replace(/\s/g, '');

    if (!raw) {
      return '-';
    }

    return '**** **** **** ' + raw.slice(-4);
  }

  get paymentMethodLabel(): string {
    if (this.state().paymentMethod === 'masav') {
      return 'הוראת קבע / מס"ב';
    }

    return 'כרטיס אשראי';
  }

  // =========================================================
  // ORGANIZATION
  // =========================================================

  get organizationName(): string {
    return this.state().organizationName;
  }

  get organizationNumber(): string {
    return this.state().organizationNumber;
  }

  get fullName(): string {
    return this.state().fullName;
  }

  get email(): string {
    return this.state().email;
  }

  get phone(): string {
    return this.state().phone;
  }

  get selectedCategories(): string[] {
    return this.state().selectedCategories || [];
  }

  // =========================================================
  // PROFILE
  // =========================================================

  get displayName(): string {
    return this.state().displayName;
  }

  get organizationDescription(): string {
    return this.state().organizationDescription;
  }

  get selectedCampaignTypes(): string[] {
    return this.state().selectedCampaignTypes;
  }

  // =========================================================
  // GOALS
  // =========================================================

  get monthlyGoal(): string {
    return this.state().monthlyGoal;
  }

  get yearlyGoal(): string {
    return this.state().yearlyGoal;
  }

  // =========================================================
  // PAYMENT TERMINAL
  // =========================================================

  get provider(): string {
    return this.state().provider;
  }

  get terminalNumber(): string {
    return this.state().terminalNumber;
  }

  get apiUsername(): string {
    return this.state().apiUsername;
  }

  get connectionSuccess(): boolean {
    return this.state().connectionSuccess;
  }

  get connectionAttempted(): boolean {
    return this.state().connectionAttempted;
  }

  get useExistingTerminal(): boolean {
    return this.state().useExistingTerminal;
  }

  // =========================================================
  // BILLING
  // =========================================================

  get paymentMethod(): string {
    return this.state().paymentMethod;
  }

  get cardHolderName(): string {
    return this.state().cardHolderName;
  }

  get expiry(): string {
    return this.state().expiry;
  }

  get masavUploaded(): boolean {
    return this.state().masavUploaded;
  }

  get masavFileName(): string {
    return this.state().masavFileName;
  }

  get continueLater(): boolean {
    return this.state().continueLater;
  }

  // =========================================================
  // DOCUMENTS
  // =========================================================

  get registrationCertificateUploaded(): boolean {
    return true;
  }

  get section46Uploaded(): boolean {
    return true;
  }

  // =========================================================
  // SUBMIT
  // =========================================================

  submitApplication(): void {
    this.submit.emit();
  }
}
