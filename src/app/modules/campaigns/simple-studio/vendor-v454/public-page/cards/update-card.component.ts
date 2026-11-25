import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation, inject } from '@angular/core';
import { CardData, asText, cardDate } from './card-format';
import { CardMediaService } from './card-media.service';

/**
 * Campaign update card (old core `updatesCardMarkup`, `HamonymContentCards.updateCard`). The
 * whole card opens the update: `data-ham-update-index` and `data-video-url` are read by the
 * updates handlers.
 */
@Component({
  selector: 'article[ham-update-card]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ham-update-card',
    tabindex: '0',
    role: 'button',
    '[class.hc-card]': 'collection',
    '[attr.aria-label]': "'פתיחת העדכון ' + (item['title'] || 'עדכון')",
    '[attr.data-video-url]': "item['videoUrl'] || item['video'] || ''",
    '[attr.data-ham-update-index]': 'indexText'
  },
  template: `@if (cfg['showImages'] !== false) {<div class="ham-update-photo" [class.ham-update-photo-fallback]="!hasImage">@if (hasImage) {<img [attr.src]="image" alt="" loading="lazy">} @else {<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m6 16 4-4 3 3 2-2 3 3"/><circle cx="16" cy="9" r="1.5"/></svg>}</div>}<div class="ham-update-copy">@if (cfg['showDates'] !== false) {<small class="ham-update-date">{{ date || 'עדכון הקמפיין' }}</small>}@if (cfg['showPinned'] !== false && item['pinned']) {<span class="ham-update-pin">★ עדכון נעוץ</span>}<h3>{{ item['title'] || 'עדכון ללא כותרת' }}</h3>@if (cfg['showExcerpts'] !== false && item['text']) {<p class="ham-update-text">{{ item['text'] }}</p>}</div>`
})
export class UpdateCardComponent {
  private readonly media = inject(CardMediaService);
  @Input() item: CardData = {};
  @Input() cfg: CardData = {};
  @Input() index: unknown = undefined;
  @Input() collection = false;

  get hasImage(): boolean { return this.cfg['showImages'] !== false && !!this.item['image']; }
  get image(): string { return this.media.safe(this.item['image']); }
  get date(): string { return cardDate({ date: this.item['date'] }); }
  /** The record's position in the source list, when the list was filtered or sorted. */
  get indexText(): string { return asText(this.item['_sourceIndex'] ?? this.index); }
}
