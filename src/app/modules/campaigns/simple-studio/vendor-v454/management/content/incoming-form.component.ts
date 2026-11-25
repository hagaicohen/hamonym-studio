import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MANAGEMENT_FIELDS } from '../fields';
import { IncomingComponent, IncomingType } from './incoming.component';

/** Comments (content page) or donors (fundraising page): visibility, intro and the review list. */
@Component({
  selector: 'ham-mgmt-incoming',
  standalone: true,
  imports: [...MANAGEMENT_FIELDS, IncomingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `@let comments = type === 'comments';
<label ham-switch [title]="comments ? 'הצג תגובות בקמפיין' : 'הצג תורמים בקמפיין'" [hint]="comments ? 'רק תגובות שאושרו יופיעו בדף הציבורי' : 'תורמים מגיעים מפעילות הקמפיין'" [path]="'visibility.' + type"></label><div class="hu-module-intro"><div><strong>ניהול {{ comments ? 'תגובות' : 'תורמים' }}</strong><small>{{ comments ? 'ניתן לאשר, לבטל אישור או למחוק. אין עריכת תוכן התגובה.' : 'רשומות תרומה שהתקבלו. לא יוצרים תורמים באופן ידני.' }}</small></div><button type="button" class="hu-action primary" [attr.data-hu-edit]="type">עיצוב הרכיב</button></div><section ham-incoming [type]="type"></section>`
})
export class IncomingFormComponent {
  @Input({ required: true }) type: IncomingType = 'comments';
}
