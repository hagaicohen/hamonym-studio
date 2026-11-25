import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { HmPublicTextPipe, campaignLang, publicText } from '../../../../../core/i18n/content-language';
import { HmTextRoleDirective } from '../../../studio/preview/text-role.directive';
import { CampaignBlock, CommentsBlockData, CommentsTextRole } from '../../../services/campaign-studio-state.service';
import { COMMENT_LIMITS, CampaignComment, CommentsService } from './comments-existing-api.adapter';
import { CommentsDesign, commentsDesign } from '../../../utils/comments-design';
import { elementColor } from '../../../utils/element-color';

const SAMPLE_AGE_HOURS = [2, 26, 74, 150];
let nextUid = 0;

// The campaign's comments section, on the public page and in the Studio. Real
// comments come from the campaign (not from this block); in the Studio, when
// there are none yet, clearly marked sample comments show the design, and the
// form never sends anything.
@Component({
  selector: 'app-campaign-comments',
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule, HmPublicTextPipe, HmTextRoleDirective],
  templateUrl: './campaign-comments.component.html',
  styleUrl: './campaign-comments.component.css',
  host: {
    '[attr.data-comments-style]': 'design.style',
    '[class.cm--two-col]': 'design.columns === 2',
    '[class.cm--center]': "design.align === 'center'",
    '[style.--cm-accent]': 'design.accentColor ?? campaignColor',
    '[style.--cm-gap.px]': 'design.gap',
    '[style.--cm-pad.px]': 'design.padding',
    '[style.--cm-section-bg]': 'surface("section", "background")',
    '[style.--cm-section-border]': 'surface("section", "borderColor")',
    '[style.--cm-section-radius]': 'radius("section")',
    '[style.--cm-card-bg]': 'surface("card", "background")',
    '[style.--cm-card-border]': 'surface("card", "borderColor")',
    '[style.--cm-card-radius]': 'radius("card")',
  },
})
export class CampaignCommentsComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) block!: CampaignBlock;
  @Input() slug: string | null | undefined = null;
  @Input() campaignColor = '#583cd6';
  // Studio / editing preview: sample comments, no submissions.
  @Input() editing = false;
  @Output() totalChange = new EventEmitter<number>();
  @ViewChild('track') track?: ElementRef<HTMLElement>;

  private readonly service = inject(CommentsService);
  private readonly t = publicText();
  readonly lang = campaignLang();
  readonly limits = COMMENT_LIMITS;
  readonly uid = `cm${++nextUid}`;

  comments: CampaignComment[] = [];
  total = 0;
  nextCursor: string | null = null;
  loaded = false;
  loadFailed = false;
  loadingMore = false;
  search = '';
  private readonly search$ = new Subject<string>();
  private readonly subs = new Subscription();
  private loadKey = '';
  private requestSeq = 0;

  form = { authorName: '', authorEmail: '', content: '', website: '' };
  tried = false;
  submitting = false;
  result: 'pending' | 'published' | null = null;
  error: string | null = null;

  constructor() {
    this.subs.add(this.search$.pipe(debounceTime(300)).subscribe(() => this.load()));
  }

  get data(): CommentsBlockData { return (this.block?.data ?? {}) as CommentsBlockData; }
  get design(): CommentsDesign { return commentsDesign(this.data); }

  ngOnChanges(): void {
    const key = `${this.slug ?? ''}|${this.design.initialCount}`;
    if (key !== this.loadKey) {
      this.loadKey = key;
      this.load();
    }
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  private load(): void {
    const seq = ++this.requestSeq;
    if (!this.slug) {
      this.comments = []; this.total = 0; this.nextCursor = null; this.loaded = true;
      return;
    }
    this.loadFailed = false;
    this.service.getComments(this.slug, { limit: this.design.initialCount, search: this.search }).subscribe({
      next: page => {
        if (seq !== this.requestSeq) return;
        this.comments = page.comments;
        this.total = page.total;
        this.nextCursor = page.nextCursor;
        this.loaded = true;
        if (!this.search) this.totalChange.emit(page.total);
      },
      error: () => {
        if (seq !== this.requestSeq) return;
        this.loaded = true;
        this.loadFailed = true;
      },
    });
  }

  loadMore(): void {
    if (!this.slug || !this.nextCursor || this.loadingMore) return;
    this.loadingMore = true;
    const seq = this.requestSeq;
    this.service.getComments(this.slug, { limit: this.design.initialCount, cursor: this.nextCursor, search: this.search }).subscribe({
      next: page => {
        this.loadingMore = false;
        if (seq !== this.requestSeq) return;
        const known = new Set(this.comments.map(c => c.id));
        this.comments = [...this.comments, ...page.comments.filter(c => !known.has(c.id))];
        this.nextCursor = page.nextCursor;
      },
      error: () => { this.loadingMore = false; },
    });
  }

  onSearch(term: string): void {
    this.search = term;
    this.search$.next(term);
  }

  // Studio only, while the campaign has no comments: sample content, marked as such.
  get showingSamples(): boolean {
    return this.editing && this.loaded && !this.comments.length && !this.search;
  }

  // Built once per count and language: a fresh list (and fresh times) on every
  // check would re-render the samples each time and change bound values mid-check.
  private samples: { key: string; list: CampaignComment[] } | null = null;
  get visible(): CampaignComment[] {
    if (!this.showingSamples) return this.comments;
    const lang = this.lang();
    const count = Math.min(4, this.design.initialCount);
    const key = `${lang}|${count}`;
    if (this.samples?.key !== key) {
      const now = Date.now();
      this.samples = { key, list: SAMPLE_AGE_HOURS.slice(0, count).map((hours, i) => ({
        id: `sample-${i}`,
        authorName: this.t(`publicPage.comments.samples.${i}.name`),
        content: this.t(`publicPage.comments.samples.${i}.text`),
        language: lang,
        createdAt: new Date(now - hours * 3_600_000),
      })) };
    }
    return this.samples.list;
  }


  readonly trackComment = (_: number, c: CampaignComment) => c.id;

  initial(name: string): string { return (name.trim()[0] ?? '?').toUpperCase(); }

  when(date: Date): string {
    const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
    if (minutes < 1) return this.t('publicPage.comments.justNow');
    if (minutes < 60) return this.t('publicPage.comments.ago.minutes', { count: minutes });
    if (minutes < 1440) return this.t('publicPage.comments.ago.hours', { count: Math.floor(minutes / 60) });
    if (minutes < 10080) return this.t('publicPage.comments.ago.days', { count: Math.floor(minutes / 1440) });
    const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  role(role: CommentsTextRole) { return this.data.textStyles?.[role]; }
  roleColor(role: CommentsTextRole): string | null { return elementColor(this.role(role), this.lang()) ?? null; }
  surface(kind: 'section' | 'card', prop: 'background' | 'borderColor'): string | null {
    return this.data.surfaceStyles?.[kind]?.[prop] || null;
  }
  radius(kind: 'section' | 'card'): string | null {
    const r = this.data.surfaceStyles?.[kind]?.borderRadius;
    return typeof r === 'number' ? `${r}px` : null;
  }

  // ── Carousel ──
  scrollCarousel(step: 1 | -1): void {
    const el = this.track?.nativeElement;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const amount = el.clientWidth * 0.9 * step;
    el.scrollBy({ left: rtl ? -amount : amount, behavior: 'smooth' });
  }

  // ── Visitor form ──
  get nameError(): string | null {
    const n = this.form.authorName.trim().length;
    if (!n) return 'publicPage.comments.errors.nameRequired';
    if (n < COMMENT_LIMITS.nameMin) return 'publicPage.comments.errors.nameShort';
    return null;
  }
  get contentError(): string | null {
    const n = this.form.content.trim().length;
    if (!n) return 'publicPage.comments.errors.contentRequired';
    if (n < COMMENT_LIMITS.contentMin) return 'publicPage.comments.errors.contentShort';
    return null;
  }

  touched(): void { this.result = null; this.error = null; }

  submit(): void {
    if (this.editing || this.submitting || !this.slug) return;
    this.tried = true;
    this.result = null;
    this.error = null;
    if (this.nameError || this.contentError) return;
    if (this.form.website || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.authorEmail.trim())) {
      this.error = 'publicPage.comments.errors.failed';
      return;
    }
    this.submitting = true;
    this.service.postComment(this.slug, {
      authorEmail: this.form.authorEmail, authorName: this.form.authorName, content: this.form.content, language: this.lang(), website: this.form.website,
    }).subscribe({
      next: r => {
        this.submitting = false;
        this.tried = false;
        this.form = { authorName: '', authorEmail: '', content: '', website: '' };
        this.result = r.status === 'published' ? 'published' : 'pending';
        if (r.comment && !this.search) {
          this.comments = [r.comment, ...this.comments];
          this.total++;
          this.totalChange.emit(this.total);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.submitting = false;
        const code = err?.error?.code;
        this.error = {
          INVALID_NAME: 'publicPage.comments.errors.nameShort',
          INVALID_CONTENT: 'publicPage.comments.errors.contentShort',
          RATE_LIMITED: 'publicPage.comments.errors.rateLimited',
          DUPLICATE_COMMENT: 'publicPage.comments.errors.duplicate',
          CAMPAIGN_NOT_FOUND: 'publicPage.comments.errors.closed',
        }[code as string] ?? 'publicPage.comments.errors.failed';
      },
    });
  }
}
