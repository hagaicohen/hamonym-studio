import { ChangeDetectorRef, DestroyRef, Pipe, PipeTransform, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { CampaignContentLanguage, CampaignLang } from './content-language';

// Campaign-facing money (2026-11-09). Hebrew keeps its existing look (₪903);
// English shows the currency code right after the number, no space (903ILS),
// isolated left-to-right so it reads the same inside any direction.
// Display only: amounts are formatted, never changed.
const SYMBOLS: Record<string, string> = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' };
const LRI = '⁦';
const PDI = '⁩';

export function currencyMark(lang: CampaignLang, currency = 'ILS'): string {
  const code = (currency || 'ILS').toUpperCase();
  return lang === 'en' ? code : (SYMBOLS[code] ?? code);
}

function amountText(amount: number | string | null | undefined, lang: CampaignLang, maxFraction: number): string {
  const n = Number(amount) || 0;
  return n.toLocaleString(lang === 'en' ? 'en-US' : 'he-IL', { maximumFractionDigits: maxFraction });
}

export function formatMoney(amount: number | string | null | undefined, lang: CampaignLang, currency = 'ILS', maxFraction = 3): string {
  const text = amountText(amount, lang, maxFraction);
  return lang === 'en' ? LRI + text + currencyMark('en', currency) + PDI : currencyMark('he', currency) + text;
}

// For a translated sentence that carries its own currency sign in Hebrew
// ("{{amount}} ₪ לחודש"): the bare number in Hebrew, the full amount in English.
export function moneyArg(amount: number | string | null | undefined, lang: CampaignLang, currency = 'ILS', maxFraction = 3): string {
  return lang === 'en' ? formatMoney(amount, 'en', currency, maxFraction) : amountText(amount, 'he', maxFraction);
}

// The language money follows: the campaign's inside campaign content (the
// Studio canvas, the public page and its checkout), the interface's elsewhere.
function moneyLang(transloco: TranslocoService, ctx: CampaignContentLanguage | null): CampaignLang {
  return ctx?.lang() ?? (transloco.getActiveLang() === 'en' ? 'en' : 'he');
}

export function publicMoney(): {
  format: (amount: number | string | null | undefined, currency?: string) => string;
  arg: (amount: number | string | null | undefined, currency?: string) => string;
  mark: (currency?: string) => string;
} {
  const transloco = inject(TranslocoService);
  const ctx = inject(CampaignContentLanguage, { optional: true });
  return {
    format: (amount, currency) => formatMoney(amount, moneyLang(transloco, ctx), currency),
    arg: (amount, currency) => moneyArg(amount, moneyLang(transloco, ctx), currency),
    mark: currency => currencyMark(moneyLang(transloco, ctx), currency),
  };
}

// The language a money pipe follows, re-read when the interface language changes.
function pipeMoneyLang(): () => CampaignLang {
  const transloco = inject(TranslocoService);
  const ctx = inject(CampaignContentLanguage, { optional: true });
  const cdr = inject(ChangeDetectorRef);
  transloco.langChanges$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => cdr.markForCheck());
  return () => moneyLang(transloco, ctx);
}

//   {{ draft.currentAmount | hmMoney }}            → ₪903 / 903ILS
@Pipe({ name: 'hmMoney', standalone: true, pure: false })
export class HmMoneyPipe implements PipeTransform {
  private readonly lang = pipeMoneyLang();
  transform(amount: number | string | null | undefined, currency = 'ILS', maxFraction = 3): string {
    return formatMoney(amount, this.lang(), currency, maxFraction);
  }
}

//   {{ 'key' | hmPublic: { amount: (x | hmMoneyArg) } }}
@Pipe({ name: 'hmMoneyArg', standalone: true, pure: false })
export class HmMoneyArgPipe implements PipeTransform {
  private readonly lang = pipeMoneyLang();
  transform(amount: number | string | null | undefined, currency = 'ILS', maxFraction = 3): string {
    return moneyArg(amount, this.lang(), currency, maxFraction);
  }
}

//   <span class="hm-currency-symbol">{{ '' | hmCurrency }}</span>   → ₪ / ILS
@Pipe({ name: 'hmCurrency', standalone: true, pure: false })
export class HmCurrencyPipe implements PipeTransform {
  private readonly lang = pipeMoneyLang();
  transform(_: unknown, currency = 'ILS'): string {
    return currencyMark(this.lang(), currency);
  }
}
