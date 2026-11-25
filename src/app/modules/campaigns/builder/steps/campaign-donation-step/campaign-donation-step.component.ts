import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CampaignStudioStateService,
  CampaignDraft,
} from '../../../services/campaign-studio-state.service';

import { HmIconComponent } from '../../../../../shared/ui/design-system/icon.component';
import { DEFAULT_FOREIGN_PRESETS, ForeignCurrency, currencySymbol, currencyLabel, presetsFor } from '../../../utils/donation-currency';
import { DonationCurrencyService } from '../../../services/donation-currency.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { MAX_SUGGESTED_AMOUNTS } from '../../../utils/amount-buttons';
@Component({
  selector: 'app-campaign-donation-step',
  standalone: true,
  imports: [TranslocoPipe, HmIconComponent, CommonModule],
  templateUrl: './campaign-donation-step.component.html',
  styleUrl: './campaign-donation-step.component.css',
})
export class CampaignDonationStepComponent {
  protected state = inject(CampaignStudioStateService);
  private currencies = inject(DonationCurrencyService);

  readonly maxAmounts = MAX_SUGGESTED_AMOUNTS;

  get draft() { return this.state.draft; }

  constructor() { this.currencies.load(); }

  // ── Donation currencies (2026-11) ──
  // ILS is always offered; USD/EUR are opt-in per campaign, with presets of
  // their own (round amounts in that currency, never converted shekels).
  readonly foreignCurrencies: readonly ForeignCurrency[] = ['USD', 'EUR'];
  readonly currencySymbol = currencySymbol;
  readonly currencyLabel = currencyLabel;

  offersCurrency(code: ForeignCurrency): boolean {
    return (this.draft.layout.donationCurrencies ?? []).includes(code);
  }

  platformEnabled(code: ForeignCurrency): boolean { return this.currencies.isEnabled(code); }

  toggleCurrency(code: ForeignCurrency): void {
    const current = this.draft.layout.donationCurrencies ?? [];
    const next = current.includes(code) ? current.filter(c => c !== code) : this.foreignCurrencies.filter(c => c === code || current.includes(c));
    this.state.patch({ layout: { ...this.draft.layout, donationCurrencies: next } });
  }

  currencyPresets(code: ForeignCurrency): number[] {
    return presetsFor(this.draft, code, 'one-time');
  }

  private setCurrencyPresets(code: ForeignCurrency, oneTime: number[]): void {
    const all = { ...(this.draft.layout.currencyPresets ?? {}) };
    all[code] = { ...(all[code] ?? {}), oneTime };
    this.state.patch({ layout: { ...this.draft.layout, currencyPresets: all } });
  }

  updateCurrencyPreset(code: ForeignCurrency, index: number, value: number): void {
    const list = [...this.currencyPresets(code)];
    list[index] = value > 0 ? value : 1;
    this.setCurrencyPresets(code, list);
  }

  removeCurrencyPreset(code: ForeignCurrency, index: number): void {
    this.setCurrencyPresets(code, this.currencyPresets(code).filter((_, i) => i !== index));
  }

  addCurrencyPreset(code: ForeignCurrency): void {
    const list = this.currencyPresets(code);
    if (list.length >= 6) return;
    this.setCurrencyPresets(code, [...list, (list.at(-1) ?? DEFAULT_FOREIGN_PRESETS[code].oneTime[0]) * 2]);
  }

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
    if (this.draft.suggestedAmounts.length >= this.maxAmounts) return;
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
