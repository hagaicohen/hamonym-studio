import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UploadService {
  private http = inject(HttpClient);

  upload(file: File, folder: string): Observable<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    return this.http.post<{ url: string }>(
      `${environment.apiUrl}/api/media/upload`,
      formData,
      { headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` } }
    ).pipe(map(res => res.url));
  }
}
