import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { StatementBalance } from './billing-ops.service';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

// Mirrors payment-exceptions.service.js#listPaymentExceptions's exact
// joined row shape.
export interface PaymentException {
  id: string;
  statement_id: string;
  collection_attempt_id: string;
  payment_id: string;
  entity_id: string;
  outstanding_before: string;
  collected_amount: string;
  overpayment_amount: string;
  detected_at: string;
  status: 'open' | 'resolved';
  hold_new_collection: boolean;
  created_at: string;
  entity_name: string;
  total_due: string;
  statement_status: string;
  last_action_type: string | null;
  last_action_at: string | null;
}

export interface PaymentExceptionAction {
  id: string;
  exception_id: string;
  action_type: 'override_hold' | 'resolve_refund' | 'resolve_credit' | 'resolve_no_overpayment';
  super_admin_user_id: number;
  reason: string;
  evidence_notes: string | null;
  created_at: string;
  admin_name: string | null;
}

export type ResolutionType = 'resolve_refund' | 'resolve_credit' | 'resolve_no_overpayment';

// Mirrors masav-proposal.service.js#listMasavProposals's exact joined row
// shape.
export interface MasavProposal {
  id: string;
  statement_id: string;
  entity_id: string;
  proposed_amount: string;
  outstanding_at_proposal: string;
  status: 'proposed' | 'approved' | 'exported' | 'superseded' | 'cancelled';
  status_reason: string | null;
  created_at: string;
  approved_at: string | null;
  exported_at: string | null;
  entity_name: string;
  total_due: string;
  statement_status: string;
  period_start: string;
  period_end: string;
  instruction_id?: string | null;
  batch_id?: string | null;
  export_mode?: 'entity' | 'period' | null;
}

export interface MasavExportPreview {
  mode: 'entity' | 'period';
  previewToken: string;
  totalAmount: string;
  organizationCount: number;
  periodCount: number;
  instructions: { ordinal: number; entityId: string; entityName: string; amount: string; bankLast4: string;
    components: { proposalId: string; statementId: string; periodId: string; periodStart: string; periodEnd: string; amount: string }[] }[];
  excluded: { proposalId: string; statementId: string; entityId: string; reason: string }[];
}

@Injectable({ providedIn: 'root' })
export class FinanceOpsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/platform/finance-ops`;

  listExceptions(status?: 'open' | 'resolved'): Observable<{ exceptions: PaymentException[] }> {
    const url = status ? `${this.base}/exceptions?status=${status}` : `${this.base}/exceptions`;
    return this.http.get<{ exceptions: PaymentException[] }>(url, { headers: authHeaders() });
  }

  getExceptionActions(id: string): Observable<{ actions: PaymentExceptionAction[] }> {
    return this.http.get<{ actions: PaymentExceptionAction[] }>(`${this.base}/exceptions/${id}/actions`, { headers: authHeaders() });
  }

  overrideExceptionHold(id: string, reason: string): Observable<{ result: { exceptionId: string; holdLifted: boolean } }> {
    return this.http.post<{ result: { exceptionId: string; holdLifted: boolean } }>(
      `${this.base}/exceptions/${id}/override-hold`,
      { reason },
      { headers: authHeaders() },
    );
  }

  resolveException(
    id: string,
    resolutionType: ResolutionType,
    reason: string,
    evidenceNotes?: string,
  ): Observable<{ result: { exceptionId: string; status: string; resolutionType: string } }> {
    return this.http.post<{ result: { exceptionId: string; status: string; resolutionType: string } }>(
      `${this.base}/exceptions/${id}/resolve`,
      { resolutionType, reason, evidenceNotes },
      { headers: authHeaders() },
    );
  }

  listMasavProposals(status?: MasavProposal['status']): Observable<{ proposals: MasavProposal[] }> {
    const url = status ? `${this.base}/masav-proposals?status=${status}` : `${this.base}/masav-proposals`;
    return this.http.get<{ proposals: MasavProposal[] }>(url, { headers: authHeaders() });
  }

  approveMasavProposal(id: string, reason: string): Observable<{ result: any }> {
    return this.http.post<{ result: any }>(`${this.base}/masav-proposals/${id}/approve`, { reason }, { headers: authHeaders() });
  }

  // Returns the real xlsx file bytes (same download pattern
  // BillingOpsService#exportMasavExcel already uses for the old mechanism)
  // -- the backend only ever reaches this response after
  // masav-proposal.service.js#exportMasavProposals has already built the
  // file and committed the status flip atomically with it, so receiving a
  // blob here always means a real file was generated, never a bare
  // {exported:true} from before the file existed.
  previewMasavExport(): Observable<{ preview: MasavExportPreview }> {
    return this.http.post<{ preview: MasavExportPreview }>(`${this.base}/masav-proposals/export-preview`, {}, { headers: authHeaders() });
  }
  exportMasavProposals(proposalIds: string[], expectedPreviewToken?: string): Observable<Blob> {
    return this.http.post(`${this.base}/masav-proposals/export`, { proposalIds, expectedPreviewToken }, { headers: authHeaders(), responseType: 'blob' });
  }

  listMasavInstructions(): Observable<{ instructions: MasavInstruction[] }> {
    return this.http.get<{ instructions: MasavInstruction[] }>(`${this.base}/masav-instructions`, { headers: authHeaders() });
  }
  finalizeMasavInstruction(id: string, data: { reference: string; confirmedAt: string; confirmed: boolean }): Observable<{ result: unknown }> {
    return this.http.post<{ result: unknown }>(`${this.base}/masav-instructions/${id}/finalize`, data, { headers: authHeaders() });
  }
  prepareMasavRetry(id: string): Observable<{ result: { replayed: boolean; proposals: unknown[] } }> {
    return this.http.post<{ result: { replayed: boolean; proposals: unknown[] } }>(`${this.base}/masav-instructions/${id}/retry`, { confirmed: true }, { headers: authHeaders() });
  }
  recordMasavResult(id: string, data: { amount: string; reference: string; confirmedAt: string; confirmed: boolean }): Observable<{ result: { id: string; allocations: { statementId: string; amount: string }[] } }> {
    return this.http.post<any>(`${this.base}/masav-instructions/${id}/confirmed-result`, data, { headers: authHeaders() });
  }

  getStatementBalance(statementId: string): Observable<{ balance: StatementBalance }> {
    return this.http.get<{ balance: StatementBalance }>(`${this.base}/statements/${statementId}/balance`, { headers: authHeaders() });
  }
}

export interface MasavInstruction {
  id: string;
  entity_name: string;
  total_amount: string;
  collected_amount: string;
  outstanding_amount: string;
  status: 'pending' | 'partial' | 'failed' | 'completed';
  finalized: boolean;
  retry_eligible: boolean;
  retry_requested: boolean;
  parent_instruction_ids: string[];
  components: { statement_id: string; billing_period_id: string; period_start: string; period_end: string; amount: string; collected_amount: string; outstanding_amount: string }[];
  allocations: { statement_id: string; amount: string; payment_id: string; reference: string; confirmed_at: string }[];
}
