import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

// Mirrors collection-ops.service.js#getFinancialOverview's exact return shape.
// 2026-10 (month-nav fix): period is now resolved by calendar month, not a
// caller-supplied billing_periods id -- a month with no Statement yet is a
// normal response (hasStatements:false), never an error. The statement-
// derived fields are null (not 0) in that case so the UI can tell "nothing
// billed yet" apart from "billed exactly ₪0". `accrued` is always present --
// a read-only, pre-Statement estimate computed straight from eligible
// donations using the same fee/VAT math calculation.service.js uses.
export interface AccruedPreview {
  donationCount: number;
  entitiesWithActivity: number;
  grossRaised: number;
  accruedFee: number;
  accruedVat: number;
  accruedTotal: number;
  entitiesMissingAccount: string[];
}
export interface FinancialOverview {
  period: { id: string | null; periodStart: string; periodEnd: string };
  hasStatements: boolean;
  statementCount: number | null;
  totalBilled: number | null;
  paidConfirmed: number | null;
  inProcess: number | null;
  openBalance: number | null;
  carriedOverFromPriorPeriods: { statementCount: number; outstandingTotal: number };
  accrued: AccruedPreview;
  // Real donation total for the period, independent of whether a Statement
  // has since consumed them -- unlike `accrued` (which only ever reflects
  // UNconsumed donations, by design), this never drops to 0 just because
  // billing already ran.
  periodDonations: { donationCount: number; grossRaised: number };
  // 2026-10 FINAL spec: card/MASAV breakdown (routing.resolveCollectionMethod,
  // read-only) + whether the real 28th-20:00-Israel cutoff for this period
  // has passed yet, whether collection has been attempted, and whether a
  // card attempt actually failed (exhausted retries) -- drives the due/
  // failed status banners.
  cutoffPassed: boolean;
  collectionAttempted: boolean;
  cardCollectionFailed: boolean;
  cardCollected: number;
  cardOutstanding: number;
  masavOutstanding: number;
}

export type NeedsAttentionCategory =
  | 'masav_proposal_awaiting_approval'
  | 'open_overpayment_exception'
  | 'card_attempts_exhausted'
  | 'masav_blocked'
  | 'masav_proposal_ready_to_export'
  | 'statement_auto_approval_failed';

export interface NeedsAttentionItem {
  manualRetryEligible?: boolean;
  previousAttempts?: number;
  failedAttempts?: number;
  successfulAttempts?: number;
  latestAttemptId?: string;
  manualRetryAmount?: number;
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

// Mirrors collection-ops.service.js#getFinancialReportRows -- the SAME rows
// the Excel download builds, used for the on-screen preview.
export interface FinancialReportRow {
  entityName: string;
  periodStart: string;
  periodEnd: string;
  billed: number;
  collected: number;
  outstanding: number;
  status: string;
  isDraft: boolean;
}

@Injectable({ providedIn: 'root' })
export class CollectionOpsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/platform/collection-ops`;

  getOverview(year: number, month: number): Observable<{ overview: FinancialOverview }> {
    return this.http.get<{ overview: FinancialOverview }>(`${this.base}/overview?year=${year}&month=${month}`, { headers: authHeaders() });
  }

  getNeedsAttention(): Observable<NeedsAttention> {
    return this.http.get<NeedsAttention>(`${this.base}/needs-attention`, { headers: authHeaders() });
  }

  getSystemActivity(): Observable<SystemActivity> {
    return this.http.get<SystemActivity>(`${this.base}/system-activity`, { headers: authHeaders() });
  }

  searchHistory(filters: { entityId?: string; dateFrom?: string; dateTo?: string; status?: string }): Observable<{ statements: StatementHistoryRow[] }> {
    const params = new URLSearchParams();
    if (filters.entityId) params.set('entityId', filters.entityId);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.status) params.set('status', filters.status);
    const qs = params.toString();
    return this.http.get<{ statements: StatementHistoryRow[] }>(`${this.base}/history${qs ? '?' + qs : ''}`, { headers: authHeaders() });
  }

  private reportQueryString(scope: { periodId?: string; dateFrom?: string; dateTo?: string; entityId?: string }): string {
    const params = new URLSearchParams();
    if (scope.periodId) params.set('periodId', scope.periodId);
    if (scope.dateFrom) params.set('dateFrom', scope.dateFrom);
    if (scope.dateTo) params.set('dateTo', scope.dateTo);
    if (scope.entityId) params.set('entityId', scope.entityId);
    return params.toString();
  }

  // Same rows the Excel export below produces -- see FinancialReportRow.
  // Exactly one of periodId / (dateFrom or dateTo) / neither ("כל
  // התקופות") applies -- see collection-ops.service.js#getFinancialReportRows.
  getReportPreview(scope: { periodId?: string; dateFrom?: string; dateTo?: string; entityId?: string }): Observable<{ rows: FinancialReportRow[] }> {
    return this.http.get<{ rows: FinancialReportRow[] }>(`${this.base}/report/preview?${this.reportQueryString(scope)}`, { headers: authHeaders() });
  }

  // Basic business Excel report -- deliberately a different endpoint/shape
  // from BillingOpsService#exportMasavExcel and FinanceOpsService#
  // exportMasavProposals (bank-file exports); this one never marks anything
  // as exported, it only reads.
  exportReport(scope: { periodId?: string; dateFrom?: string; dateTo?: string; entityId?: string }): Observable<Blob> {
    return this.http.get(`${this.base}/report?${this.reportQueryString(scope)}`, { headers: authHeaders(), responseType: 'blob' });
  }
}
