import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { CommentsService as ExistingCommentsService, CampaignComment as ExistingComment } from '../../../services/comments.service';
export type CampaignComment = ExistingComment & { language?: string };
export const COMMENT_LIMITS = { nameMin: 2, nameMax: 100, contentMin: 2, contentMax: 2000 };
// Presentation adapter: retain Main's existing GET response and required email POST contract.
@Injectable({ providedIn: 'root' })
export class CommentsService {
  private readonly existing = inject(ExistingCommentsService);
  getComments(slug: string, options: { limit: number; search?: string; cursor?: string }) {
    return this.existing.getComments(slug, options.search).pipe(map(comments => {
      const start = Number(options.cursor) || 0;
      const end = start + options.limit;
      return { comments: comments.slice(start, end), total: comments.length, nextCursor: end < comments.length ? String(end) : null };
    }));
  }
  postComment(slug: string, payload: { authorName: string; authorEmail: string; content: string; language?: string; website?: string }) {
    return this.existing.postComment(slug, { authorName: payload.authorName, authorEmail: payload.authorEmail, content: payload.content })
      .pipe(map(comment => ({ status: 'published' as const, comment })));
  }
}
