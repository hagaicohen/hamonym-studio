import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ElementRef, Input, OnDestroy, TemplateRef, ViewChild, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Json, MODULE_LABELS, ModuleType, money } from '../management-model.service';
import { ManagementViewService } from '../management-view.service';
import { StaticHtmlDirective } from '../fields';
import { MediaStoreService } from '../../media/media-store.service';
import { ContentStateService, CollectionView } from './content-state.service';
import { ListControlsComponent, COLLECTION_SORTS } from './list-controls.component';
import { UpdateCardComponent } from '../../public-page/cards/update-card.component';
import { VIEW_ICON, VIEW_LABEL } from './content-markup';
import { bindCarouselNav, updateCarouselNav } from './carousel-nav';
import { CampaignStateService } from '../../core/campaign-state.service';

export type CollectionType = Extract<ModuleType, 'rewards' | 'sponsors' | 'updates'>;

const NAMES: Record<CollectionType, (r: Json) => string> = {
  rewards: r => r['name'] || 'תשורה ללא שם', sponsors: r => r['name'] || 'חסות ללא שם', updates: r => r['title'] || 'עדכון ללא כותרת'
};
const DETAILS: Record<CollectionType, (r: Json) => string> = {
  rewards: r => [r['description'], Number(r['price'] || r['amount']) ? money(Number(r['price'] || r['amount'])) : ''].filter(Boolean).join(' · '),
  sponsors: () => '',
  updates: r => r['text'] || r['date'] || ''
};
const IMAGE_KEY: Record<CollectionType, string> = { rewards: 'image', sponsors: 'logo', updates: 'image' };
const PLACEHOLDER: Record<CollectionType, string> = { rewards: '🎁', sponsors: '◇', updates: '◷' };
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

interface Card {
  index: number; name: string; detail: string; img: { src: string; ref: string | null; raw: string } | null;
  /** Updates show the public update card (UpdateCardComponent), with images. */
  update: { item: Json; cfg: Json } | null;
}

/**
 * Compact collection of a content module (old engine `huCompactModule`): cards with view modes,
 * search and sort, and an edit dialog showing the item's full editor. The editors of the other
 * items stay in the hidden shelf, as before (other code looks them up by their data attributes).
 * The collection is part of a page that is rebuilt on every redraw; view, search and sort live in
 * ContentStateService, so they survive it.
 */
