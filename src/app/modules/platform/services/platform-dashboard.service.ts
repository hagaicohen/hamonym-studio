import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type DashboardRange = '7d' | '30d' | '12m';
export interface DashboardLink {
  route: string[];
  query: Record<string, string>;
  fragment?: string;
}
export interface DashboardAttention extends DashboardLink {
  id: string;
  name: string;
  reason: string;
  action: string;
}
export interface DashboardDonor {
  name: string | null;
  firstDonationAt: string;
  firstDonationAmount: number | null;
}
export interface DashboardOverview {
  version: number;
  generatedAt: string;
  period: { start: string; end: string } | null;
  kpis: {
    activeEntities: number;
    activeCampaigns: number;
    donationsMonth: number | null;
    newDonorsThisMonth: number | null;
    feesOutstanding: number | null;
    attentionCount: number;
  };
  newDonors: DashboardDonor[];
  trend: { range: DashboardRange; points: { date: string; value: number }[]; total: number; previousTotal: number } | null;
  attention: DashboardAttention[];
  activity: (DashboardLink & { id: string; name: string; label: string; timestamp: string; amount: number | null })[];
}

@Injectable({ providedIn: 'root' })
export class PlatformDashboardService {
  private http = inject(HttpClient);

  getOverview(range: DashboardRange): Observable<DashboardOverview> {
    return this.http.get<DashboardOverview>(`${environment.apiUrl}/api/platform/dashboard/overview`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` }),
      params: new HttpParams().set('range', range),
    });
  }
}
