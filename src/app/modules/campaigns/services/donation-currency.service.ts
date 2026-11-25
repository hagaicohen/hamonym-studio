import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import type { DonationCurrency } from '../utils/donation-currency';

export interface CurrencyAvailability {
  currencies: DonationCurrency[];
  recurringCurrencies: DonationCurrency[];
}

const ILS_ONLY: CurrencyAvailability = { currencies: ['ILS'], recurringCurrencies: ['ILS'] };

// Which currencies the platform accepts right now (GET /api/donations/currencies).
// ILS-only until the backend enables USD/EUR, and also whenever the request
// fails -- a donor is never offered a currency the server would refuse.
@Injectable({ providedIn: 'root' })
export class DonationCurrencyService {
  private http = inject(HttpClient);
  readonly availability = signal<CurrencyAvailability>(ILS_ONLY);
  private requested = false;

  load(): void {
    if (this.requested) return;
    this.requested = true;
    this.http.get<CurrencyAvailability>(`${environment.apiUrl}/api/donations/currencies`).subscribe({
      next: a => {
        const known = (list: unknown): DonationCurrency[] =>
          ['ILS', ...((Array.isArray(list) ? list : []) as string[]).filter(c => c === 'USD' || c === 'EUR')] as DonationCurrency[];
        this.availability.set({ currencies: known(a?.currencies), recurringCurrencies: known(a?.recurringCurrencies) });
      },
      error: () => this.availability.set(ILS_ONLY),
    });
  }

  isEnabled(code: DonationCurrency, recurring = false): boolean {
    const a = this.availability();
    return (recurring ? a.recurringCurrencies : a.currencies).includes(code);
  }
}
