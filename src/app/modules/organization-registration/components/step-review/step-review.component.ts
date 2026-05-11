import {
  Component,
  EventEmitter,
  Output
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  FormsModule
} from '@angular/forms';

@Component({
  selector: 'app-step-review',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './step-review.component.html',
  styleUrls: ['./step-review.component.css']
})
export class StepReviewComponent {

  @Output()
  back =
    new EventEmitter<void>();

  @Output()
  continue =
    new EventEmitter<void>();

  acceptTerms = false;

  acceptPrivacy = false;

  organizationName =
    'עמותת אור לחיים';

  campaignTypes = [
    'תרומות חד־פעמיות',
    'תרומות קבועות'
  ];

  paymentProvider =
    'קארדקום';

  paymentConnected =
    true;

  get canContinue(): boolean {

    return (

      this.acceptTerms &&
      this.acceptPrivacy

    );

  }

  onContinue(): void {

    if (!this.canContinue) {

      return;

    }

    this.continue.emit();

  }

}