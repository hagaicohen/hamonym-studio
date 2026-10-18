import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

// Mirrors collection-ops.service.js#getFinancialOverview's exact return shape.
export interface FinancialOverview {
  period: { id: string; periodStart: string; periodEnd: string };
  statementCount: number;
  totalBilled: number;
  paidConfirmed: number;
  inProcess: number;
  openBalance: number;
  carriedOverFromPriorPeriods: { statementCount: number; outstandingTotal: number };
}

export type NeedsAttentionCategory =
  | 'masav_proposal_awaiting_approval'
  | 'open_overpayment_exception'
  | 'card_attempts_exhausted'
  | 'masav_blocked';

export interface NeedsAttentionItem {
  entityName: string;
  amount: number;
  reason: string;
  nextAction: string;
  statementId: string;
  proposalId?: string;
  exceptionId?: string;
  findingId?: number;
  entityId?: string;
}

export interface NeedsAttentionGroup {
  category: NeedsAttentionCategory;
  label: string;
  count: number;
  totalAmount: number;
  items: NeedsAttentionItem[];
}

export interface NeedsAttention {
  categories: NeedsAttentionGroup[];
  totalCount: number;
}

export interface JobActivity {
  name: string;
  label: string;
  registered: boolean;
  status: string;
  lastRunAt?: string | null;
  lastRunDurationMs?: number | null;
  resultSummary?: Record<string, unknown> | null;
  lastRunError?: string | null;
}

export interface SystemActivity {
  automatic: JobActivity[];
  fin11Planned: JobActivity[];
}

export interface StatementHistoryRow {
  id: string;
  billing_account_id: string;
  billing_period_id: string;
  total_due: string;
  status: string;
  created_at: string;
  entity_id: string;
  entity_name: string;
  period_start: string;
  period_end: string;
  latest_attempt_status: string | null;
  collected: string;
}

@Injectable({ providedIn: 'root' })
export class CollectionOpsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/platform/collection-ops`;

  getOverview(periodId: string): Observable<{ overview: FinancialOverview }> {
    return this.http.get<{ overview: FinancialOverview }>(`${this.base}/overview?periodId=${periodId}`, { headers: authHeaders() });
  }

  getNeedsAttention(): Observable<NeedsAttention> {
    return this.http.get<NeedsAttention>(`${this.base}/needs-attention`, { headers: authHeaders() });
  }

  getSystemActivity(): Observable<SystemActivity> {
    return this.http.get<SystemActivity>(`${this.base}/system-activity`, { headers: authHeaders() });
  }

  searchHistory(filters: { entityName?: string; dateFrom?: string; dateTo?: string; status?: string }): Observable<{ statements: StatementHistoryRow[] }> {
    const params = new URLSearchParams();
    if (filters.entityName) params.set('entityName', filters.entityName);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.status) params.set('status', filters.status);
    const qs = params.toString();
    return this.http.get<{ statements: StatementHistoryRow[] }>(`${this.base}/history${qs ? '?' + qs : ''}`, { headers: authHeaders() });
  }

  // Basic business Excel report -- deliberately a different endpoint/shape
  // from BillingOpsService#exportMasavExcel and FinanceOpsService#
  // exportMasavProposals (bank-file exports); this one never marks anything
  // as exported, it only reads.
  exportReport(periodId: string): Observable<Blob> {
    return this.http.get(`${this.base}/report?periodId=${periodId}`, { headers: authHeaders(), responseType: 'blob' });
  }
}
