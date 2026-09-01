import { Injectable, inject } from '@angular/core';

import { HttpClient, HttpHeaders } from '@angular/common/http';

import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class BillingApiService {
  private http = inject(HttpClient);

  initOpenFields(entityId: string): Observable<any> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    });

    return this.http.post(
      `${environment.apiUrl}/api/billing/init-openfields`,

      { entityId },

      { headers },
    );
  }
}
