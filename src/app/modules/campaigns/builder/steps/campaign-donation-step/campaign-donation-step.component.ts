import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CampaignStudioStateService,
  CampaignDraft,
} from '../../../services/campaign-studio-state.service';

@Component({
  selector: 'app-campaign-donation-step',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaign-donation-step.component.html',
  styleUrl: './campaign-donation-step.component.css',
})
export class CampaignDonationStepComponent {
  protected state = inject(CampaignStudioStateService);

  get draft() { return this.state.draft; }

  patchDraft(partial: Partial<CampaignDraft>): void {
    this.state.patch(partial);
  }

  // ── Suggested amounts ──

  updateAmount(index: number, value: number): void {
    const amounts = [...this.draft.suggestedAmounts];
    amounts[index] = value > 0 ? value : 1;
    this.state.patch({ suggestedAmounts: amounts });
  }

  removeAmount(index: number): void {
    const amounts = this.draft.suggestedAmounts.filter((_, i) => i !== index);
    this.state.patch({ suggestedAmounts: amounts });
  }

  addAmount(): void {
    if (this.draft.suggestedAmounts.length >= 6) return;
    const last = this.draft.suggestedAmounts.at(-1) ?? 100;
    this.state.patch({ suggestedAmounts: [...this.draft.suggestedAmounts, last * 2] });
  }

  // ── Monthly amounts ──

  updateMonthlyAmount(index: number, value: number): void {
    const amounts = [...this.draft.monthlyAmounts];
    amounts[index] = value > 0 ? value : 1;
    this.state.patch({ monthlyAmounts: amounts });
  }

  removeMonthlyAmount(index: number): void {
    const amounts = this.draft.monthlyAmounts.filter((_, i) => i !== index);
    this.state.patch({ monthlyAmounts: amounts });
  }

  addMonthlyAmount(): void {
    if (this.draft.monthlyAmounts.length >= 6) return;
    const last = this.draft.monthlyAmounts.at(-1) ?? 50;
    this.state.patch({ monthlyAmounts: [...this.draft.monthlyAmounts, last * 2] });
  }

  // ── Recurring billing mode (docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §9.3) ──

  updateInstallmentsCount(value: number): void {
    this.state.patch({ recurringInstallmentsCount: value > 0 ? value : 1 });
  }
}
