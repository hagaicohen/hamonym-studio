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

export type CommentStatus = 'pending' | 'published' | 'hidden';
export type CommentModeration = 'auto' | 'approval';
export interface ManagedCampaignComment extends CampaignComment { status: CommentStatus; }
interface ManagedCommentPage {
  comments: (Omit<ManagedCampaignComment, 'createdAt'> & { createdAt: string })[];
  nextCursor: string | null;
  total: number;
  counts: Record<CommentStatus, number>;
  moderation: CommentModeration;
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

  listForManager(campaignId: string, status: CommentStatus | '', cursor: string | null): Observable<Omit<ManagedCommentPage, 'comments'> & { comments: ManagedCampaignComment[] }> {
    let params = new HttpParams().set('limit', 25);
    if (status) params = params.set('status', status);
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<ManagedCommentPage>(this.managementUrl(campaignId), {
      params, headers: this.managementHeaders(),
    }).pipe(map(page => ({ ...page, comments: page.comments.map(comment => ({ ...comment, createdAt: new Date(comment.createdAt) })) })));
  }

  setStatus(campaignId: string, commentId: string, status: 'published' | 'hidden'): Observable<unknown> {
    return this.http.patch(this.managementUrl(campaignId, commentId), { status }, { headers: this.managementHeaders() });
  }

  remove(campaignId: string, commentId: string): Observable<unknown> {
    return this.http.delete(this.managementUrl(campaignId, commentId), { headers: this.managementHeaders() });
  }

  setModeration(campaignId: string, moderation: CommentModeration): Observable<{ moderation: CommentModeration }> {
    return this.http.patch<{ moderation: CommentModeration }>(this.managementUrl(campaignId, 'settings'), {
      moderation,
    }, { headers: this.managementHeaders() });
  }

  private managementUrl(campaignId: string, resource?: string): string {
    return `${this.apiUrl}/manage/${encodeURIComponent(campaignId)}${resource ? '/' + encodeURIComponent(resource) : ''}`;
  }

  private managementHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${localStorage.getItem('token')}` };
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
