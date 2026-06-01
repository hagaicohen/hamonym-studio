import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-campaign-goals-step',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './campaign-goals-step.component.html',
  styleUrl: './campaign-goals-step.component.css',
})
export class CampaignGoalsStepComponent {
  targetAmount = '';

targetTouched = false;

startDateTouched = false;

endDateTouched = false;

startDate =
  new Date()
    .toISOString()
    .split('T')[0];

endDate = (() => {

  const date =
    new Date();

  date.setDate(
    date.getDate() + 30
  );

  return date
    .toISOString()
    .split('T')[0];

})();

  allowMoneyChars(
    event: KeyboardEvent
  ): void {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'Tab',
      'Home',
      'End',
    ];

    if (
      allowedKeys.includes(
        event.key
      )
    ) {
      return;
    }

    if (
      !/^\d$/.test(
        event.key
      )
    ) {
      event.preventDefault();
    }
  }

  onTargetChange(
    value: string
  ): void {
    const digits =
      value.replace(
        /\D/g,
        ''
      );

    this.targetAmount =
      Number(
        digits || 0
      ).toLocaleString(
        'en-US'
      );
  }

  getNumericTarget(): number {
    return Number(
      this.targetAmount.replace(
        /,/g,
        ''
      )
    );
  }

  isTargetInvalid(): boolean {
    return (
      this.targetTouched &&
      !this.getNumericTarget()
    );
  }

  isDateRangeInvalid(): boolean {
    if (
      !this.startDate ||
      !this.endDate
    ) {
      return false;
    }

    return (
      new Date(
        this.endDate
      ) <
      new Date(
        this.startDate
      )
    );
  }

  getCampaignDays(): number {
    if (
      !this.startDate ||
      !this.endDate
    ) {
      return 0;
    }

    const start =
      new Date(
        this.startDate
      );

    const end =
      new Date(
        this.endDate
      );

    const diff =
      end.getTime() -
      start.getTime();

    return Math.ceil(
      diff /
        (1000 *
          60 *
          60 *
          24)
    );
  }

  getDonors200(): string {
    return Math.ceil(
      this.getNumericTarget() /
        200
    ).toLocaleString(
      'en-US'
    );
  }

  getDonors100(): string {
    return Math.ceil(
      this.getNumericTarget() /
        100
    ).toLocaleString(
      'en-US'
    );
  }
}