import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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
  rewards: Array<{ title: string; minimumAmount: number }>;
  utmParams?: Record<string, string>;
}

export interface DonationResult {
  url:        string;
  donationId: string;
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
      amount: d.amount,
      completedAt: new Date(d.completed_at),
      isAnonymous: d.is_anonymous,
    }))));
  }
}
