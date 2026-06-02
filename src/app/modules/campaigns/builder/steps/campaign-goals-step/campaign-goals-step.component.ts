import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CampaignStudioStateService } from '../../../../campaigns/services/campaign-studio-state.service';

@Component({
  selector: 'app-campaign-goals-step',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './campaign-goals-step.component.html',
  styleUrl: './campaign-goals-step.component.css',
})
export class CampaignGoalsStepComponent implements OnInit {

  protected campaignState = inject(CampaignStudioStateService);

  get draft() { return this.campaignState.draft; }

  targetAmountDisplay = '';

  targetTouched = false;
  startDateTouched = false;
  endDateTouched = false;

  ngOnInit(): void {
    if (this.draft.targetAmount > 0) {
      this.targetAmountDisplay = this.draft.targetAmount.toLocaleString('en-US');
    }
  }

  sync(): void { this.campaignState.sync(); }

  allowMoneyChars(event: KeyboardEvent): void {
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
    if (allowedKeys.includes(event.key)) return;
    if (!/^\d$/.test(event.key)) event.preventDefault();
  }

  onTargetChange(value: string): void {
    const digits = value.replace(/\D/g, '');
    const num = Number(digits || 0);
    this.targetAmountDisplay = num ? num.toLocaleString('en-US') : '';
    this.campaignState.patch({ targetAmount: num });
  }

  isTargetInvalid(): boolean {
    return this.targetTouched && !this.draft.targetAmount;
  }

  isDateRangeInvalid(): boolean {
    if (!this.draft.startDate || !this.draft.endDate) return false;
    return new Date(this.draft.endDate) < new Date(this.draft.startDate);
  }

  getCampaignDays(): number {
    if (!this.draft.startDate || !this.draft.endDate) return 0;
    const diff = new Date(this.draft.endDate).getTime() - new Date(this.draft.startDate).getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  getDonors200(): string {
    return Math.ceil(this.draft.targetAmount / 200).toLocaleString('en-US');
  }

  getDonors100(): string {
    return Math.ceil(this.draft.targetAmount / 100).toLocaleString('en-US');
  }
}
