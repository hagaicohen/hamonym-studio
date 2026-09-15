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
  minutesSinceLastSuccess?: number | null;
  minutesSinceLastHeartbeat?: number | null;
}

// Distinct from a single job's own staleness (JobHealth/job_stale alert) --
// this is whether the Render Cron trigger process itself is executing at
// all, independent of any specific job being due. See cardcom-ops.
// controller.js#getSchedulerHeartbeat.
export interface SchedulerHeartbeat {
  lastHeartbeatAt: string | null;
  minutesSinceLastHeartbeat: number | null;
  healthy: boolean;
}

export interface HealthResponse {
  webhooks: WebhookHealth[];
  jobs: JobHealth[];
  knownJobs: string[];
  schedulerHeartbeat: SchedulerHeartbeat;
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

// Cross-entity, read-only donations browser row (2026-09-15 product
// decision) — deliberately excludes donor_email/donor_phone/provider data,
// see donations.service.js#getPlatformDonations's own comment on why.
export interface PlatformDonation {
  id: string;
  amount: number;
  donor_name: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  is_anonymous: boolean;
  failure_reason: string | null;
  is_recurring: boolean;
  campaign_id: string;
  campaign_title: string;
  campaign_slug: string;
  entity_id: string;
  entity_name: string;
}

export interface PlatformDonationsResponse {
  donations: PlatformDonation[];
  total: number;
  page: number;
  limit: number;
}

export interface PlatformDonationsQuery {
  status?: string;
  entityId?: string;
  campaignId?: string;
  period?: string;
  search?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class CardcomOpsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/platform/cardcom-ops`;

  listDonations(query: PlatformDonationsQuery = {}): Observable<PlatformDonationsResponse> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.entityId) params.set('entityId', query.entityId);
    if (query.campaignId) params.set('campaignId', query.campaignId);
    if (query.period) params.set('period', query.period);
    if (query.search) params.set('search', query.search);
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortDir) params.set('sortDir', query.sortDir);
    params.set('page', String(query.page ?? 0));
    params.set('limit', String(query.limit ?? 25));
    return this.http.get<PlatformDonationsResponse>(`${this.base}/donations?${params.toString()}`, { headers: authHeaders() });
  }

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
