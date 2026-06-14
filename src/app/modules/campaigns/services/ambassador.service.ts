import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Ambassador {
  id: string;
  campaignId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  goalAmount: number | null;
  status: 'active' | 'inactive' | 'pending';
  personalMessage: string;
  personalTitle: string;
  slug: string;
  raisedOnline: number;
  raisedManual: number;
  raisedTotal: number;
  donorCount: number;
  createdAt: string;
}

export interface AmbassadorFormData {
  fullName: string;
  phone: string;
  email: string;
  goalAmount: number | null;
  personalMessage: string;
  personalTitle: string;
}

export interface ImportRow {
  fullName: string;
  phone: string;
  email: string;
  goalAmount: number | null;
  valid: boolean;
  error?: string;
}

export interface AmbassadorPublicInfo {
  id:              string;
  fullName:        string;
  slug:            string;
  goalAmount:      number | null;
  personalMessage: string;
  raisedTotal:     number;
  donorCount:      number;
}

export interface AmbassadorStats {
  totalAmbassadors: number;
  activeAmbassadors: number;
  totalRaised: number;
  totalDonors: number;
}

@Injectable({ providedIn: 'root' })
export class AmbassadorService {
  private http    = inject(HttpClient);
  private apiBase = `${environment.apiUrl}/api`;

  private headers() {
    return { Authorization: `Bearer ${localStorage.getItem('token')}` };
  }

  list(campaignId: string): Observable<Ambassador[]> {
    return this.http
      .get<{ ambassadors: any[] }>(
        `${this.apiBase}/campaigns/${campaignId}/ambassadors`,
        { headers: this.headers() }
      )
      .pipe(map(r => (r.ambassadors ?? []).map(a => this.fromSnake(a))));
  }

  create(campaignId: string, data: AmbassadorFormData): Observable<Ambassador> {
    return this.http
      .post<{ ambassador: any }>(
        `${this.apiBase}/campaigns/${campaignId}/ambassadors`,
        this.toSnake(data),
        { headers: this.headers() }
      )
      .pipe(map(r => this.fromSnake(r.ambassador)));
  }

