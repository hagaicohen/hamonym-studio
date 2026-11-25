import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { Json, ManagementModelService, money } from '../management-model.service';
import { ManagementViewService } from '../management-view.service';
import { StaticHtmlDirective } from '../fields';
import { ContentStateService, CollectionView } from './content-state.service';
import { ListControlsComponent, incomingSorts } from './list-controls.component';
import { VIEW_ICON, VIEW_LABEL } from './content-markup';
import { bindCarouselNav, updateCarouselNav } from './carousel-nav';
import { CampaignStateService } from '../../core/campaign-state.service';
import { DonorCardComponent, DonorCardOptions } from '../../public-page/cards/donor-card.component';
import { CommentCardComponent } from '../../public-page/cards/comment-card.component';

export type IncomingType = 'comments' | 'donors';

/** A row: a comment for review, or a donation (the public donor card, with review attributes). */
interface Row {
  index: number; item: Json; name: string; date: string; search: string; approved: boolean;
  donor: DonorCardOptions | null;
}

const recordDate = (r: Json): string => String(r['donatedAt'] || r['donated_at'] || r['createdAt'] || r['created_at'] || r['timestamp'] || r['date'] || '');

/**
 * Records supplied by visitors (comments, donations), for review (old engine
 * `huIncomingManagerForm` + `huInitIncoming`). The rows are the public cards (DonorCardComponent,
 * CommentCardComponent), rendered once per redraw; search and sort filter and reorder those nodes
 * in place, as before (the row list itself never changes until the next redraw).
 * Comments can be approved, un-approved or deleted; their text is never edited here.
 */
