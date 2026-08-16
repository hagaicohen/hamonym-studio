import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

export interface JobHealth {
  job_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error: string | null;
  result_summary?: Record<string, unknown> | null;
}

export interface WebhookHealth {
  type: string;
  last_received_at: string | null;
  count_24h: number;
}

export interface HealthAlert {
  type: string;
  severity: 'critical' | 'warning';
  message: string;
  jobName?: string;
  count?: number;
  failed?: number;
  notRouted?: number;
}

export interface HealthResponse {
  webhooks: WebhookHealth[];
  jobs: JobHealth[];
  knownJobs: string[];
  alerts: HealthAlert[];
}

export interface JobRun {
  id: number;
  job_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  result_summary: Record<string, unknown> | null;
  error: string | null;
  triggered_by: string;
}

export interface ReconciliationFinding {
  id: number;
  job_name: string;
  finding_type: string;
  severity: 'info' | 'warning' | 'critical';
  subject_type: string;
  subject_id: string;
  details: Record<string, unknown>;
  found_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

@Injectable({ providedIn: 'root' })
export class CardcomOpsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/platform/cardcom-ops`;

  getHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.base}/health`, { headers: authHeaders() });
  }

  getJobRuns(jobName?: string, limit = 15): Observable<{ runs: JobRun[] }> {
    let url = `${this.base}/jobs/runs?limit=${limit}`;
    if (jobName) url += `&jobName=${encodeURIComponent(jobName)}`;
    return this.http.get<{ runs: JobRun[] }>(url, { headers: authHeaders() });
  }

  getFindings(includeResolved = false): Observable<{ findings: ReconciliationFinding[] }> {
    return this.http.get<{ findings: ReconciliationFinding[] }>(
      `${this.base}/findings?includeResolved=${includeResolved}`,
      { headers: authHeaders() },
    );
  }

  // Both actions run through the same authenticated + requireSuperAdmin
  // backend routes as everything else here — no separate "admin action"
  // API, no financial operations exposed (see cardcom-ops.controller.js's
  // own comment on that boundary).
  runJob(name: string): Observable<unknown> {
    return this.http.post(`${this.base}/jobs/${name}/run`, {}, { headers: authHeaders() });
  }

  resolveFinding(id: number): Observable<unknown> {
    return this.http.post(`${this.base}/findings/${id}/resolve`, {}, { headers: authHeaders() });
  }
}
