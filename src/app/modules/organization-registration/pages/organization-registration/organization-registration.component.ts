import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { StepEntityComponent } from '../../components/step-entity/step-entity.component';
import { StepProfileComponent } from '../../components/step-profile/step-profile.component';
import { StepGoalsComponent } from '../../components/step-goals/step-goals.component';
import { StepPaymentComponent } from '../../components/step-payment/step-payment.component';
import { StepReviewComponent } from '../../components/step-review/step-review.component';
import { StepBillingMethodComponent } from '../../components/step-billing-method/step-billing-method.component';

@Component({
  selector: 'app-organization-registration',
  standalone: true,
  imports: [
    CommonModule,
    StepEntityComponent,
    StepProfileComponent,
    StepGoalsComponent,
    StepPaymentComponent,
    StepReviewComponent,
    StepBillingMethodComponent,
  ],
  templateUrl: './organization-registration.component.html',
  styleUrls: ['./organization-registration.component.css'],
})
export class OrganizationRegistrationComponent {
  currentStep = 1;

  nextStep(): void {
    this.currentStep++;
  }

  previousStep(): void {
    this.currentStep--;
  }
}