@Component({
  selector: 'section[ham-incoming]',
  standalone: true,
  imports: [StaticHtmlDirective, ListControlsComponent, DonorCardComponent, CommentCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-collection hu-incoming-collection', '[attr.data-hu-incoming]': 'type', '(click)': 'click($event)' },
  template: `<header class="hu-collection-header"><div><strong>{{ title }} · {{ count }} פריטים</strong><small>תצוגה לניהול ולבקרה</small></div><div class="hu-collection-views">@for (k of views; track k) {<button type="button" [attr.data-hu-incoming-view]="k" [class.active]="state.incomingView() === k" [attr.aria-label]="viewLabel[k]" [attr.title]="viewLabel[k]" [attr.aria-pressed]="state.incomingView() === k ? 'true' : 'false'" [hamStaticHtml]="viewIcon[k]"></button>}</div></header>
<div ham-list-controls [incoming]="true" [choices]="sorts" [query]="state.incomingQuery()" [sort]="state.incomingSort()" (queryChange)="state.incomingQuery.set($event); refresh()" (sortChange)="state.incomingSort.set($event); refresh()"></div>
<div #items class="hu-collection-items hu-incoming-items" [class.is-list]="state.incomingView() === 'list'" [class.is-carousel]="state.incomingView() === 'carousel'" data-hu-incoming-items>@for (row of rows; track row.index) {
  @if (row.donor) {<article ham-donor-card [item]="row.item" [options]="row.donor"></article>}
  @else {<article class="hu-incoming-card hu-comment-card-manager" [attr.data-hu-incoming-index]="row.index" [attr.data-hu-incoming-name]="row.name" [attr.data-hu-incoming-date]="row.date" [attr.data-hu-incoming-search]="row.search" [attr.data-hu-incoming-status]="row.approved ? 'approved' : 'pending'"><div class="hu-incoming-heading"><span class="hu-incoming-identity"><strong>{{ row.item['name'] || 'מגיב אנונימי' }}</strong><small>{{ row.date || 'ללא תאריך' }}</small></span><span class="hu-incoming-status" [class.is-approved]="row.approved" [class.is-pending]="!row.approved">{{ row.approved ? 'מאושרת' : 'ממתינה לאישור' }}</span></div><div class="ham-shared-comment-core"><article ham-comment-card [item]="row.item" [cfg]="commentCfg"></article></div><div class="hu-incoming-actions"><button type="button" class="hu-incoming-approval" [attr.data-hu-incoming-approve]="row.index">{{ row.approved ? 'בטל אישור' : 'אשר תגובה' }}</button><button type="button" class="hu-incoming-remove" [attr.data-hu-incoming-remove]="row.index">מחק</button></div></article>}
} @empty {<p class="hu-collection-empty">אין עדיין רשומות.</p>}</div><nav #nav class="hu-common-carousel-nav" aria-label="ניווט בקרוסלה"><button type="button" data-hu-car-prev aria-label="הקודם">‹</button><span class="hu-common-car-count">1 / 1</span><button type="button" data-hu-car-next aria-label="הבא">›</button></nav><p class="hu-incoming-no-match" [hidden]="!noMatch()">לא נמצאו תוצאות מתאימות.</p>`
})
export class IncomingComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) type: IncomingType = 'comments';

  readonly state = inject(ContentStateService);
  private readonly model = inject(ManagementModelService);
  private readonly view = inject(ManagementViewService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly campaignState = inject(CampaignStateService);
  @ViewChild('items', { static: true }) private items!: ElementRef<HTMLElement>;
  @ViewChild('nav', { static: true }) private nav!: ElementRef<HTMLElement>;

  readonly views: CollectionView[] = ['grid', 'list', 'carousel'];
  readonly viewIcon = VIEW_ICON;
  readonly viewLabel = VIEW_LABEL;
  readonly noMatch = signal(false);
  /** The records as of the redraw that built the list. */
  rows: Row[] = [];
  /** Comment cards in the list show no avatar and no likes. */
  commentCfg: Json = {};
  private cards: HTMLElement[] = [];
  private unbind: (() => void) | null = null;

  get title(): string { return this.type === 'comments' ? 'תגובות' : 'תורמים'; }
  get sorts() { return incomingSorts(this.type === 'comments'); }
  get count(): number { return this.model.partsFor(this.type).length; }

  ngOnInit(): void {
    const comments = this.type === 'comments';
    this.commentCfg = { ...this.campaignState.current['content'].comments, showAvatars: false, showLikes: false };
    this.rows = this.model.partsFor(this.type).map((r, i): Row => {
      const detail = comments ? String(r['text'] || '') : String(r['dedication'] || '');
      const date = recordDate(r);
      const approved = comments ? r['approved'] !== false : true;
      const amount = comments ? '' : (Number(r['amount'] || 0) ? money(Number(r['amount'] || 0)) : '');
      const search = (String(r['name'] || '') + ' ' + detail + ' ' + date + ' ' + amount + ' ' + (approved ? 'מאושר' : 'ממתין')).toLocaleLowerCase('he');
      const donor: DonorCardOptions | null = comments ? null : { context: 'manager', index: i, showAmount: true, showTime: true, showDedication: true, searchable: search };
      return { index: i, item: r, name: String(r['name'] || ''), date, search, approved, donor };
    });
  }

  ngAfterViewInit(): void {
    const host = this.items.nativeElement;
    this.cards = Array.from(host.querySelectorAll<HTMLElement>('[data-hu-incoming-index]'));
    const unbindNav = bindCarouselNav(host, this.nav.nativeElement);
    // In a collapsed group (donors, "תרומות וגיוס") the list has no layout to measure: the arrows
    // and the counter are measured again when the group opens.
    const group = host.closest('details');
    const onToggle = (): void => { if (group?.open) updateCarouselNav(host, this.nav.nativeElement); };
    group?.addEventListener('toggle', onToggle);
    this.unbind = () => { unbindNav(); group?.removeEventListener('toggle', onToggle); };
    this.afterDraw(() => this.refresh());
  }

  /**
   * The list was filtered and measured right after the redraw that built it (old `huInitIncoming`
   * ran after the page was written): measuring during change detection can see a layout that the
   * rest of the redraw still changes.
   */
  private afterDraw(run: () => void): void {
    if (!this.view.drawing()) { run(); return; }
    const off = this.view.onDraw(() => { off(); run(); });
  }
  ngOnDestroy(): void { this.unbind?.(); }

  /** Filter and order the rows (old `refresh`). */
  refresh(): void {
    const query = this.state.incomingQuery().trim().toLocaleLowerCase('he'), v = this.state.incomingSort(), host = this.items.nativeElement;
    const visible = this.cards.filter(c => (c.dataset['huIncomingSearch'] || '').includes(query));
    visible.sort((a, b) => {
      if (v === 'name') return (a.dataset['huIncomingName'] || '').localeCompare(b.dataset['huIncomingName'] || '', 'he');
      if (v === 'newest' || v === 'oldest') {
        const delta = (a.dataset['huIncomingDate'] || '').localeCompare(b.dataset['huIncomingDate'] || '');
        return (v === 'newest' ? -delta : delta) || (Number(a.dataset['huIncomingIndex']) - Number(b.dataset['huIncomingIndex']));
      }
      if (v === 'pending' || v === 'approved') return Number(b.dataset['huIncomingStatus'] === v) - Number(a.dataset['huIncomingStatus'] === v);
      return 0;
    });
    this.cards.forEach(c => { c.hidden = true; });
    visible.forEach(c => { c.hidden = false; host.appendChild(c); });
    this.noMatch.set(visible.length === 0 && this.cards.length !== 0);
    this.updateNav();
  }

  click(e: MouseEvent): void {
    const target = e.target as Element;
    const viewButton = target.closest<HTMLElement>('[data-hu-incoming-view]');
    if (viewButton) { this.state.incomingView.set(viewButton.dataset['huIncomingView'] as CollectionView); this.updateNav(); return; }
    const approve = target.closest<HTMLElement>('[data-hu-incoming-approve]'), remove = target.closest<HTMLElement>('[data-hu-incoming-remove]');
    if (!approve && !remove) return;
    const index = Number(approve ? approve.dataset['huIncomingApprove'] : remove!.dataset['huIncomingRemove']);
    const data = this.model.partsFor('comments'), record = data[index];
    if (!record) return;
    if (remove && !confirm('למחוק את התגובה הזו?')) return;
    const ctx = this.model.context;
    ctx.snapshot();
    if (remove) data.splice(index, 1); else record['approved'] = record['approved'] === false;
    ctx.persist();
    ctx.renderPreview();
    this.view.redraw();
  }

  private updateNav(): void { this.cdr.detectChanges(); updateCarouselNav(this.items.nativeElement, this.nav.nativeElement); }
}
