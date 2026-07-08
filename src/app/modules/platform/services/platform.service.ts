// src/app/modules/platform/services/platform.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

function authHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
}

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private http = inject(HttpClient);

  getDashboard(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/platform/dashboard`, { headers: authHeaders() });
  }

  getOrganizations(query: {
    search?: string;
    status?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
    limit?: number;
    missingDocs?: boolean;
    noCampaigns?: boolean;
    newSince?: number;
  }): Observable<any> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('limit', String(query.limit ?? 25));

    if (query.search) params = params.set('search', query.search);
    if (query.status) params = params.set('status', query.status);
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDir) params = params.set('sortDir', query.sortDir);
    if (query.missingDocs) params = params.set('missingDocs', '1');
    if (query.noCampaigns) params = params.set('noCampaigns', '1');
    if (query.newSince) params = params.set('newSince', String(query.newSince));

    return this.http.get(`${environment.apiUrl}/api/platform/organizations`, { headers: authHeaders(), params });
  }

  getOrganization(id: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/platform/organizations/${id}`, { headers: authHeaders() });
  }

  approve(id: string, notes?: string, reasonTags?: string[]): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/organizations/${id}/approve`, { notes, reasonTags }, { headers: authHeaders() });
  }

  reject(id: string, notes?: string, reasonTags?: string[]): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/organizations/${id}/reject`, { notes, reasonTags }, { headers: authHeaders() });
  }

  requestChanges(id: string, notes?: string, reasonTags?: string[]): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/organizations/${id}/request-changes`, { notes, reasonTags }, { headers: authHeaders() });
  }

  suspend(id: string, notes?: string, reasonTags?: string[]): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/organizations/${id}/suspend`, { notes, reasonTags }, { headers: authHeaders() });
  }

  reactivate(id: string, notes?: string, reasonTags?: string[]): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/organizations/${id}/reactivate`, { notes, reasonTags }, { headers: authHeaders() });
  }
}
