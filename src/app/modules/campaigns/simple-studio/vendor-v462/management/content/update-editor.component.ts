import { ChangeDetectionStrategy, Component, ElementRef, Input, OnInit, ViewChild, inject } from '@angular/core';
import { Json } from '../management-model.service';
import { StaticHtmlDirective } from '../fields';
import { MediaStoreService } from '../../media/media-store.service';
import { TRASH_ICON } from './content-markup';
import { CampaignCardsService } from '../../public-page/campaign-cards.service';
import { CampaignStateService } from '../../core/campaign-state.service';
import { UpdatePreviewComponent } from '../../public-page/cards/update-preview.component';
import { ItemImage, itemImage } from './item-image';

/**
 * Full editor of one update (old engine `updateManagerForm`, one item). Item 0 is the campaign's
 * main update, shared with the builder, and cannot be deleted.
 */
@Component({
  selector: 'section[ham-update-editor]',
  standalone: true,
  imports: [StaticHtmlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-rich-editor hu-update-editor', '[attr.data-hu-collection-index]': 'i' },
  template: `<div class="hu-rich-edit-main"><div class="hu-rich-heading"><div><strong>{{ i === 0 ? 'עדכון ראשי' : 'עדכון ' + (i + 1) }}</strong><small>{{ item['title'] || 'ללא כותרת' }}</small></div>@if (i === 0) {<span class="hu-rich-source">משותף לבילדר</span>} @else {<button type="button" class="hu-reward-delete" data-hu-remove-item="updates" [attr.data-i]="i" [attr.aria-label]="'מחק פריט ' + (i + 1)" title="מחק" [hamStaticHtml]="trash"></button>}</div><section class="hu-update-preview-top" aria-label="תצוגה מקדימה של העדכון"><div class="hu-race-mini-head"><strong>תצוגה מקדימה</strong><small>כך ייראה העדכון בקמפיין, בקנה מידה קטן</small></div><div class="hu-update-preview-frame" #preview [attr.data-hu-update-preview]="i"></div></section><div class="hu-rich-grid"><label class="wide">כותרת העדכון<input data-hu-item="updates" [attr.data-i]="i" data-key="title" [value]="item['title'] || ''" placeholder="מה חדש בקמפיין?"></label><label>תאריך<input type="date" data-hu-item="updates" [attr.data-i]="i" data-key="date" [value]="item['date'] || ''"></label><label>פרסום<select data-hu-item="updates" [attr.data-i]="i" data-key="status"><option value="published" [selected]="item['status'] !== 'draft'">מפורסם בדף</option><option value="draft" [selected]="item['status'] === 'draft'">טיוטה</option></select></label><label class="wide">קישור לסרטון (YouTube / Vimeo / כתובת וידאו)<input data-hu-item="updates" [attr.data-i]="i" data-key="videoUrl" [value]="item['videoUrl'] || ''" placeholder="https://..."></label><label class="wide">תוכן העדכון<textarea rows="4" data-hu-item="updates" [attr.data-i]="i" data-key="text" placeholder="כתבו מה השתנה ואיך התורמים יכולים להשתתף" [defaultValue]="item['text'] || ''"></textarea></label><label class="wide hu-inline-toggle"><span>נעץ בראש רשימת העדכונים<small>עדכון חשוב יוצג לפני האחרים</small></span><input type="checkbox" role="switch" data-hu-item="updates" [attr.data-i]="i" data-key="pinned" [checked]="!!item['pinned']"></label></div><div class="hu-rich-photo"><div class="hu-reward-photo-thumb">@if (image) {<img [attr.src]="image.ref ? (media.resolve(image.ref) || image.src) : image.src" [attr.data-ham-media-ref]="image.ref" alt="">} @else {<span>▧</span>}</div><div><strong>תמונת העדכון</strong><small>אופציונלי</small></div><label class="hu-reward-file-button" [attr.for]="'hu-update-file-' + i">העלאת תמונה</label><input [id]="'hu-update-file-' + i" type="file" accept="image/png,image/jpeg,image/webp" class="hu-visually-hidden-file" [attr.data-hu-update-image]="i">@if (image) {<button type="button" class="hu-action" [attr.data-hu-update-image-clear]="i" title="הסר תמונה">✕</button>}</div></div>`
})
export class UpdateEditorComponent implements OnInit {
  @Input({ required: true }) item: Json = {};
  @Input({ required: true }) i = 0;
  readonly media = inject(MediaStoreService);
  readonly trash = TRASH_ICON;
  private readonly cards = inject(CampaignCardsService);
  private readonly campaignState = inject(CampaignStateService);
  /** The public update card, scaled down (UpdatePreviewComponent); remounted while typing. */
  @ViewChild('preview', { static: true }) private preview!: ElementRef<HTMLElement>;
  image: ItemImage | null = null;
  ngOnInit(): void {
    this.cards.mount(this.preview.nativeElement, UpdatePreviewComponent, { item: this.item, cfg: this.campaignState.current['content'].updates });
    this.image = this.item['image'] ? itemImage(this.item['image'], ref => this.media.src(ref)) : null;
  }
}
