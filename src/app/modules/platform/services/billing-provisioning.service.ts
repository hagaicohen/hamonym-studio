import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

export interface UnprovisionedEntity {
  id: string;
  display_name: string;
  declared_billing_method: string | null;
  paid_donation_count: number;
  paid_gross_total: string;
}

export interface BillingAccount {
  id: string;
  entity_id: string;
  fee_rate: string;
  vat_rate: string;
  preferred_collection_method: 'card' | 'masav';
  enforcement_status: 'active' | 'suspended';
  masav_ceiling: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBillingAccountPayload {
  entityId: string;
  feeRate: number;
  vatRate: number;
  preferredCollectionMethod: 'card' | 'masav';
  notes?: string;
}

// One combined billing-readiness row per active entity, whether or not it
// has a billing_account yet -- backs the "הגדרות עמותות" tab (UX
// simplification pass, 2026-09-14). See provisioning.service.js#
// listBillingReadiness for the exact projection.
export interface BillingReadinessEntity {
  id: string;
  display_name: string;
  billing_account_id: string | null;
  fee_rate: string | null;
  vat_rate: string | null;
  enforcement_status: 'active' | 'suspended' | null;
  preferred_collection_method: 'card' | 'masav' | null;
  masav_authorized: boolean | null;
  masav_configured: boolean;
  paid_donation_count: number;
  paid_gross_total: string;
}

@Injectable({ providedIn: 'root' })
export class BillingProvisioningService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/platform/billing-accounts`;

  getUnprovisioned(): Observable<{ entities: UnprovisionedEntity[] }> {
    return this.http.get<{ entities: UnprovisionedEntity[] }>(`${this.base}/unprovisioned`, {
      headers: authHeaders(),
    });
  }

  getReadiness(): Observable<{ entities: BillingReadinessEntity[] }> {
    return this.http.get<{ entities: BillingReadinessEntity[] }>(`${this.base}/readiness`, {
      headers: authHeaders(),
    });
  }

  getByEntityId(entityId: string): Observable<{ account: BillingAccount | null }> {
    return this.http.get<{ account: BillingAccount | null }>(`${this.base}/${entityId}`, {
      headers: authHeaders(),
    });
  }

  create(payload: CreateBillingAccountPayload): Observable<{ account: BillingAccount }> {
    return this.http.post<{ account: BillingAccount }>(`${this.base}/`, payload, {
      headers: authHeaders(),
    });
  }
}
