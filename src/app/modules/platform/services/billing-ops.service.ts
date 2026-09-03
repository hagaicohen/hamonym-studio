import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

export interface BillingPeriod {
  id: string;
  period_start: string;
  period_end: string;
  created_at: string;
  retired: boolean;
  run_count: number;
}

export type BillingSetupBlockingReason = 'no_billing_account' | 'account_suspended';

export interface BillingSetupNotificationResult {
  sent: boolean;
  reason?: 'already_notified' | 'no_admin_found' | 'error';
  adminCount?: number;
  message?: string;
}

export interface BlockedBillingEntity {
  entityId: string;
  displayName: string;
  donationCount: number;
  grossAmount: string;
  reason: BillingSetupBlockingReason;
  notification?: BillingSetupNotificationResult;
}

export interface BillingActivityDiscovered {
  entitiesWithActivity: number;
  totalDonations: number;
  totalGross: number;
}

export interface BillingRun {
  id: string;
  billing_period_id: string;
  mode: 'dry_run' | 'production';
  as_of: string;
  status: string;
  result_summary: {
    accountsEvaluated: number;
    statementsCreated: number;
    zeroActivityAccountIds: string[];
    errors: { accountId: string; message: string }[];
    // Absent on runs executed before the Billing readiness correction
    // (2026-09-02) -- callers must not assume these are present.
    activityDiscovered?: BillingActivityDiscovered;
    blockedEntities?: BlockedBillingEntity[];
  } | null;
  created_at: string;
  completed_at: string | null;
}

export type RoutedMethod = 'card' | 'masav' | 'blocked';

// Truthful collection-readiness projection computed server-side (Billing
// Collection UX truthfulness fix, 2026-09-02) -- mirrors, never
// re-derives, the exact same rule collection.service.js#openAttempt
// applies authoritatively at collection time (routing.js's threshold+MASAV-
// authorization rule, then -- for the card route -- entity_billing's active
// default instrument). Only present on StatementDetail (the single-Statement
// drawer); StatementListItem's own routed_method (from listStatements)
// stays a simpler display-only projection of the routing decision alone.
export interface CollectionReadiness {
  route: 'card' | 'masav';
  ready: boolean;
  reason: 'no_active_payment_instrument' | 'masav_not_configured' | 'masav_incomplete' | 'masav_not_authorized' | null;
}

export interface StatementListItem {
  id: string;
  billing_account_id: string;
  billing_period_id: string;
  billing_run_id: string;
  gross_raised: string;
  fee_amount: string;
  vat_amount: string;
  total_due: string;
  status: string;
  created_at: string;
  entity_id: string;
  entity_name: string;
  component_count?: number;
  routed_method: RoutedMethod;
  latest_attempt_status: string | null;
  payment_count: number;
}

export interface CollectionAttempt {
  id: string;
  statement_id: string;
  collection_method: 'card' | 'masav';
  attempt_number: number;
  status: string;
  provider: string;
  provider_reference: string | null;
  provider_raw_status: string | null;
  failure_reason: string | null;
  requested_amount: string;
  initiated_at: string;
  resolved_at: string | null;
}

export interface Payment {
  id: string;
  statement_id: string;
  collection_attempt_id: string;
  amount: string;
  provider: string;
  provider_reference: string;
  received_at: string;
}

export interface BulkApproveResultItem {
  id: string;
  success: boolean;
  result?: any;
  error?: { code: string; message: string; details?: any };
}

export interface BulkApproveResult {
  total: number;
  approvedCount: number;
  failedCount: number;
  results: BulkApproveResultItem[];
}

export interface StatementDetail extends StatementListItem {
  attempts: CollectionAttempt[];
  payments: Payment[];
  componentCount: number;
  account_declared_method: 'card' | 'masav';
  readiness: CollectionReadiness;
}

export interface MasavConfig {
  id: string;
  entity_id: string;
  bank_code: string;
  branch_code: string;
  account_number: string;
  account_holder_name: string | null;
  authorized: boolean;
  authorized_by: string | null;
  authorized_at: string | null;
  // Signed bank-authorization document ("אישור הרשאה לחיוב באמצעות מס״ב") --
  // metadata only, never the bytes. Uploading this never sets `authorized`;
  // see masav-config.service.js#uploadAuthorizationDocument.
  authorization_document_name: string | null;
  authorization_document_uploaded_at: string | null;
  has_authorization_document: boolean;
  created_at: string;
  updated_at: string;
}

export interface BlockedMasavStatement {
  statement_id: string;
  total_due: string;
  status: string;
  created_at: string;
  entity_id: string;
  entity_name: string;
  bank_code: string | null;
  branch_code: string | null;
  account_number: string | null;
  authorized: boolean | null;
  reason: 'masav_not_configured' | 'masav_incomplete' | 'masav_not_authorized';
}

export interface ActionableMasavStatement {
  statement_id: string;
  total_due: string;
  status: string;
  created_at: string;
  entity_id: string;
  entity_name: string;
  bank_code: string;
  branch_code: string;
  account_number: string;
  attempt_id: string | null;
  attempt_status: string | null;
  attempt_number: number | null;
}