@Component({
  selector: 'section[ham-collection]',
  standalone: true,
  imports: [NgTemplateOutlet, StaticHtmlDirective, ListControlsComponent, UpdateCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-collection', '[attr.data-hu-collection]': 'type', '(click)': 'click($event)', '(keydown)': 'key($event)' },
  template: `<header class="hu-collection-header"><div><strong>{{ label }} · {{ items.length }} פריטים</strong><small>לחצו על כרטיס לעריכה בחלון נפרד</small></div><div class="hu-collection-views">@for (k of views; track k) {<button type="button" [attr.data-hu-collection-view]="k" [class.active]="state.collectionView() === k" [attr.aria-label]="viewLabel[k]" [attr.title]="viewLabel[k]" [attr.aria-pressed]="state.collectionView() === k ? 'true' : 'false'" [hamStaticHtml]="viewIcon[k]"></button>}</div></header>
<div ham-list-controls [choices]="sorts" [query]="state.collectionQuery()" [sort]="state.collectionSort()" (queryChange)="search($event)" (sortChange)="resort($event)"></div>
<div #track class="hu-collection-items" id="huCollectionItems" [class.is-list]="state.collectionView() === 'list'" [class.is-carousel]="state.collectionView() === 'carousel'">@for (c of visible(); track c.index) {
  @switch (type) {
    @case ('sponsors') {<div class="hu-sponsor-collection-row"><button type="button" class="hu-collection-card" [attr.data-hu-collection-edit]="c.index" [attr.aria-label]="'ערוך ' + c.name"><span class="hu-collection-thumb">@if (c.img) {<img [attr.data-ham-sponsor-media]="c.img.raw" [attr.src]="c.img.src" [attr.data-ham-media-ref]="c.img.ref" alt="">} @else {<span aria-hidden="true">◇</span>}</span><span class="hu-collection-card-copy"><strong>{{ c.name }}</strong></span><span class="hu-collection-pencil" aria-hidden="true">✎</span></button><button type="button" class="hu-sponsor-collection-delete" data-hu-remove-item="sponsors" [attr.data-i]="c.index" title="מחק חסות" [attr.aria-label]="'מחק את החסות ' + c.name"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg></button></div>}
    @default {
      @if (c.update) {<div role="button" tabindex="0" class="hu-collection-card ham-shared-manager-card" [attr.data-hu-collection-edit]="c.index" [attr.aria-label]="'ערוך ' + c.name"><article ham-update-card [item]="c.update.item" [cfg]="c.update.cfg" [index]="c.index"></article><span class="hu-collection-pencil" aria-hidden="true">✎</span></div>}
      @else {<button type="button" class="hu-collection-card" [attr.data-hu-collection-edit]="c.index" [attr.aria-label]="'ערוך ' + c.name"><span class="hu-collection-thumb">@if (c.img) {<img [attr.src]="c.img.src" [attr.data-ham-media-ref]="c.img.ref" alt="">} @else {<span aria-hidden="true">{{ placeholder }}</span>}</span><span class="hu-collection-card-copy"><strong>{{ c.name }}</strong><small>{{ c.detail.slice(0, 100) }}</small></span><span class="hu-collection-pencil" aria-hidden="true">✎</span></button>}
    }
  }
} @empty {<p class="hu-collection-empty">לא נמצאו פריטים מתאימים.</p>}</div><nav #nav class="hu-common-carousel-nav" aria-label="ניווט בקרוסלה"><button type="button" data-hu-car-prev aria-label="הקודם">‹</button><span class="hu-common-car-count">1 / 1</span><button type="button" data-hu-car-next aria-label="הבא">›</button></nav>
<div class="hu-collection-shelf" hidden>@for (item of items; track $index; let i = $index) {@if (open() !== i) {<ng-container *ngTemplateOutlet="editor; context: { $implicit: item, index: i }" />}}</div>
<div class="hu-collection-modal" [hidden]="open() === null"><div class="hu-collection-backdrop" data-hu-collection-close></div><div #dialog class="hu-collection-dialog" role="dialog" aria-modal="true" aria-label="עריכת פריט"><header class="hu-collection-dialog-head"><strong id="huCollectionDialogTitle">{{ dialogTitle() }}</strong><button type="button" data-hu-collection-close aria-label="סגור">✕</button></header><div class="hu-collection-editor-slot">@if (open() !== null) {<ng-container *ngTemplateOutlet="editor; context: { $implicit: items[open()!], index: open()! }" />}</div><footer class="hu-collection-dialog-foot"><button type="button" class="hu-action primary" data-hu-collection-save>שמור וסגור</button></footer></div></div>`
})
export class CollectionComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) type: CollectionType = 'rewards';
  @Input({ required: true }) items: Json[] = [];
  /** Full editor of one item (`$implicit`: the item, `index`). */
  @Input({ required: true }) editor!: TemplateRef<{ $implicit: Json; index: number }>;

  readonly state = inject(ContentStateService);
  private readonly view = inject(ManagementViewService);
  private readonly media = inject(MediaStoreService);
  private readonly campaignState = inject(CampaignStateService);
  private readonly cdr = inject(ChangeDetectorRef);
  @ViewChild('track', { static: true }) private track!: ElementRef<HTMLElement>;
  @ViewChild('nav', { static: true }) private nav!: ElementRef<HTMLElement>;
  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLElement>;

  readonly views: CollectionView[] = ['grid', 'list', 'carousel'];
  readonly viewIcon = VIEW_ICON;
  readonly viewLabel = VIEW_LABEL;
  readonly sorts = COLLECTION_SORTS;
  /** Index of the item open in the edit dialog. */
  readonly open = signal<number | null>(null);
  readonly dialogTitle = signal('עריכת פריט');
  private unbind: (() => void) | null = null;

  get label(): string { return MODULE_LABELS[this.type]; }
  get placeholder(): string { return PLACEHOLDER[this.type]; }

  /** Cards in their display order (old `updateList`), from the items as of the redraw. */
  private cards: Card[] = [];
  readonly visible = computed(() => {
    const term = this.state.collectionQuery().trim().toLocaleLowerCase('he'), sort = this.state.collectionSort();
    const out = this.cards.filter(c => (c.name + ' ' + c.detail).toLocaleLowerCase('he').includes(term));
    if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    if (sort === 'reverse') out.reverse();
    return out;
  });

  ngOnInit(): void {
    const updates = this.campaignState.current['content'].updates;
    this.cards = this.items.map((r, i): Card => {
      const raw = r[IMAGE_KEY[this.type]];
      const update = this.type === 'updates' ? { item: { ...r, _sourceIndex: i }, cfg: { ...updates, showImages: true } } : null;
      const pattern = this.type === 'sponsors' ? /^(data:image\/|blob:|https?:|hamonymmedia:)/i : /^(data:image\/|blob:|https?:)/i;
      return { index: i, name: NAMES[this.type](r), detail: String(DETAILS[this.type](r)), update, img: typeof raw === 'string' && pattern.test(raw) ? this.image(raw) : null };
    });
    const again = this.state.reopen;
    if (again && again.type === this.type && this.items[again.index]) {
      this.dialogTitle.set('עריכת ' + NAMES[this.type](this.items[again.index]));
      this.open.set(again.index);
    }
  }

  ngAfterViewInit(): void {
    this.unbind = bindCarouselNav(this.track.nativeElement, this.nav.nativeElement);
    // Measured after the redraw that built the collection, like the old `huCompactModule`.
    if (!this.view.drawing()) this.refreshNav();
    else { const off = this.view.onDraw(() => { off(); this.refreshNav(); }); }
  }
  ngOnDestroy(): void { this.unbind?.(); }

  search(term: string): void { this.state.collectionQuery.set(term); this.refreshNav(); }
  resort(sort: string): void { this.state.collectionSort.set(sort); this.refreshNav(); }

  click(e: MouseEvent): void {
    const target = e.target as Element;
    const viewButton = target.closest<HTMLElement>('[data-hu-collection-view]');
    if (viewButton) { this.state.collectionView.set(viewButton.dataset['huCollectionView'] as CollectionView); this.refreshNav(); return; }
    const edit = target.closest<HTMLElement>('[data-hu-collection-edit]');
    if (edit) {
      const i = Number(edit.dataset['huCollectionEdit']);
      if (!this.items[i]) return;
      this.dialogTitle.set('עריכת ' + NAMES[this.type](this.items[i]));
      this.open.set(i);
      document.body.classList.add('hu-collection-editing');
      this.detect();
      this.dialog.nativeElement.scrollTop = 0;
      return;
    }
    if (target.closest('[data-hu-collection-close],[data-hu-collection-save]')) { e.preventDefault(); this.close(); }
  }

  key(e: KeyboardEvent): void {
    const card = (e.target as Element).closest<HTMLElement>('.ham-shared-manager-card[data-hu-collection-edit]');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); card.click(); }
  }

  /** Back to the collection; the page is redrawn with the edited data (as before). */
  private close(): void {
    this.open.set(null);
    document.body.classList.remove('hu-collection-editing');
    this.view.redraw();
  }

  private refreshNav(): void { this.detect(); updateCarouselNav(this.track.nativeElement, this.nav.nativeElement); }
  private detect(): void { this.cdr.detectChanges(); }
  private image(raw: string): Card['img'] {
    const pending = raw.startsWith('hamonymmedia:');
    const ready = pending ? (this.media.src(raw) || '') : raw;
    return { raw, src: /^(https?:\/\/|blob:|data:image\/)/i.test(ready) ? ready : BLANK_GIF, ref: pending ? raw : null };
  }
}
