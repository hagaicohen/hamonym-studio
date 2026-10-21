import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

// Super Admin "כלי סימולציה" (2026-10) -- read/write surface over the
// EXISTING backend business clock (src/lib/clock.js + the separate write
// module src/lib/simulation-clock-admin.js, kept apart from clock.js on
// purpose -- see that file's own header). GET is always safe to call.
// Every write (setFixed/setOffset/reset) is independently gated server-side
// by HAMONYM_SIMULATION_MODE -- outside a genuinely isolated simulation
// deployment this always returns 403 SIMULATION_DISABLED, by design, in
// every environment this app can currently reach (production has no
// simulation_clock table at all, deliberately).
export interface SimulationClockStatus {
  simulationEnabled: boolean;
  // Derived server-side: true only while a real fixed_at/offset_ms override
  // is actually in effect (businessNow genuinely diverges from realNow) --
  // distinct from simulationEnabled, which only says this environment is
  // CAPABLE of simulation at all.
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
