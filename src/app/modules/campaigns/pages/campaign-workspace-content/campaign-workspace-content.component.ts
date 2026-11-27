import { DropdownComponent, DropdownOptionComponent } from '../../../../shared/ui/dropdown/dropdown.component';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { CommentModeration, CommentStatus, CommentsService, ManagedCampaignComment } from '../../services/comments.service';
import { CampaignDashboardUpdatesComponent } from '../campaign-dashboard-page/sections/campaign-dashboard-updates/campaign-dashboard-updates.component';

@Component({
  standalone: true,
  imports: [DropdownComponent, DropdownOptionComponent, CampaignDashboardUpdatesComponent, DatePipe, FormsModule],
  template: `
    <section class="cm-v7">
      <header class="cm-heading">
        <div><h1>עדכונים ותגובות</h1><p class="cm-description">ניהול עדכוני הקמפיין ותגובות הקהל</p></div>
        @if (tab === 'updates' && composer && !composer.loading && !composer.loadError) {
          <button class="cm-button cm-primary" type="button" (click)="composer.openComposer()">הוספת עדכון</button>
        }
      </header>
      <div class="cm-summary">
        <div><small>עדכונים שפורסמו</small><strong>{{ composer ? composer.publishedCount : '—' }}</strong></div>
        <div><small>טיוטות</small><strong>{{ composer ? composer.draftCount : '—' }}</strong></div>
        <div><small>תגובות גלויות</small><strong>{{ counts?.published ?? '—' }}</strong></div>
      </div>
      <section class="cm-ledger">
        <div class="cm-tabs" role="group" aria-label="תוכן הקמפיין">
          <button type="button" [attr.aria-pressed]="tab === 'updates'" (click)="tab = 'updates'">עדכונים</button>
          <button type="button" [attr.aria-pressed]="tab === 'comments'" (click)="showComments()">תגובות</button>
        </div>
        <app-campaign-dashboard-updates #composer [hidden]="tab !== 'updates'" [campaignId]="campaignId"
          [composeOnLoad]="composeOnLoad" [workspaceMode]="true" />
        @if (tab === 'comments') {
          <section class="comment-list">
            <div class="cm-heading"><h2 class="cm-panel-title">תגובות לקמפיין</h2>
              @if (moderation) {
                <label>אישור תגובות
                  <app-dropdown [ngModel]="moderation" [disabled]="commentSaving" (ngModelChange)="setModeration($event)">
                    <app-dropdown-option value="approval">אישור ידני</app-dropdown-option><app-dropdown-option value="auto">פרסום אוטומטי</app-dropdown-option>
                  </app-dropdown>
                </label>
              }
            </div>
            <div class="cm-filters">
              <app-dropdown label="סינון תגובות לפי סטטוס" [(ngModel)]="commentFilter" [disabled]="commentsLoading || commentSaving" (ngModelChange)="resetComments()">
                <app-dropdown-option value="">כל הסטטוסים</app-dropdown-option><app-dropdown-option value="pending">ממתינה לאישור</app-dropdown-option><app-dropdown-option value="published">פורסמה</app-dropdown-option><app-dropdown-option value="hidden">מוסתרת</app-dropdown-option>
              </app-dropdown>
            </div>
            @if (commentsLoading) { <p role="status">טוען תגובות…</p> }
            @else if (commentsError) { <p role="alert">{{ commentsError }}</p> }
            @else if (!comments.length) { <p>אין תגובות</p> }
            @for (comment of comments; track comment.id) {
              <article class="comment-row">
                <strong>{{ comment.authorName }} <small>{{ statusLabels[comment.status] }}</small></strong>
                <time>{{ comment.createdAt | date:'dd/MM/yyyy' }}</time>
                <button class="cm-button" type="button" (click)="selectedComment = comment">פרטים</button>
              </article>
            }
            @if (cursorHistory.length || nextCursor) {
              <div class="comment-pages">
                <button class="cm-button" type="button" [disabled]="!cursorHistory.length || commentsLoading" (click)="previousComments()">הקודם</button>
                <span>{{ totalComments }} תגובות</span>
                <button class="cm-button" type="button" [disabled]="!nextCursor || commentsLoading" (click)="nextComments()">הבא</button>
              </div>
            }
          </section>
        }
      </section>
    </section>
    @if (selectedComment; as comment) {
      <div class="cm-drawer-backdrop" (click)="closeComment()"></div>
      <section class="cm-drawer comment-drawer" role="dialog" aria-modal="true" aria-labelledby="comment-drawer-title" (keydown.escape)="closeComment()">
        <header class="cm-drawer-head">
          <h2 id="comment-drawer-title">פרטי תגובה</h2>
          <button class="cm-button" type="button" (click)="closeComment()" aria-label="סגירה">×</button>
        </header>
        <div class="cm-drawer-body">
          <strong>{{ comment.authorName }}</strong>
          <time>{{ comment.createdAt | date:'dd/MM/yyyy' }}</time>
          <p>{{ comment.content }}</p>
          <p>{{ statusLabels[comment.status] }}</p>
          @if (commentsError) { <p role="alert">{{ commentsError }}</p> }
          @if (confirmRemoval) { <p role="alert">האם למחוק את התגובה לצמיתות?</p> }
        </div>
        <footer class="cm-drawer-foot">
          @if (confirmRemoval) {
            <button class="cm-button" type="button" [disabled]="commentSaving" (click)="confirmRemoval = false">ביטול</button>
            <button class="cm-button" type="button" [disabled]="commentSaving" (click)="removeComment(comment)">אישור מחיקה</button>
          } @else {
            <button class="cm-button" type="button" [disabled]="commentSaving" (click)="confirmRemoval = true">מחיקה</button>
            <button class="cm-button cm-primary" type="button" [disabled]="commentSaving"
              (click)="changeCommentStatus(comment, comment.status === 'published' ? 'hidden' : 'published')">
              {{ comment.status === 'published' ? 'הסתרה' : 'פרסום' }}
            </button>
          }
        </footer>
      </section>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    [hidden] { display: none !important; }
    .comment-list { display: grid; gap: 10px; padding-top: 18px; }
    .comment-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--campaign-border); border-radius: 8px; }
    .comment-pages { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    time { color: var(--campaign-muted); font-size: 12px; }
    .comment-drawer p { white-space: pre-wrap; overflow-wrap: anywhere; }
  `],
})
export class CampaignWorkspaceContentComponent {
  private readonly route = inject(ActivatedRoute);
  readonly campaignId = this.route.snapshot.paramMap.get('id') ?? '';
  composeOnLoad = this.route.snapshot.queryParamMap.get('action') === 'new';
  private readonly commentsApi = inject(CommentsService);
  tab: 'updates' | 'comments' = 'updates';
  comments: ManagedCampaignComment[] = [];
  counts: Record<CommentStatus, number> | null = null;
  selectedComment: ManagedCampaignComment | null = null;
  commentsLoading = false;
  commentSaving = false;
  commentsError = '';
  commentFilter: CommentStatus | '' = '';
  moderation: CommentModeration | null = null;
  confirmRemoval = false;
  totalComments = 0;
  cursorHistory: (string | null)[] = [];
  private cursor: string | null = null;
  nextCursor: string | null = null;
  readonly statusLabels: Record<CommentStatus, string> = { pending: 'ממתינה לאישור', published: 'פורסמה', hidden: 'מוסתרת' };

