import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation } from '@angular/core';
import { CardData, donationRelativeTime } from './card-format';

/**
 * Options of a donor card (old `HamonymCollection.donorCard` options). The card does not know its
 * host: the public donors block and the manager's donations list render the same card.
 */
export interface DonorCardOptions {
  /** `manager` adds the review attributes (`data-hu-incoming-*`) read by the manager list. */
  context?: 'public' | 'manager';
  index?: unknown;
  showAmount?: boolean;
  anonymousAmountVisible?: boolean;
  showTime?: boolean;
  showDedication?: boolean;
  /** Manager only: the text the list's search matches. */
  searchable?: string;
}

/** One donation (old core `HamonymCollection.donorCard`). */
@Component({
  selector: 'article[ham-donor-card]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'hc-donor-card hc-card hu-donation-card',
    dir: 'rtl',
    '[class.hu-incoming-card]': 'manager',
    '[attr.aria-label]': "'תרומה מאת ' + name",
    '[attr.data-hu-incoming-index]': 'manager ? incomingIndex : null',
    '[attr.data-hu-incoming-name]': "manager ? (item['name'] || '') : null",
    '[attr.data-hu-incoming-date]': 'manager ? rawDate : null',
    '[attr.data-hu-incoming-search]': "manager ? (options.searchable || '') : null",
    '[attr.data-hu-incoming-status]': "manager ? 'approved' : null"
  },
  template: `<div class="hc-donor-top hu-donation-top"><strong class="hc-donor-amount hu-donation-amount">{{ amount }}</strong>@if (options.showTime !== false) {<small class="hc-donor-time hu-donation-when" [attr.title]="rawDate">{{ when || item['time'] || 'ללא תאריך' }}</small>}</div><strong class="hc-donor-name hu-donation-name" [attr.title]="name">{{ name }}</strong><p class="hc-donor-dedication hu-donation-dedication" [attr.title]="dedication">{{ dedication }}</p><span class="hc-donor-heart hu-donation-heart" aria-hidden="true">♡</span>`
})
export class DonorCardComponent {
  @Input() item: CardData = {};
  @Input() options: DonorCardOptions = {};

  get manager(): boolean { return this.options.context === 'manager'; }
  get anonymous(): boolean { return this.item['anonymous'] === true || this.item['isAnonymous'] === true; }
  get name(): string { return this.anonymous ? 'תורם אנונימי' : (this.item['name'] || 'תורם אנונימי'); }
  get rawDate(): string {
    const r = this.item;
    return String(r['donatedAt'] || r['donated_at'] || r['createdAt'] || r['created_at'] || r['timestamp'] || r['date'] || '');
  }
  get when(): string { return donationRelativeTime(this.item); }
  get amount(): string {
    const show = this.options.showAmount !== false && (!this.anonymous || this.options.anonymousAmountVisible !== false);
    return show ? '₪' + (Number(this.item['amount']) || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 }) : '';
  }
  get dedication(): string {
    const show = this.options.showDedication !== false && (!this.anonymous || this.item['dedicationPublic'] === true);
    return show ? String(this.item['dedication'] || '') : '';
  }
  get incomingIndex(): string { return String(Number(this.options.index) || 0); }
}
