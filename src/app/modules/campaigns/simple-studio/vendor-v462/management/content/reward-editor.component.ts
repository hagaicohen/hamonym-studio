import { ChangeDetectionStrategy, Component, ElementRef, Input, OnInit, ViewChild, inject } from '@angular/core';
import { Json, ManagementModelService } from '../management-model.service';
import { StaticHtmlDirective } from '../fields';
import { MediaStoreService } from '../../media/media-store.service';
import { contentContext } from './content-context';
import { TRASH_ICON } from './content-markup';
import { CampaignCardsService } from '../../public-page/campaign-cards.service';
import { RewardMiniComponent } from './reward-mini.component';
import { ItemImage, itemImage } from './item-image';

/**
 * Full editor of one reward (old engine `rewardManagerForm`, one item). Field edits go through
 * the `data-hu-item` document handlers; the scaled-down card (`[data-hu-reward-preview]`,
 * RewardMiniComponent) is mounted again by them while typing, and the media upload service patches the photo row.
 * Rendered once per redraw, from the item as it is then.
 */
@Component({
  selector: 'section[ham-reward-editor]',
  standalone: true,
  imports: [StaticHtmlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-reward-editor', '[attr.data-hu-collection-index]': 'i' },
  template: `<div class="hu-reward-editor-form"><div class="hu-reward-editor-header"><strong>תשורה {{ i + 1 }}</strong><button type="button" class="hu-reward-delete" data-hu-remove-item="rewards" [attr.data-i]="i" title="הסר תשורה" [attr.aria-label]="'הסר תשורה ' + (i + 1)" [hamStaticHtml]="trash"></button></div><section class="hu-race-mini-section hu-reward-mini-section" aria-label="תצוגה מקדימה של התשורה"><div class="hu-race-mini-head"><strong>תצוגה מקדימה</strong><small>אותו עיצוב כמו בקמפיין, בקנה מידה קטן</small></div><div #mini [attr.data-hu-reward-preview]="i"></div></section><section class="hu-reward-editor-group"><div class="hu-reward-group-head"><strong>פרטי התשורה</strong><small>השם, הסכום והתיאור שיופיעו בכרטיס.</small></div><div class="hu-fields"><div class="hu-field"><label>שם התשורה</label><input type="text" data-hu-item="rewards" [attr.data-i]="i" data-key="name" [value]="item['name'] || ''" placeholder="למשל: מארז תודה אישי"></div><div class="hu-field"><label>סכום התרומה (₪)</label><input type="text" data-money="1" inputmode="decimal" data-hu-item="rewards" [attr.data-i]="i" data-key="amount" [value]="amount"></div><div class="hu-field full"><label>תיאור קצר</label><textarea rows="3" data-hu-item="rewards" [attr.data-i]="i" data-key="description" placeholder="מה מקבלים בתשורה" [defaultValue]="item['description'] || ''"></textarea></div></div></section><section class="hu-reward-editor-group"><div class="hu-reward-group-head"><strong>תמונת התשורה</strong><small>תמונה ברורה עוזרת להבין מיד מה מקבלים.</small></div><div class="hu-reward-photo-upload">@if (image) {<span class="hu-reward-photo-thumb"><img [attr.src]="image.ref ? (media.resolve(image.ref) || image.src) : image.src" [attr.data-ham-media-ref]="image.ref" alt=""></span>} @else {<span class="hu-reward-photo-thumb" aria-hidden="true">◇</span>}<label class="hu-reward-file-button" [attr.for]="'hu-reward-file-' + i"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4"/><circle cx="15.8" cy="8.2" r="1.2"/></svg>בחר תמונה מהמחשב</label><input [id]="'hu-reward-file-' + i" class="hu-visually-hidden-file" type="file" accept="image/png,image/jpeg,image/webp" [attr.data-hu-reward-image]="i" [attr.aria-label]="'בחר קובץ תמונה לתשורה ' + (i + 1)">@if (image) {<button type="button" class="hu-action" [attr.data-hu-clear-reward-image]="i">הסר תמונה</button>}</div><small class="hu-hint">בחרו JPG / PNG / WebP עד 8MB. התמונה מוקטנת ונשמרת בנפרד מהטיוטה.</small></section><div class="hu-reward-featured"><span class="hu-reward-featured-copy"><strong><span class="hu-reward-featured-mark" aria-hidden="true">★</span>תשורה מומלצת</strong><small>הצגת כוכב צהוב עדין על כרטיס התשורה.</small></span><input role="switch" type="checkbox" data-hu-item="rewards" [attr.data-i]="i" data-key="recommended" aria-label="סמן תשורה מומלצת" [checked]="!!item['recommended']"></div><section class="hu-reward-editor-group"><div class="hu-reward-group-head"><strong>מלאי וזמינות</strong><small>אפשר להגביל כמות ולסמן אוטומטית תשורה כאזלה.</small></div><div class="hu-reward-stock" [class.is-limited]="limited" [class.is-unlimited]="!limited"><div class="hu-reward-stock-toggle"><div class="hu-reward-stock-intro"><strong>הגבלת כמות</strong><small>{{ limited ? 'התשורה זמינה עד לגמר המלאי' : 'ללא הגבלה — זמינה לכל התורמים' }}</small></div><label class="hu-reward-stock-switch"><input role="switch" type="checkbox" data-hu-item="rewards" [attr.data-i]="i" data-key="stockEnabled" aria-label="הגבלת כמות התשורות" [checked]="limited"></label></div>@if (limited) {<div class="hu-reward-stock-detail"><label [attr.for]="'hu-reward-stock-' + i">כמות זמינה</label><div class="hu-reward-stock-entry"><input [id]="'hu-reward-stock-' + i" type="number" min="0" step="1" inputmode="numeric" data-hu-item="rewards" [attr.data-i]="i" data-key="quantity" [value]="quantity"><span>יחידות</span></div><small class="hu-reward-stock-help">כשהמלאי מגיע ל־0, הכרטיס יוצג כ״אזל מהמלאי״ ולא יהיה ניתן לבחור בו.</small></div>}</div></section></div>`
})
export class RewardEditorComponent implements OnInit {
  @Input({ required: true }) item: Json = {};
  @Input({ required: true }) i = 0;
  private readonly model = inject(ManagementModelService);
  readonly media = inject(MediaStoreService);
  readonly trash = TRASH_ICON;
  private readonly cards = inject(CampaignCardsService);
  @ViewChild('mini', { static: true }) private mini!: ElementRef<HTMLElement>;
  amount = '';
  quantity = 0;
  limited = false;
  image: ItemImage | null = null;

  ngOnInit(): void {
    const ctx = contentContext(this.model.context), r = this.item;
    this.cards.mount(this.mini.nativeElement, RewardMiniComponent, { item: r, index: this.i });
    this.amount = ctx.huFormatAmount(r['amount'] || 0);
    this.quantity = Math.max(0, Number(r['quantity']) || 0);
    this.limited = !!r['stockEnabled'];
    this.image = r['image'] ? itemImage(r['image'], ref => this.media.src(ref)) : null;
  }
}
