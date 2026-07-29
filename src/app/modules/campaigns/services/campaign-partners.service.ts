import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface CampaignPartner {
  id: string;
  campaignId: string;
  partnerEntityId: string;
  rewardId: string | null;
  order: number;
  visible: boolean;
  coupon: string | null;
  campaignMessage: string | null;
  createdAt: string;
  updatedAt: string;
  partnerDisplayName?: string;
  partnerDeleted?: boolean;
  partnerHidden?: boolean;
}

// Phase 2 (Domain) built the backend; this is the first frontend consumer
// of it, added in Phase 4 (Partner Management, Epic 4 — Campaign Linking).
@Injectable({ providedIn: 'root' })
export class CampaignPartnersService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/campaign-partners`;

  private headers() {
    return { Authorization: `Bearer ${localStorage.getItem('token')}` };
  }

  listForCampaign(campaignId: string): Observable<{ partners: CampaignPartner[] }> {
    return this.http.get<{ partners: CampaignPartner[] }>(
      `${this.apiUrl}/campaign/${campaignId}`,
      { headers: this.headers() },
    );
  }

  create(campaignId: string, data: { partnerEntityId: string; rewardId?: string | null; order?: number; visible?: boolean; coupon?: string; campaignMessage?: string }): Observable<{ partner: CampaignPartner }> {
    return this.http.post<{ partner: CampaignPartner }>(
      `${this.apiUrl}/campaign/${campaignId}`,
      data,
      { headers: this.headers() },
    );
  }

  update(id: string, data: Partial<Pick<CampaignPartner, 'rewardId' | 'order' | 'visible' | 'coupon' | 'campaignMessage'>>): Observable<{ partner: CampaignPartner }> {
    return this.http.patch<{ partner: CampaignPartner }>(
      `${this.apiUrl}/${id}`,
      data,
      { headers: this.headers() },
    );
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/${id}`,
      { headers: this.headers() },
    );
  }
}
