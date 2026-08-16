import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Donor {
  name: string;
  amount: number;
  completedAt: Date;
  isAnonymous: boolean;
  isFirst: boolean;
}

export interface TopDonor {
  name: string;
  total: number;
}

export type DonorPeriod = 'all' | 'today' | 'week';

export interface DonationToastItem {
  name: string;
  amount: number;
  completedAt: Date;
  isAnonymous: boolean;
}

export interface DonationPayload {
  campaignId: string;
  donor: {
    name:      string;
    email:     string;
    phone:     string;
    idNumber?:   string;
    address?:    string;
    postalCode?: string;
  };
  amount:  number;
  // Cardcom line items — title + price drive pricing; id is optional (absent
  // for registration-option lines, which have no Offering) and is only used
  // to attribute a paid donation to an Offering for the "X מתוך Y" purchase
  // count (see hamonym-backend migrations/024_registration_orders.sql for the
  // Registration Order/Participant side).
  rewards: Array<{ id?: string; title: string; minimumAmount: number }>;
  // 2.4 — Multi-Participant Registration: one entry per registered person
  // (a Registration Order can have 1+ Participants). Separate from `rewards`
  // (which drives pricing/Cardcom line items) — this is "who's registered",
  // not "what's being charged". registrationOptionId is validated and
  // re-priced server-side against registration_options — see DECISIONS.md
  // (2026-07-15, 2026-07-16).
  participants?: Array<{ name: string; registrationOptionId?: string; shirtSize?: string }>;
  utmParams?: Record<string, string>;
  // Monthly donation intent — signals the backend to create a Cardcom
  // recurring instruction alongside this first charge. Absent/false = the
  // existing one-time flow, unchanged.
  recurring?: boolean;
}

export interface DonationResult {
  url:        string;
  donationId: string;
}

export interface Receipt {
  id: string;
  receipt_number: string;
  amount: string | number;
  donor_name: string;
  donor_email: string;
  issued_at: string;
  campaign_title: string;
  entity_name: string;
  entity_logo: string | null;
  legal_name: string | null;
}

export interface MyDonation {
  id: string;
  amount: string | number;
  completed_at: string;
  created_at: string;
  is_anonymous: boolean;
  campaign_title: string;
  campaign_slug: string;
  cover_image_url: string | null;
  entity_name: string;
  entity_logo: string | null;
  receipt_id: string | null;
}

@Injectable({ providedIn: 'root' })
export class DonationService {
  private http   = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/donations`;

  create(payload: DonationPayload): Observable<DonationResult> {
    return this.http.post<DonationResult>(this.apiUrl, payload);
  }

  getDonors(slug: string, period: DonorPeriod = 'all'): Observable<{ donors: Donor[]; topDonors: TopDonor[] }> {
    return this.http.get<{ donors: any[]; topDonors: any[] }>(`${this.apiUrl}/campaign/${slug}/donors`, {
      params: new HttpParams().set('period', period),
    }).pipe(map(r => ({
      donors: (r.donors ?? []).map((d: any) => ({
        name: d.name,
        amount: d.amount,
        completedAt: new Date(d.completed_at),
        isAnonymous: d.is_anonymous,
        isFirst: d.is_first,
      })),
      topDonors: (r.topDonors ?? []).map((t: any) => ({ name: t.name, total: t.total })),
    })));
  }

  getLive(slug: string, since: string): Observable<DonationToastItem[]> {
    return this.http.get<{ donations: any[] }>(`${this.apiUrl}/campaign/${slug}/live`, {
      params: new HttpParams().set('since', since),
    }).pipe(map(r => (r.donations ?? []).map((d: any) => ({
      name: d.name,
      amount: parseFloat(d.amount),
      completedAt: new Date(d.completed_at),
      isAnonymous: d.is_anonymous,
    }))));
  }

  getRewardCounts(slug: string): Observable<Record<string, number>> {
    return this.http.get<{ counts: Record<string, number> }>(`${this.apiUrl}/campaign/${slug}/reward-counts`)
      .pipe(map(r => r.counts ?? {}));
  }

  getReceipt(id: string): Observable<Receipt> {
    return this.http.get<Receipt>(`${this.apiUrl}/receipt/${id}`);
  }

  getMyDonations(): Observable<MyDonation[]> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    return this.http.get<{ donations: MyDonation[] }>(`${this.apiUrl}/my`, { headers })
      .pipe(map(r => r.donations ?? []));
  }
}
