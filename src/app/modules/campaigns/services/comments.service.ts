import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface CampaignComment {
  id: string;
  authorName: string;
  content: string;
  createdAt: Date;
}

@Injectable({ providedIn: 'root' })
export class CommentsService {
  private http   = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/comments`;

  getComments(slug: string, search?: string): Observable<CampaignComment[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<{ comments: any[] }>(`${this.apiUrl}/campaign/${slug}`, { params }).pipe(
      map(r => (r.comments ?? []).map(c => ({
        id: c.id,
        authorName: c.authorName,
        content: c.content,
        createdAt: new Date(c.createdAt),
      }))),
    );
  }

  postComment(slug: string, payload: { authorName: string; authorEmail: string; content: string }): Observable<CampaignComment> {
    return this.http.post<{ comment: any }>(`${this.apiUrl}/campaign/${slug}`, payload).pipe(
      map(r => ({
        id: r.comment.id,
        authorName: r.comment.authorName,
        content: r.comment.content,
        createdAt: new Date(r.comment.createdAt),
      })),
    );
  }
}
