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

  getActivity(query: { type?: string; sortDir?: string; page?: number; limit?: number }): Observable<any> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('limit', String(query.limit ?? 20));

    if (query.type) params = params.set('type', query.type);
    if (query.sortDir) params = params.set('sortDir', query.sortDir);

    return this.http.get(`${environment.apiUrl}/api/platform/activity`, { headers: authHeaders(), params });
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

  // Permanent, irreversible removal — everything under this entity is erased.
  hardDelete(id: string, notes?: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/organizations/${id}/hard-delete`, { notes }, { headers: authHeaders() });
  }

  getCampaigns(query: {
    search?: string;
    status?: string;
    entityId?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
    limit?: number;
    showDeleted?: boolean;
    featuredOnly?: boolean;
  }): Observable<any> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('limit', String(query.limit ?? 25));

    if (query.search) params = params.set('search', query.search);
    if (query.status) params = params.set('status', query.status);
    if (query.entityId) params = params.set('entityId', query.entityId);
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDir) params = params.set('sortDir', query.sortDir);
    if (query.showDeleted) params = params.set('showDeleted', '1');
    if (query.featuredOnly) params = params.set('featuredOnly', '1');

    return this.http.get(`${environment.apiUrl}/api/platform/campaigns`, { headers: authHeaders(), params });
  }

  getCampaign(id: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/platform/campaigns/${id}`, { headers: authHeaders() });
  }

  setCampaignStatus(id: string, status: string, notes?: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/campaigns/${id}/status`, { status, notes }, { headers: authHeaders() });
  }

  setCampaignFeatured(id: string, featured: boolean): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/campaigns/${id}/feature`, { featured }, { headers: authHeaders() });
  }

  setCampaignLocked(id: string, locked: boolean, notes?: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/campaigns/${id}/lock`, { locked, notes }, { headers: authHeaders() });
  }

  deleteCampaign(id: string, notes: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/campaigns/${id}/delete`, { notes }, { headers: authHeaders() });
  }

  restoreCampaign(id: string, notes?: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/campaigns/${id}/restore`, { notes }, { headers: authHeaders() });
  }

  transferCampaignOwnership(id: string, entityId: string, notes: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/campaigns/${id}/transfer`, { entityId, notes }, { headers: authHeaders() });
  }

  setCampaignSlug(id: string, slug: string, notes: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/campaigns/${id}/slug`, { slug, notes }, { headers: authHeaders() });
  }

  duplicateCampaign(id: string, notes?: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/campaigns/${id}/duplicate`, { notes }, { headers: authHeaders() });
  }

  getRoles(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/platform/roles`, { headers: authHeaders() });
  }

  getUsers(query: {
    search?: string;
    status?: string;
    roleId?: number;
    sortBy?: string;
    sortDir?: string;
    page?: number;
    limit?: number;
  }): Observable<any> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('limit', String(query.limit ?? 25));

    if (query.search) params = params.set('search', query.search);
    if (query.status) params = params.set('status', query.status);
    if (query.roleId) params = params.set('roleId', String(query.roleId));
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDir) params = params.set('sortDir', query.sortDir);

    return this.http.get(`${environment.apiUrl}/api/platform/users`, { headers: authHeaders(), params });
  }

  getUser(id: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/platform/users/${id}`, { headers: authHeaders() });
  }

  setUserActive(id: string, active: boolean, notes?: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/users/${id}/status`, { active, notes }, { headers: authHeaders() });
  }

  deleteUser(id: string, notes: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/users/${id}/delete`, { notes }, { headers: authHeaders() });
  }

  restoreUser(id: string, notes?: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/users/${id}/restore`, { notes }, { headers: authHeaders() });
  }

  generatePasswordResetLink(id: string, notes?: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/users/${id}/reset-password-link`, { notes }, { headers: authHeaders() });
  }

  impersonateUser(id: string, notes: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/users/${id}/impersonate`, { notes }, { headers: authHeaders() });
  }

  setUserSuperAdmin(id: string, isSuperAdmin: boolean, notes: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/users/${id}/super-admin`, { isSuperAdmin, notes }, { headers: authHeaders() });
  }

  setUserPermissions(id: string, permissions: string[], notes: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/users/${id}/permissions`, { permissions, notes }, { headers: authHeaders() });
  }

  createAdminUser(data: { email: string; fullName?: string; isSuperAdmin: boolean; permissions: string[]; notes?: string }): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/platform/users`, data, { headers: authHeaders() });
  }
}
