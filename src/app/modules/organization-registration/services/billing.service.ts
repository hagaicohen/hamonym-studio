import { Injectable, inject } from '@angular/core';

import { HttpClient, HttpHeaders } from '@angular/common/http';

import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class BillingService {
  private http = inject(HttpClient);

  private authHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    });
  }

  createEntityBilling(payload: any) {
    return this.http.post(
      `${environment.apiUrl}/api/billing`,

      payload,

      { headers: this.authHeaders() },
    );
  }

  getPublicConfig() {
    return this.http.get(`${environment.apiUrl}/api/billing/public-config`);
  }

  createLowProfile(payload: any) {
    return this.http.post(
      `${environment.apiUrl}/api/billing/create-low-profile`,

      payload,

      { headers: this.authHeaders() },
    );
  }

  getLowProfileResult(lowProfileId: string) {
    return this.http.get(
      `${environment.apiUrl}/api/billing/low-profile-result/${lowProfileId}`,

      { headers: this.authHeaders() },
    );
  }
}
