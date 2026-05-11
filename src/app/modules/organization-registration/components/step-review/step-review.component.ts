
// step-review.component.ts

import {
  Component,
  EventEmitter,
  Output,
  computed,
  inject
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  OrganizationRegistrationStateService
} from '../../services/organization-registration-state.service';

import { CAMPAIGN_TYPES } from '../../constants/campaign-types';

@Component({
  selector: 'app-step-review',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './step-review.component.html',
  styleUrls: ['./step-review.component.css']
})
export class StepReviewComponent {

  @Output()
  back =
    new EventEmitter<void>();

  @Output()
  submit =
    new EventEmitter<void>();

  campaignTypes = CAMPAIGN_TYPES; 
  
  getCampaignTypeLabel( id: string ): string { 
    return this.campaignTypes .find(x => x.id === id) ?.title || id; 
  }

  private readonly stateService =
    inject(
      OrganizationRegistrationStateService
    );

  protected readonly state =
    computed(() =>
      this.stateService.state()
    );

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

  get displayName(): string {

    return this.state().displayName;

  }

  get organizationDescription(): string {

    return this.state().organizationDescription;

  }

  get selectedCampaignTypes(): string[] {

    return this.state().selectedCampaignTypes;

  }

  get monthlyGoal(): string {

    return this.state().monthlyGoal;

  }

  get yearlyGoal(): string {

    return this.state().yearlyGoal;

  }

  get provider(): string {

    return this.state().provider;

  }

  get paymentMethod(): string {

    return this.state().paymentMethod;

  }

  get registrationCertificateUploaded(): boolean {

    return true;

  }

  get section46Uploaded(): boolean {

    return true;

  }

  get paymentMethodLabel(): string {

    if (
      this.paymentMethod === 'credit-card'
    ) {

      return 'כרטיס אשראי';

    }

    if (
      this.paymentMethod === 'masav'
    ) {

      return 'הוראת קבע';

    }

    return '-';

  }

  get connectionSuccess(): boolean {

    return this.state().connectionSuccess;

  }

  submitApplication(): void {

    this.submit.emit();

  }

}

