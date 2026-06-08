import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

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
}
