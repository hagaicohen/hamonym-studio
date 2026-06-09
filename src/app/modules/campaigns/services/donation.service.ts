import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Donor {
  name: string;
  amount: number;
  completedAt: Date;
}

export interface DonationPayload {
  campaignId: string;
  donor: {
    name:      string;
    email:     string;
    phone:     string;
    idNumber?: string;
    address?:  string;
  };
  amount:  number;
  rewards: Array<{ title: string; minimumAmount: number }>;
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

  getDonors(slug: string): Observable<Donor[]> {
    return this.http.get<{ donors: any[] }>(`${this.apiUrl}/campaign/${slug}/donors`)
      .pipe(map(r => (r.donors ?? []).map((d: any) => ({
        name: d.name,
        amount: d.amount,
        completedAt: new Date(d.completed_at),
      }))));
  }
}
