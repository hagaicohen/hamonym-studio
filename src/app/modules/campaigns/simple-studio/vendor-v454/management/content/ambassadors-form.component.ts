import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Json, MODULE_FIELDS, ManagementModelService } from '../management-model.service';
import { MANAGEMENT_FIELDS } from '../fields';
import { MediaStoreService } from '../../media/media-store.service';
import { ItemImage, itemImage } from './item-image';

const MONEY_KEYS = ['amount', 'price', 'target', 'raised'];
interface Field { label: string; key: string; type: string; money: boolean; value: string; }
interface Row { fields: Field[]; photo: ItemImage | null; }

/**
 * Ambassadors block of "תרומות וגיוס" (old engine generic `moduleForm('ambassadors')`):
 * visibility, public personal amounts, and one plain form per ambassador. Rendered once per redraw.
 */
@Component({
  selector: 'ham-mgmt-ambassadors',
  standalone: true,
  imports: [...MANAGEMENT_FIELDS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `<label ham-switch [title]="'הצג שגרירים בקמפיין'" [hint]="'כיבוי יסתיר את הרכיב בלי למחוק את הנתונים'" [path]="'visibility.ambassadors'"></label><div class="hu-callout hu-warning">השגרירים מחוברים לתצוגת הבילדר. את הפריסה והנראות משנים במסך העיצוב. נתוני הדגמה אינם נתוני גיוס אמיתיים.</div><label ham-switch [title]="'פרסום סכומי הגיוס האישיים'" [hint]="'שליטה עסקית בחשיפת סכומי השגרירים והמדדים האישיים בדף הציבורי. כברירת מחדל המידע מוסתר.'" [path]="'modules.ambassadors.publicAmounts'"></label><div class="hu-hint" style="margin:10px 0 14px">קישור לדף שגריר ייפתח רק לאחר הזנת כתובת URL מלאה. סכומים ופסי התקדמות מוסתרים עד להפעלת הרשאת החשיפה.</div>@for (row of rows; track $index; let i = $index) {<div class="hu-item"><div class="hu-item-head"><span>פריט {{ i + 1 }}</span><button class="hu-action danger" type="button" data-hu-remove-item="ambassadors" [attr.data-i]="i">הסר</button></div><div class="hu-fields">@for (f of row.fields; track f.key) {<div class="hu-field" [class.full]="f.type === 'textarea'"><label>{{ f.label }}</label>@if (f.type === 'textarea') {<textarea rows="3" data-hu-item="ambassadors" [attr.data-i]="i" [attr.data-key]="f.key" [defaultValue]="f.value"></textarea>} @else {<input [attr.type]="f.money ? 'text' : f.type" [attr.data-money]="f.money ? '1' : null" [attr.inputmode]="f.money ? 'decimal' : null" [value]="f.value" data-hu-item="ambassadors" [attr.data-i]="i" [attr.data-key]="f.key">}</div>}<div class="hu-field full hu-ambassador-photo-row"><label>תמונת שגריר</label><div class="hu-ambassador-photo-actions">@if (row.photo) {<img [attr.src]="row.photo.src" [attr.data-ham-media-ref]="row.photo.ref" alt="" class="hu-ambassador-photo-thumb">} @else {<span class="hu-ambassador-photo-thumb hu-no-photo">👤</span>}<label class="hu-reward-file-button" [attr.for]="'hu-ambassador-file-' + i">בחר תמונה מהמחשב</label><input [id]="'hu-ambassador-file-' + i" class="hu-visually-hidden-file" type="file" accept="image/png,image/jpeg,image/webp" [attr.data-hu-ambassador-image]="i">@if (row.photo) {<button class="hu-action" type="button" [attr.data-hu-ambassador-image-clear]="i">הסר תמונה</button>}</div></div></div></div>}<div class="hu-row"><button class="hu-action" type="button" data-hu-add-item="ambassadors">＋ הוסף פריט</button></div>`
})
export class AmbassadorsFormComponent implements OnInit {
  private readonly model = inject(ManagementModelService);
  private readonly media = inject(MediaStoreService);
  rows: Row[] = [];
  ngOnInit(): void {
    const fmt = (v: unknown) => this.model.context.huFormatAmount(v);
    this.rows = this.model.partsFor('ambassadors').map((x: Json): Row => ({
      fields: MODULE_FIELDS['ambassadors'].map(([label, key, type]) => {
        const money = type === 'number' && MONEY_KEYS.includes(key);
        return { label, key, type, money, value: money ? fmt(x[key]) : String(x[key] ?? '') };
      }),
      photo: x['photo'] ? itemImage(x['photo'], ref => this.media.src(ref)) : null
    }));
  }
}
