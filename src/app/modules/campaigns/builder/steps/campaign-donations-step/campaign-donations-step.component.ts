import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-campaign-donations-step',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl:
    './campaign-donations-step.component.html',
  styleUrls: [
    './campaign-donations-step.component.css'
  ]
})
export class CampaignDonationsStepComponent {

  enableSuggestedAmounts =
    true;

  allowCustomAmount =
    true;

  allowMonthlyDonation =
    true;

  suggestedAmounts = [
    50,
    100,
    180,
    360,
    500,
    1000
  ];

  monthlyAmounts = [
    18,
    36,
    54,
    100
  ];

  newSuggestedAmount =
    '';

  newMonthlyAmount =
    '';

  formatAmount(
    value: string
  ): string {

    const digits =
      value.replace(
        /\D/g,
        ''
      );

    if (!digits) {
      return '';
    }

    return Number(
      digits
    ).toLocaleString(
      'en-US'
    );

  }

  onSuggestedAmountInput(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    this.newSuggestedAmount =
      this.formatAmount(
        input.value
      );

  }

  onMonthlyAmountInput(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    this.newMonthlyAmount =
      this.formatAmount(
        input.value
      );

  }

  addSuggestedAmount(): void {

    const amount =
      Number(
        this.newSuggestedAmount
          .replaceAll(',', '')
      );

    if (!amount) {
      return;
    }

    if (
      this.suggestedAmounts.includes(
        amount
      )
    ) {
      return;
    }

    if (
      this.suggestedAmounts.length >= 8
    ) {
      return;
    }

    this.suggestedAmounts.push(
      amount
    );

    this.suggestedAmounts.sort(
      (a, b) => a - b
    );

    this.newSuggestedAmount =
      '';

  }

  addMonthlyAmount(): void {

    const amount =
      Number(
        this.newMonthlyAmount
          .replaceAll(',', '')
      );

    if (!amount) {
      return;
    }

    if (
      this.monthlyAmounts.includes(
        amount
      )
    ) {
      return;
    }

    if (
      this.monthlyAmounts.length >= 8
    ) {
      return;
    }

    this.monthlyAmounts.push(
      amount
    );

    this.monthlyAmounts.sort(
      (a, b) => a - b
    );

    this.newMonthlyAmount =
      '';

  }

  removeSuggestedAmount(
    amount: number
  ): void {

    this.suggestedAmounts =
      this.suggestedAmounts.filter(
        x => x !== amount
      );

  }

  removeMonthlyAmount(
    amount: number
  ): void {

    this.monthlyAmounts =
      this.monthlyAmounts.filter(
        x => x !== amount
      );

  }

}