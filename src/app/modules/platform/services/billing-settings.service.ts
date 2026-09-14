import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

// One system-wide VAT rate, managed by Platform Admin in exactly one place
// (2026-09-14i). See platform-billing-settings.service.js on the backend --
// this is the read/write surface for that single settings row.
export interface PlatformBillingSetting {
  vat_rate: string;
  updated_at: string;
  updated_by: number | null;
}

@Injectable({ providedIn: 'root' })
export class BillingSettingsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/platform/billing-settings`;

  get(): Observable<{ setting: PlatformBillingSetting | null }> {
    return this.http.get<{ setting: PlatformBillingSetting | null }>(this.base, { headers: authHeaders() });
  }

  update(vatRate: number): Observable<{ setting: PlatformBillingSetting }> {
    return this.http.put<{ setting: PlatformBillingSetting }>(this.base, { vatRate }, { headers: authHeaders() });
  }
}
