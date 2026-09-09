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

  // MASAV self-service (association's own Settings page) -- same
  // entity_masav_details model the Super Admin Billing Ops MASAV drawer
  // uses, exposed here through an entity-ownership-checked route instead of
  // the superAdminGuard one. See billing.routes.js#/masav/:entityId.
  getMasavConfig(entityId: string) {
    return this.http.get<{ config: any }>(
      `${environment.apiUrl}/api/billing/masav/${entityId}`,

      { headers: this.authHeaders() },
    );
  }

  upsertMasavConfig(
    entityId: string,
    payload: { bankCode: string; branchCode: string; accountNumber: string; accountHolderName?: string },
  ) {
    return this.http.put<{ config: any }>(
      `${environment.apiUrl}/api/billing/masav/${entityId}`,

      payload,

      { headers: this.authHeaders() },
    );
  }

  uploadMasavAuthorizationDocument(entityId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.put<{ config: any }>(
      `${environment.apiUrl}/api/billing/masav/${entityId}/authorization-document`,

      formData,

      { headers: this.authHeaders() },
    );
  }

  downloadMasavAuthorizationDocument(entityId: string) {
    return this.http.get(
      `${environment.apiUrl}/api/billing/masav/${entityId}/authorization-document`,

      { headers: this.authHeaders(), responseType: 'blob' },
    );
  }
}
