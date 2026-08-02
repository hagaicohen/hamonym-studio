import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ResolvedEntry } from './partner-import-mapper';

export interface ExtractResult {
  sessionId: string;
  pageTitle: string;
  foundSignals: {
    businessName: boolean; gallery: boolean; address: boolean;
    contact: boolean; openingHours: boolean; offerLanguage: boolean;
  };
  extractTimeMs: number;
}

export interface ClassifyResult {
  profile: ResolvedEntry[];
  participation: ResolvedEntry[];
  contactEmail: string | null;
  contactPhone: string | null;
  classificationTimeMs: number;
}

export interface ApplyPayload {
  idempotencyKey: string;
  sessionId: string;
  // Absent for standalone Partner creation (no campaign involved yet) — see
  // partner-import.controller.js#apply.
  campaignId?: string;
  rewardId?: string | null;
  displayName: string;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  profileDraft: { blocks: any[]; layout: any };
  participationDraft?: { blocks: any[]; layout: any };
  metrics: {
    extractTimeMs: number; classificationTimeMs: number; blocksFound: number;
    acceptedAutomatically: number; acceptedAfterReview: number; discarded: number;
  };
}

// Thin HTTP wrapper for the AI Website Import backend, same style as
// CampaignPartnersService. Never touches NormalizedBlock[] directly — the
// backend only ever hands back an opaque sessionId and already-resolved
// entries (see docs/DECISIONS.md's INVARIANTS).
@Injectable({ providedIn: 'root' })
export class PartnerImportService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/partner-import`;

  private headers() {
    return { Authorization: `Bearer ${localStorage.getItem('token')}` };
  }

  extract(url: string): Observable<ExtractResult> {
    return this.http.post<ExtractResult>(`${this.apiUrl}/extract`, { url }, { headers: this.headers() });
  }

  classify(sessionId: string, campaign?: { title: string; shortDescription: string }): Observable<ClassifyResult> {
    return this.http.post<ClassifyResult>(`${this.apiUrl}/classify`, { sessionId, campaign }, { headers: this.headers() });
  }

  apply(payload: ApplyPayload): Observable<{ entity: any; campaignPartner: any }> {
    return this.http.post<{ entity: any; campaignPartner: any }>(`${this.apiUrl}/apply`, payload, { headers: this.headers() });
  }

  // Deterministic Clone — no LLM, no review step. One call: extract, map,
  // create entity + Profile draft (+ campaign_partners link if campaignId
  // given). See partner-import.controller.js#clone.
  clone(url: string, displayName?: string, campaignId?: string): Observable<{ entity: any; campaignPartner: any }> {
    return this.http.post<{ entity: any; campaignPartner: any }>(`${this.apiUrl}/clone`, { url, displayName, campaignId }, { headers: this.headers() });
  }
}