@Injectable({ providedIn: 'root' })
export class BillingOpsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/platform/billing-ops`;

  listPeriods(): Observable<{ periods: BillingPeriod[] }> {
    return this.http.get<{ periods: BillingPeriod[] }>(`${this.base}/periods`, { headers: authHeaders() });
  }

  createPeriod(periodStart: string, periodEnd: string): Observable<{ period: BillingPeriod }> {
    return this.http.post<{ period: BillingPeriod }>(
      `${this.base}/periods`,
      { periodStart, periodEnd },
      { headers: authHeaders() },
    );
  }

  calculatePeriod(periodId: string, asOf?: string): Observable<{ result: any }> {
    return this.http.post<{ result: any }>(
      `${this.base}/periods/${periodId}/calculate`,
      { asOf },
      { headers: authHeaders() },
    );
  }

  listRuns(periodId?: string): Observable<{ runs: BillingRun[] }> {
    const url = periodId ? `${this.base}/runs?periodId=${periodId}` : `${this.base}/runs`;
    return this.http.get<{ runs: BillingRun[] }>(url, { headers: authHeaders() });
  }

  listStatements(filters: { periodId?: string; runId?: string; status?: string }): Observable<{ statements: StatementListItem[] }> {
    const params = new URLSearchParams();
    if (filters.periodId) params.set('periodId', filters.periodId);
    if (filters.runId) params.set('runId', filters.runId);
    if (filters.status) params.set('status', filters.status);
    const qs = params.toString();
    return this.http.get<{ statements: StatementListItem[] }>(
      `${this.base}/statements${qs ? '?' + qs : ''}`,
      { headers: authHeaders() },
    );
  }

  getStatement(id: string): Observable<{ statement: StatementDetail }> {
    return this.http.get<{ statement: StatementDetail }>(`${this.base}/statements/${id}`, { headers: authHeaders() });
  }

  approveStatement(id: string): Observable<{ result: any }> {
    return this.http.post<{ result: any }>(`${this.base}/statements/${id}/approve`, {}, { headers: authHeaders() });
  }

  // Orchestration only, mirroring approveStatement() per id server-side --
  // see billing-ops.service.js#bulkApproveStatements. Never a bulk SQL
  // status update; the individual drawer's approveStatement() above
  // remains the path for exceptional/manual single-Statement inspection.
  bulkApproveStatements(statementIds: string[]): Observable<{ result: BulkApproveResult }> {
    return this.http.post<{ result: BulkApproveResult }>(
      `${this.base}/statements/bulk-approve`,
      { statementIds },
      { headers: authHeaders() },
    );
  }

  abandonStatement(id: string): Observable<{ result: any }> {
    return this.http.post<{ result: any }>(`${this.base}/statements/${id}/abandon`, {}, { headers: authHeaders() });
  }

  triggerCollection(id: string): Observable<{ result: any }> {
    return this.http.post<{ result: any }>(`${this.base}/statements/${id}/collect`, {}, { headers: authHeaders() });
  }

  // ---- MASAV (Bundle 2) ----------------------------------------------

  getMasavConfig(entityId: string): Observable<{ config: MasavConfig | null }> {
    return this.http.get<{ config: MasavConfig | null }>(`${this.base}/masav/${entityId}`, { headers: authHeaders() });
  }

  upsertMasavConfig(
    entityId: string,
    payload: { bankCode: string; branchCode: string; accountNumber: string; accountHolderName?: string },
  ): Observable<{ config: MasavConfig }> {
    return this.http.put<{ config: MasavConfig }>(`${this.base}/masav/${entityId}`, payload, { headers: authHeaders() });
  }

  authorizeMasav(entityId: string, notes?: string): Observable<{ config: MasavConfig }> {
    return this.http.post<{ config: MasavConfig }>(`${this.base}/masav/${entityId}/authorize`, { notes }, { headers: authHeaders() });
  }

  revokeMasav(entityId: string, notes?: string): Observable<{ config: MasavConfig }> {
    return this.http.post<{ config: MasavConfig }>(`${this.base}/masav/${entityId}/revoke`, { notes }, { headers: authHeaders() });
  }

  // Signed bank-authorization document upload -- private storage (bytea on
  // entity_masav_details, no public URL), same pattern as entities.routes.js's
  // association-document/tax-document uploads. Content-Type is left for the
  // browser to set (multipart boundary) -- only the auth header is added.
  uploadMasavAuthorizationDocument(entityId: string, file: File): Observable<{ config: MasavConfig }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.put<{ config: MasavConfig }>(`${this.base}/masav/${entityId}/authorization-document`, formData, {
      headers: authHeaders(),
    });
  }

  downloadMasavAuthorizationDocument(entityId: string): Observable<Blob> {
    return this.http.get(`${this.base}/masav/${entityId}/authorization-document`, {
      headers: authHeaders(),
      responseType: 'blob',
    });
  }

  listBlockedMasavStatements(): Observable<{ statements: BlockedMasavStatement[] }> {
    return this.http.get<{ statements: BlockedMasavStatement[] }>(`${this.base}/masav/blocked-statements`, { headers: authHeaders() });
  }

  listActionableMasavStatements(): Observable<{ statements: ActionableMasavStatement[] }> {
    return this.http.get<{ statements: ActionableMasavStatement[] }>(`${this.base}/masav/actionable-statements`, { headers: authHeaders() });
  }

  openMasavAttempt(statementId: string): Observable<{ result: any }> {
    return this.http.post<{ result: any }>(`${this.base}/masav/statements/${statementId}/open-attempt`, {}, { headers: authHeaders() });
  }

  // v1 stops at the Excel file -- there is no endpoint (and so no service
  // method) for recording a MASAV result. See masav-ops.controller.js /
  // billing-ops.routes.js on the backend.
  exportMasavExcel(statementIds: string[]): Observable<Blob> {
    return this.http.get(`${this.base}/masav/export?statementIds=${statementIds.join(',')}`, {
      headers: authHeaders(),
      responseType: 'blob',
    });
  }
}
