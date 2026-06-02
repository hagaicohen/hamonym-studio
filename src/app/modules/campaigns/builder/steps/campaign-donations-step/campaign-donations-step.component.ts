import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CampaignStudioStateService } from '../../../../campaigns/services/campaign-studio-state.service';

@Component({
  selector: 'app-campaign-donations-step',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './campaign-donations-step.component.html',
  styleUrls: ['./campaign-donations-step.component.css'],
})
export class CampaignDonationsStepComponent {

  protected campaignState = inject(CampaignStudioStateService);

  get draft() { return this.campaignState.draft; }

  newSuggestedAmount = '';
  newMonthlyAmount = '';

  sync(): void { this.campaignState.sync(); }

  private formatAmount(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits ? Number(digits).toLocaleString('en-US') : '';
  }

  onSuggestedAmountInput(event: Event): void {
    this.newSuggestedAmount = this.formatAmount((event.target as HTMLInputElement).value);
  }

  onMonthlyAmountInput(event: Event): void {
    this.newMonthlyAmount = this.formatAmount((event.target as HTMLInputElement).value);
  }

  addSuggestedAmount(): void {
    const amount = Number(this.newSuggestedAmount.replaceAll(',', ''));
    if (!amount || this.draft.suggestedAmounts.includes(amount)) return;
    if (this.draft.suggestedAmounts.length >= 8) return;
    const updated = [...this.draft.suggestedAmounts, amount].sort((a, b) => a - b);
    this.campaignState.patch({ suggestedAmounts: updated });
    this.newSuggestedAmount = '';
  }

  addMonthlyAmount(): void {
    const amount = Number(this.newMonthlyAmount.replaceAll(',', ''));
    if (!amount || this.draft.monthlyAmounts.includes(amount)) return;
    if (this.draft.monthlyAmounts.length >= 8) return;
    const updated = [...this.draft.monthlyAmounts, amount].sort((a, b) => a - b);
    this.campaignState.patch({ monthlyAmounts: updated });
    this.newMonthlyAmount = '';
  }

  removeSuggestedAmount(amount: number): void {
    this.campaignState.patch({ suggestedAmounts: this.draft.suggestedAmounts.filter(x => x !== amount) });
  }

  removeMonthlyAmount(amount: number): void {
    this.campaignState.patch({ monthlyAmounts: this.draft.monthlyAmounts.filter(x => x !== amount) });
  }
}
