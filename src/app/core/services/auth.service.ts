import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';

import { Observable } from 'rxjs';

import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';

declare const google: any;

export interface RegisterPayload {
  full_name: string;

  email: string;

  password: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,

    private router: Router,
  ) {}

  register(payload: RegisterPayload): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/auth/register`,

      payload,
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