  constructor() {
    inject(AppLoaderService).hide();
    if (this.campaignId) this.loadComments();
  }

  showComments(): void { this.tab = 'comments'; }

  closeComment(): void {
    if (this.commentSaving) return;
    this.selectedComment = null;
    this.confirmRemoval = false;
  }

  resetComments(): void {
    this.cursor = null;
    this.cursorHistory = [];
    this.loadComments();
  }

  previousComments(): void {
    if (!this.cursorHistory.length || this.commentsLoading) return;
    this.cursor = this.cursorHistory.pop() ?? null;
    this.loadComments();
  }

  nextComments(): void {
    if (!this.nextCursor || this.commentsLoading) return;
    this.cursorHistory.push(this.cursor);
    this.cursor = this.nextCursor;
    this.loadComments();
  }

  changeCommentStatus(comment: ManagedCampaignComment, status: 'published' | 'hidden'): void {
    if (this.commentSaving) return;
    this.commentSaving = true;
    this.commentsError = '';
    this.commentsApi.setStatus(this.campaignId, comment.id, status).subscribe({
      next: () => this.afterCommentChange(),
      error: () => this.failCommentChange('שינוי סטטוס התגובה נכשל'),
    });
  }

  removeComment(comment: ManagedCampaignComment): void {
    if (!this.confirmRemoval || this.commentSaving) return;
    this.commentSaving = true;
    this.commentsError = '';
    this.commentsApi.remove(this.campaignId, comment.id).subscribe({
      next: () => this.afterCommentChange(),
      error: () => this.failCommentChange('מחיקת התגובה נכשלה'),
    });
  }

  setModeration(mode: CommentModeration): void {
    if (this.commentSaving) return;
    this.commentSaving = true;
    this.commentsError = '';
    this.commentsApi.setModeration(this.campaignId, mode).subscribe({
      next: result => { this.commentSaving = false; this.moderation = result.moderation; },
      error: () => this.failCommentChange('שמירת הגדרת האישור נכשלה'),
    });
  }

  private afterCommentChange(): void {
    this.commentSaving = false;
    this.closeComment();
    this.loadComments();
  }

  private failCommentChange(message: string): void {
    this.commentSaving = false;
    this.commentsError = message;
  }

  private loadComments(): void {
    this.commentsLoading = true;
    this.commentsError = '';
    this.commentsApi.listForManager(this.campaignId, this.commentFilter, this.cursor).subscribe({
      next: result => {
        this.comments = result.comments;
        this.nextCursor = result.nextCursor;
        this.totalComments = result.total;
        this.counts = result.counts;
        this.moderation = result.moderation;
        this.commentsLoading = false;
      },
      error: () => { this.commentsLoading = false; this.commentsError = 'טעינת התגובות נכשלה'; },
    });
  }
}
