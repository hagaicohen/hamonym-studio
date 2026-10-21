import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

// Super Admin "סימולציה" tab, tool B -- read/write surface over the
// EXISTING campaign-reset.service.js. See that file's own header for the
// full reconciliation design (shared-statement handling, the existing
// applyStatementAdjustment rules it reuses, the all-or-nothing transaction
// shape).
export interface CampaignResetPreview {
  campaignId: string;
  campaignTitle: string;
  campaignSlug: string;
  entityId: string;
  entityName: string;
  donationCount: number;
  paidDonationCount: number;
  totalAmount: number;
  affectedStatementCount: number;
}

export interface CampaignResetResult {
  reset: boolean;
  reason?: string;
  campaignId: string;
  campaignTitle: string;
  donationsRemoved: number;
  receiptsRemoved?: number;
  emailLogsRemoved?: number;
  totalAmountRemoved: number;
  statementsAdjusted: Array<{ statementId: string; status: string; method: string; oldTotal: number; newTotal: number; delta?: number }>;
}

@Injectable({ providedIn: 'root' })
export class CampaignResetService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/platform/campaign-reset`;

  getPreview(campaignId: string): Observable<{ preview: CampaignResetPreview }> {
    return this.http.get<{ preview: CampaignResetPreview }>(`${this.base}/${campaignId}/preview`, { headers: authHeaders() });
  }

  reset(campaignId: string, reason: string): Observable<{ result: CampaignResetResult }> {
    return this.http.post<{ result: CampaignResetResult }>(`${this.base}/${campaignId}/reset`, { reason }, { headers: authHeaders() });
  }
}
