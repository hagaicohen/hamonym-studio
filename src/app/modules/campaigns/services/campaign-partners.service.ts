import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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

  // Reverse direction — "which campaigns use my partner" (Scenario 0 /
  // "Partner First" standalone back-office).
  listForPartner(partnerEntityId: string): Observable<{ campaigns: {
    campaignPartnerId: string; rewardId: string | null; visible: boolean;
    campaignId: string; campaignTitle: string; campaignSlug: string; campaignStatus: string;
  }[] }> {
    return this.http.get<any>(
      `${this.apiUrl}/partner/${partnerEntityId}`,
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

  getOne(campaignPartnerId: string): Observable<{ partner: CampaignPartner & { partnerDisplayName: string; campaignTitle: string; campaignSlug: string } }> {
    return this.http.get<any>(`${this.apiUrl}/${campaignPartnerId}`, { headers: this.headers() });
  }

  // Campaign Participation draft (Phase 5 model refinement, 2026-07-30) —
  // mirrors EntitiesService.getDraft/updateDraft exactly, just scoped to a
  // campaign_partners row instead of an entity. See owner-registry.ts
  // OwnerType 'campaign-partner'.
  getDraft(campaignPartnerId: string): Observable<{ blocks: any[]; layout: any }> {
    return this.http.get<any>(`${this.apiUrl}/${campaignPartnerId}/draft`, { headers: this.headers() });
  }

  updateDraft(campaignPartnerId: string, data: { blocks: any[]; layout: any }): Observable<{ blocks: any[]; layout: any }> {
    return this.http.patch<any>(`${this.apiUrl}/${campaignPartnerId}/draft`, data, { headers: this.headers() });
  }

  // Public — no auth. Used by the public campaign page (reward "בשיתוף עם"
  // badge) and the Partner public page (prev/next navigation, Sprint 5.3).
  // Ordered by display_order, already filtered to visible + non-hidden/
  // non-deleted partners server-side.
  listPublicForCampaign(slug: string): Observable<{
    id: string; rewardId: string | null; order: number; coupon: string | null; campaignMessage: string | null;
    blocks: any[]; layout: any;
    partner: { id: string; displayName: string; logoUrl: string | null; website: string | null };
  }[]> {
    return this.http.get<any>(`${this.apiUrl}/public/${slug}`).pipe(map(res => res.partners));
  }
}
