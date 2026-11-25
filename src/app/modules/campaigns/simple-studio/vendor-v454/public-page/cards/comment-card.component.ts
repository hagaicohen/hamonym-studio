import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation } from '@angular/core';
import { CardData, cardDate } from './card-format';

/**
 * An approved comment (old core `commentCardMarkup`, `HamonymContentCards.commentCard`). Also the
 * body of a comment row in the manager's review list.
 */
@Component({
  selector: 'article[ham-comment-card]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ham-comment-card', '[class.hc-card]': 'collection' },
  template: `<div class="ham-comment-head">@if (cfg['showAvatars'] !== false) {<span class="ham-comment-avatar" aria-hidden="true">{{ initial }}</span>}<div class="ham-comment-author"><strong>{{ item['name'] || 'תומך בקמפיין' }}</strong>@if (cfg['showDates'] !== false) {<small>{{ date || 'לאחרונה' }}</small>}</div>@if (cfg['showLikes'] === true) {<span class="ham-comment-heart" aria-hidden="true">♥</span>}</div><p>{{ item['text'] || '' }}</p>`
})
export class CommentCardComponent {
  @Input() item: CardData = {};
  @Input() cfg: CardData = {};
  @Input() collection = false;

  get initial(): string { return String(this.item['name'] || 'ת').charAt(0); }
  get date(): string { return cardDate({ date: this.item['date'] }); }
}
