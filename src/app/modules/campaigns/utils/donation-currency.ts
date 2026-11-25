import type { CampaignDraft } from '../services/campaign-studio-state.service';

// Donation currencies (backend: src/modules/currency/currency.config.js).
// The campaign goal and progress stay in ILS; a USD/EUR donation is charged in
// its own currency and counted toward the goal by its ILS equivalent.
export type DonationCurrency = 'ILS' | 'USD' | 'EUR';
export type ForeignCurrency = Exclude<DonationCurrency, 'ILS'>;

export const DONATION_CURRENCIES: readonly { code: DonationCurrency; symbol: string; label: string }[] = [
  { code: 'ILS', symbol: '₪', label: 'שקל' },
  { code: 'USD', symbol: '$', label: 'דולר' },
  { code: 'EUR', symbol: '€', label: 'אירו' },
];

const FOREIGN: readonly ForeignCurrency[] = ['USD', 'EUR'];

// Starting presets for a foreign currency until the manager sets their own --
// round amounts that are natural in that currency, never shekel presets
// converted at some rate.
export const DEFAULT_FOREIGN_PRESETS: Readonly<Record<ForeignCurrency, { oneTime: number[]; monthly: number[] }>> = {
  USD: { oneTime: [18, 36, 54, 100, 180, 360], monthly: [10, 18, 36, 54] },
  EUR: { oneTime: [18, 36, 54, 100, 180, 360], monthly: [10, 18, 36, 54] },
};

export function currencySymbol(code: DonationCurrency | string | null | undefined): string {
  return DONATION_CURRENCIES.find(c => c.code === code)?.symbol ?? '₪';
}

export function currencyLabel(code: DonationCurrency): string {
  return DONATION_CURRENCIES.find(c => c.code === code)?.label ?? code;
}

export function formatMoney(amount: number, code: DonationCurrency | string | null | undefined = 'ILS'): string {
  return currencySymbol(code) + Number(amount || 0).toLocaleString('he-IL');
}

// The currencies this campaign offers donors: ILS always, plus whichever of
// USD/EUR the manager turned on (layout.donationCurrencies).
export function campaignCurrencies(draft: Pick<CampaignDraft, 'layout'>): DonationCurrency[] {
  const extra = (draft.layout?.donationCurrencies ?? []).filter((c): c is ForeignCurrency => FOREIGN.includes(c as ForeignCurrency));
  return ['ILS', ...FOREIGN.filter(c => extra.includes(c))];
}

// Presets for the selected currency and frequency. ILS keeps the campaign's
// own suggested/monthly amounts exactly as before.
export function presetsFor(
  draft: Pick<CampaignDraft, 'layout' | 'suggestedAmounts' | 'monthlyAmounts'>,
  currency: DonationCurrency,
  frequency: 'one-time' | 'monthly',
): number[] {
  if (currency === 'ILS') return frequency === 'monthly' ? draft.monthlyAmounts : draft.suggestedAmounts;
  const own = draft.layout?.currencyPresets?.[currency];
  const list = frequency === 'monthly' ? own?.monthly : own?.oneTime;
  return list && list.length ? list : DEFAULT_FOREIGN_PRESETS[currency][frequency === 'monthly' ? 'monthly' : 'oneTime'];
}
