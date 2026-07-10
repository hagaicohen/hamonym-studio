import { inject, Injectable, signal } from '@angular/core';

import { HttpClient, HttpHeaders } from '@angular/common/http';

import { Observable, tap } from 'rxjs';

import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';

declare const google: any;

export interface RegisterPayload {
  full_name: string;

  email: string;

  password: string;
}

export interface CurrentUser {
  id: number;
  full_name: string;
  email: string;
  picture?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  // Shared across every component that needs the logged-in user's name/email/
  // picture (topbar, settings page, ...) so an update in one place (e.g. the
  // settings page name edit) reflects everywhere without a full reload.
  readonly currentUser = signal<CurrentUser | null>(this._loadUserFromStorage());

  constructor(
    private http: HttpClient,

    private router: Router,
  ) {}

  private _loadUserFromStorage(): CurrentUser | null {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  register(payload: RegisterPayload): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/auth/register`,

      payload,
    );
  }

  private authHeaders(): { headers: HttpHeaders } {
    return { headers: new HttpHeaders({ Authorization: `Bearer ${this.getToken()}` }) };
  }

  updateProfile(fullName: string): Observable<{ user: CurrentUser }> {
    return this.http.patch<{ user: CurrentUser }>(
      `${this.apiUrl}/auth/me`,
      { full_name: fullName },
      this.authHeaders(),
    ).pipe(
      tap((res) => {
        localStorage.setItem('user', JSON.stringify(res.user));
        this.currentUser.set(res.user);
      }),
    );
  }

  changePassword(newPassword: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${this.apiUrl}/auth/me/change-password`,
      { newPassword },
      this.authHeaders(),
    );
  }

  saveToken(token: string): void {
    localStorage.setItem('token', token);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  logout(): void {
    localStorage.clear();

    try {
      google.accounts.id.disableAutoSelect();
    } catch (e) {}

    window.location.href = '/login';
  }
}
