import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

// Reset availability is explicit. No legacy destructive reset is restored.
export interface CampaignResetStatus {
  campaignId: string;
  campaignTitle: string;
  available: boolean;
  code: string | null;
  snapshotHash: string;
  counts: Record<string, number>;
  totalRecords: number;
  recordIds: Record<string, string[]>;
  message: string;
}

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
  campaignId: string;
  backupId: string;
  deleted: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class CampaignResetService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/platform/campaign-reset`;

  getStatus(campaignId: string): Observable<{ status: CampaignResetStatus }> {
    return this.http.get<{ status: CampaignResetStatus }>(`${this.base}/${campaignId}/status`, { headers: authHeaders() });
  }

  getPreview(campaignId: string): Observable<{ preview: CampaignResetPreview }> {
    return this.http.get<{ preview: CampaignResetPreview }>(`${this.base}/${campaignId}/preview`, { headers: authHeaders() });
  }

  reset(campaignId: string, reason: string, campaignTitle: string, expectedSnapshotHash: string): Observable<{ result: CampaignResetResult }> {
    return this.http.post<{ result: CampaignResetResult }>(`${this.base}/${campaignId}/reset`, { reason, campaignTitle, expectedSnapshotHash, confirmed: true }, { headers: authHeaders() });
  }
}
