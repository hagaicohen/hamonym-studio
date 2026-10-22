import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

// Super Admin clock controls are independent of FIN-11 collection authorization.
// UI control state is isolated from the shared production job clock.
export interface SimulationClockStatus {
  // Persisted Super Admin switch; this does not authorize financial jobs.
  simulationEnabled: boolean;
  collectionAuthorized?: boolean;
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