  update(id: string, data: Partial<AmbassadorFormData>): Observable<Ambassador> {
    return this.http
      .patch<{ ambassador: any }>(
        `${this.apiBase}/ambassadors/${id}`,
        this.toSnake(data),
        { headers: this.headers() }
      )
      .pipe(map(r => this.fromSnake(r.ambassador)));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiBase}/ambassadors/${id}`,
      { headers: this.headers() }
    );
  }

  importBulk(
    campaignId: string,
    rows: ImportRow[]
  ): Observable<{ created: number; errors: string[] }> {
    const validRows = rows
      .filter(r => r.valid)
      .map(r => ({
        full_name:   r.fullName,
        phone:       r.phone   || null,
        email:       r.email   || null,
        goal_amount: r.goalAmount,
      }));
    return this.http.post<{ created: number; errors: string[] }>(
      `${this.apiBase}/campaigns/${campaignId}/ambassadors/import`,
      { rows: validRows },
      { headers: this.headers() }
    );
  }

  setStatus(id: string, status: 'active' | 'inactive'): Observable<Ambassador> {
    return this.http
      .patch<{ ambassador: any }>(
        `${this.apiBase}/ambassadors/${id}`,
        { status },
        { headers: this.headers() }
      )
      .pipe(map(r => this.fromSnake(r.ambassador)));
  }

  addAdjustment(ambassadorId: string, amount: number, reason: string): Observable<void> {
    return this.http.post<void>(
      `${this.apiBase}/ambassadors/${ambassadorId}/adjustments`,
      { amount, reason },
      { headers: this.headers() }
    );
  }

  listPublic(campaignSlug: string): Observable<AmbassadorPublicInfo[]> {
    return this.http
      .get<{ ambassadors: any[] }>(
        `${this.apiBase}/campaigns/${campaignSlug}/ambassadors/public`
      )
      .pipe(
        map(r => (r.ambassadors ?? []).map(a => ({
          id:              a.id,
          fullName:        a.full_name,
          slug:            a.slug,
          goalAmount:      a.goal_amount  ?? null,
          personalMessage: a.personal_message ?? '',
          raisedTotal:     Number(a.raised_total  ?? 0),
          donorCount:      Number(a.donor_count   ?? 0),
        }))),
        catchError(() => of([]))
      );
  }

  getBySlug(campaignSlug: string, ambassadorSlug: string): Observable<Ambassador | null> {
    return this.http
      .get<{ ambassador: any }>(
        `${this.apiBase}/campaigns/${campaignSlug}/ambassadors/by-slug/${ambassadorSlug}`
      )
      .pipe(
        map(r => (r.ambassador ? this.fromSnake(r.ambassador) : null)),
        catchError(() => of(null))
      );
  }

  getMyRecord(campaignId: string): Observable<Ambassador> {
    return this.http
      .get<{ ambassador: any }>(
        `${this.apiBase}/campaigns/${campaignId}/my-ambassador-record`,
        { headers: this.headers() }
      )
      .pipe(map(r => this.fromSnake(r.ambassador)));
  }

  getMyCampaigns(): Observable<Array<{ id: string; name: string }>> {
    return this.http
      .get<{ campaigns: Array<{ id: string; name: string }> }>(
        `${this.apiBase}/campaigns/my-ambassador-campaigns`,
        { headers: this.headers() }
      )
      .pipe(
        map(r => r.campaigns ?? []),
        catchError(() => of([]))
      );
  }

  selfRegister(
    campaignSlug: string,
    data: { fullName: string; phone: string; email: string; goalAmount?: number | null }
  ): Observable<{ slug: string; shareUrl: string }> {
    return this.http.post<{ slug: string; shareUrl: string }>(
      `${this.apiBase}/campaigns/${campaignSlug}/ambassadors/self-register`,
      {
        full_name:   data.fullName,
        phone:       data.phone || null,
        email:       data.email || null,
        goal_amount: data.goalAmount ?? null,
      }
    );
  }

  computeStats(ambassadors: Ambassador[]): AmbassadorStats {
    return {
      totalAmbassadors:  ambassadors.length,
      activeAmbassadors: ambassadors.filter(a => a.status === 'active').length,
      totalRaised:       ambassadors.reduce((s, a) => s + a.raisedTotal, 0),
      totalDonors:       ambassadors.reduce((s, a) => s + a.donorCount, 0),
    };
  }

  downloadTemplate(): void {
    const csv = 'שם מלא,טלפון,אימייל,יעד אישי\nישראל ישראלי,0501234567,israel@example.com,5000\n';
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'ambassadors-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  private fromSnake(a: any): Ambassador {
    return {
      id:              a.id,
      campaignId:      a.campaign_id,
      fullName:        a.full_name,
      phone:           a.phone          ?? null,
      email:           a.email          ?? null,
      goalAmount:      a.goal_amount    ?? null,
      status:          a.status         ?? 'active',
      personalMessage: a.personal_message ?? '',
      personalTitle:   a.personal_title   ?? '',
      slug:            a.slug            ?? '',
      raisedOnline:    a.raised_online   ?? 0,
      raisedManual:    a.raised_manual   ?? 0,
      raisedTotal:     a.raised_total    ?? 0,
      donorCount:      a.donor_count     ?? 0,
      createdAt:       a.created_at,
    };
  }

  private toSnake(data: Partial<AmbassadorFormData>): Record<string, any> {
    const r: Record<string, any> = {};
    if (data.fullName         !== undefined) r['full_name']        = data.fullName;
    if (data.phone            !== undefined) r['phone']            = data.phone || null;
    if (data.email            !== undefined) r['email']            = data.email || null;
    if (data.goalAmount       !== undefined) r['goal_amount']      = data.goalAmount;
    if (data.personalMessage  !== undefined) r['personal_message'] = data.personalMessage;
    if (data.personalTitle    !== undefined) r['personal_title']   = data.personalTitle;
    return r;
  }
}
