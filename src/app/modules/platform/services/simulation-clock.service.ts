import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

// The Admin override and scheduler share the authoritative Hamonym clock.
export interface SimulationClockStatus {
  // Whether the Admin clock override is enabled.
  simulationEnabled: boolean;
  skipped?: string;
  results?: { step: string; status: string; result?: { reason?: string | null; statementsCreated?: number; approved?: number; succeeded?: number; errors?: number | unknown[]; skippedReasons?: Record<string, number> } }[];
  // True only while the enabled administrative clock has a fixed time.
  overrideActive: boolean;
  businessNow: string;
  realNow: string;
}

@Injectable({ providedIn: 'root' })
export class SimulationClockService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/platform/simulation-clock`;

  getStatus(): Observable<SimulationClockStatus> {
    return this.http.get<SimulationClockStatus>(this.base, { headers: authHeaders() });
  }

  setEnabled(enabled: boolean): Observable<SimulationClockStatus> {
    return this.http.post<SimulationClockStatus>(`${this.base}/enabled`, { enabled }, { headers: authHeaders() });
  }

  setFixed(isoDatetime: string): Observable<SimulationClockStatus> {
    return this.http.post<SimulationClockStatus>(`${this.base}/set-fixed`, { isoDatetime }, { headers: authHeaders() });
  }

  setOffset(offsetMs: number): Observable<SimulationClockStatus> {
    return this.http.post<SimulationClockStatus>(`${this.base}/set-offset`, { offsetMs }, { headers: authHeaders() });
  }

  reset(): Observable<SimulationClockStatus> {
    return this.http.post<SimulationClockStatus>(`${this.base}/reset`, {}, { headers: authHeaders() });
  }
}
